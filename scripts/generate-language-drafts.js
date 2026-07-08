// One-time offline tool — NOT part of the running app, not wired into any route.
// Generates FIRST-DRAFT translations of the safety-critical trigger list and the retrieval
// keyword categories for new target languages, using Gemini. This is a draft only: nothing
// it writes is consumed at runtime. A human must review backend/scripts/output/language-drafts.json
// and manually merge corrected entries into backend/data/venues.json and
// backend/services/retriever.js — see the "Expanding Language Coverage" process in the README.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../backend/services/llm');
const { loadKnowledgeBase } = require('../backend/services/retriever');

// Deliberately NOT the same model constant the running app uses (see llm.js) — this is a
// one-time offline generation task, not a live user-facing call, so it's fine (and, given
// free-tier per-model daily quotas, often necessary) to pick whichever Gemini model is
// available and adequate for a straightforward translation task.
const DRAFT_MODEL = 'gemini-2.5-flash-lite';

const TARGET_LANGUAGES = {
  de: 'German',
  it: 'Italian',
  ar: 'Arabic',
  ja: 'Japanese'
};

// The same keyword categories retriever.js already expands for en/es/pt/fr (see
// RESTROOM_KEYWORDS, GATE_KEYWORDS, WHEELCHAIR_KEYWORDS, TRANSIT_KEYWORDS, POLICY_KEYWORDS,
// GATE_STATUS_KEYWORDS in backend/services/retriever.js). Described here in plain English
// for the translation prompt, not imported directly, since those constants are internal
// implementation details of the retriever, not a public contract for this script to depend on.
const ENGLISH_KEYWORD_CATEGORIES = {
  restroom: 'restroom, bathroom, toilet',
  gate: 'gate (a stadium entrance/gate)',
  wheelchairAccessible: 'wheelchair accessible',
  transit: 'transit, train, bus, metro, last departure',
  policy: 'policy',
  gateStatusOpen: 'open (as a gate status)',
  gateStatusClosed: 'closed (as a gate status)',
  gateStatusRestricted: 'restricted (as a gate status)',
  gateStatusDelayed: 'delayed (as a gate status)'
};

function buildPrompt(languageName, englishTriggers, keywordCategories) {
  return `You are helping build a stadium volunteer assistant that supports multiple languages.

Translate the following into natural, commonly-used ${languageName} that a stadium volunteer
assistant needs to recognize from a fan's spoken or typed question. Prioritize how a real
person would actually phrase these, not stiff literal word-for-word translations.

1. EMERGENCY_TRIGGERS: short phrases indicating a medical emergency, safety threat, lost/missing
   person, or other urgent situation. Provide one natural ${languageName} equivalent per input
   phrase, same order, same array length as the input.

2. KEYWORD_CATEGORIES: short venue-related terms used only for search/retrieval matching (not
   safety-critical). For each category, provide 2-4 natural ${languageName} synonyms/variants as
   a single space-separated string.

Respond with STRICT JSON only, no explanation, in exactly this shape:
{
  "triggers": ["...", "...", ...],
  "keywords": {
    "restroom": "word1 word2 word3",
    "gate": "word1 word2",
    "wheelchairAccessible": "word1 word2 word3",
    "transit": "word1 word2 word3",
    "policy": "word1",
    "gateStatusOpen": "word1",
    "gateStatusClosed": "word1",
    "gateStatusRestricted": "word1",
    "gateStatusDelayed": "word1"
  }
}

EMERGENCY_TRIGGERS (English, translate each): ${JSON.stringify(englishTriggers)}

KEYWORD_CATEGORIES (English reference meaning for each key): ${JSON.stringify(keywordCategories)}`;
}

async function generateDraftForLanguage(model, code, languageName, englishTriggers) {
  const prompt = buildPrompt(languageName, englishTriggers, ENGLISH_KEYWORD_CATEGORIES);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

  if (!Array.isArray(parsed.triggers) || parsed.triggers.length !== englishTriggers.length) {
    throw new Error(
      `Draft for ${languageName} (${code}) returned ${parsed.triggers?.length ?? 0} triggers, expected ${englishTriggers.length}`
    );
  }

  return { language: languageName, code, ...parsed };
}

async function main() {
  const client = getClient();
  const model = client.getGenerativeModel({ model: DRAFT_MODEL });

  const kb = loadKnowledgeBase();
  const englishTriggers = kb.escalationTriggers.en;

  const drafts = {};

  for (const [code, languageName] of Object.entries(TARGET_LANGUAGES)) {
    console.log(`Generating draft for ${languageName} (${code})...`);
    drafts[code] = await generateDraftForLanguage(model, code, languageName, englishTriggers);
  }

  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'language-drafts.json');
  fs.writeFileSync(outputPath, JSON.stringify(drafts, null, 2));
  console.log(`\nDraft written to ${outputPath}`);
  console.log('This is a DRAFT only — a human must review every trigger phrase before merging');
  console.log('anything into backend/data/venues.json or backend/services/retriever.js.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate language drafts:', err);
  process.exitCode = 1;
});
