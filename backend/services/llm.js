const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = `You are a grounding-only assistant for FIFA World Cup 2026 volunteers.
Rules you must always follow:
1. Only state facts present in the provided CONTEXT block. Never invent venue details,
   gate numbers, times, or policies not present in CONTEXT.
2. If CONTEXT does not contain the answer, say so plainly and suggest the volunteer
   check with venue staff directly. Do not guess.
3. Respond in the requested output language, translating naturally, not literally.
4. Keep responses concise - a volunteer needs to relay this to a fan quickly.
5. Never generate medical, legal, or security advice. Those are handled by escalation,
   not generation.`;

const BRIEFING_SYSTEM_PROMPT = `You are writing a short daily shift briefing for FIFA World Cup 2026
volunteers at a specific venue.
Rules you must always follow:
1. Only use facts present in the provided VENUE_FACTS block. Never invent gate numbers,
   closures, or times not present there.
2. Prioritize anything unusual: closed gates, non-accessible facilities, early last-departure
   transit times.
3. Keep it under 150 words, in clear plain language, organized as short sentences.
4. Do not include medical, legal, or security advice.`;

const CLASSIFIER_MODEL = 'gemini-flash-latest';
const ANSWER_MODEL = 'gemini-flash-latest';
const EMBEDDING_MODEL = 'gemini-embedding-001';

let cachedClient = null;

/**
 * Returns a cached GoogleGenerativeAI client, constructing it lazily from
 * process.env.GEMINI_API_KEY on first use.
 * @returns {GoogleGenerativeAI}
 * @throws {Error} if GEMINI_API_KEY is not set
 */
function getClient() {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    cachedClient = new GoogleGenerativeAI(apiKey);
  }
  return cachedClient;
}

function buildContextText(context) {
  if (!context || context.length === 0) return '(no relevant context found)';
  return context.map((doc) => `- ${doc.text}`).join('\n');
}

/**
 * Generates a grounded answer for a fan's query, refusing to state anything not
 * present in the provided context (see SYSTEM_PROMPT).
 * @param {object} params
 * @param {string} params.query - the fan's question, already sanitized
 * @param {Array<object>} params.context - retrieved fact docs to ground the answer in
 * @param {string} [params.outputLanguage] - BCP-47 tag for the response language (default 'en')
 * @returns {Promise<string>} the generated answer text
 */
async function generateAnswer({ query, context, outputLanguage }) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: ANSWER_MODEL,
    systemInstruction: SYSTEM_PROMPT
  });

  const userTurn = `CONTEXT:\n${buildContextText(context)}\n\nQUERY: ${query}\n\nOUTPUT_LANGUAGE: ${
    outputLanguage || 'en'
  }`;

  const result = await model.generateContent(userTurn);
  return result.response.text().trim();
}

/**
 * Asks the LLM to judge whether an ambiguous query describes an urgent/escalation
 * situation. Fails closed to ESCALATE if the model call errors or returns unparseable
 * output, since an uncertain safety judgment must never silently resolve to "it's fine".
 * @param {string} query - the fan's question, already sanitized
 * @returns {Promise<{category: 'ESCALATE'|'GROUNDED_FACT', reasoning: string}>}
 */
async function classifyAmbiguous(query) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: CLASSIFIER_MODEL });

  const prompt = `You are assisting a safety classifier for a stadium volunteer assistant.
Given the fan question below, decide if it is:
- "ESCALATE": describes or implies a medical emergency, safety threat, lost/missing person, or other urgent situation
- "GROUNDED_FACT": a routine factual or policy question

Respond ONLY with strict JSON in this exact shape: {"category": "ESCALATE" or "GROUNDED_FACT", "reasoning": "<short reason>"}

QUESTION: ${query}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) {
    // Fail closed: an uncertain safety judgment must never resolve to "assume it's fine" —
    // whether the model call itself failed (network error, quota limit, outage) or its
    // response was unparseable, both are caught here. Defaulting to ESCALATE costs a human
    // a few seconds; defaulting to GROUNDED_FACT, or letting the request crash with no
    // answer and no escalation guidance, could mean a missed emergency.
    return {
      category: 'ESCALATE',
      reasoning: 'LLM classification could not be completed; defaulting to escalation as a safety precaution'
    };
  }
}

function buildVenueFactsText(venue) {
  const lines = [];

  for (const gate of venue.gates || []) {
    lines.push(
      `Gate ${gate.id}: ${gate.status}, wheelchair accessible: ${gate.wheelchairAccessible}. ${
        gate.notes || ''
      }`.trim()
    );
  }
  for (const restroom of venue.restrooms || []) {
    lines.push(
      `Restroom at ${restroom.location}, wheelchair accessible: ${restroom.wheelchairAccessible}.`
    );
  }
  for (const transitOption of venue.transit || []) {
    lines.push(
      `${transitOption.mode} (${transitOption.line}): last departure at ${transitOption.lastDeparture}.`
    );
  }
  for (const policy of venue.policies || []) {
    lines.push(`Policy - ${policy.topic}: ${policy.answer}`);
  }

  return lines.join('\n');
}

// gemini-embedding-001 supports task-specific embeddings: asking for RETRIEVAL_DOCUMENT vs
// RETRIEVAL_QUERY (rather than the untyped default) meaningfully widens the similarity gap
// between a query and its matching fact vs. an unrelated one, which is what retrieval's
// cosine-similarity threshold depends on.
/**
 * Computes a semantic embedding vector for text via gemini-embedding-001.
 * @param {string} text - the text to embed (a fact doc or a fan's query)
 * @param {string} taskType - Gemini task-type hint, e.g. 'RETRIEVAL_DOCUMENT' or 'RETRIEVAL_QUERY'
 * @returns {Promise<number[]>} the embedding vector
 */
async function embedText(text, taskType) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { role: 'user', parts: [{ text }] },
    taskType
  });
  return result.embedding.values;
}

/**
 * Generates a short daily shift briefing for volunteers at a specific venue, grounded
 * only in that venue's current facts (see BRIEFING_SYSTEM_PROMPT).
 * @param {object} params
 * @param {object} params.venue - a single venue entry from venues.json
 * @returns {Promise<string>} the generated briefing text
 */
async function generateBriefing({ venue }) {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: ANSWER_MODEL,
    systemInstruction: BRIEFING_SYSTEM_PROMPT
  });

  const prompt = `VENUE_FACTS:\n${buildVenueFactsText(
    venue
  )}\n\nWrite today's volunteer shift briefing for ${venue.name}.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

module.exports = {
  generateAnswer,
  classifyAmbiguous,
  generateBriefing,
  embedText,
  getClient,
  SYSTEM_PROMPT,
  BRIEFING_SYSTEM_PROMPT,
  EMBEDDING_MODEL
};
