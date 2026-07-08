const fs = require('fs');
const path = require('path');
const { embedText } = require('./llm');

const EMBEDDINGS_PATH = path.join(__dirname, '..', 'data', 'venues.embeddings.json');

// Filler/function words to strip before tokenizing, so token comparisons reflect meaningful
// content words instead of grammar. English-only stopwords would silently penalize
// natural non-English sentences relative to their English equivalents (extra unmatched
// filler tokens would otherwise leak into matching) — so each supported language's equivalents of
// "where/is/the/nearest/what/how" etc. are included too. Still used by classifier.js's
// deterministic escalation-trigger matching, which stays keyword/token-based on purpose.
const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at',
  'for', 'and', 'or', 'do', 'does', 'my', 'me', 'i', 'it', 'this', 'that', 'there',
  'where', 'when', 'what', 'how', 'can', 'could', 'would', 'should', 'near', 'nearest',
  // Spanish
  'un', 'una', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'es', 'son', 'esta', 'está',
  'donde', 'dónde', 'cuando', 'cuándo', 'que', 'qué', 'como', 'cómo', 'puede', 'puedo',
  'mas', 'más', 'cerca', 'cercano', 'cercana',
  // Portuguese
  'um', 'uma', 'o', 'os', 'as', 'do', 'da', 'e', 'é', 'são', 'fica', 'ficam',
  'onde', 'quando', 'pode', 'posso',
  'mais', 'perto', 'próximo', 'próxima', 'proximo', 'proxima',
  // French
  'une', 'le', 'les', 'du', 'des', 'et', 'où', 'quand', 'comment', 'peut', 'puis',
  'plus', 'proche', 'près', 'pres',
  // German
  'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'wo', 'wann', 'was', 'wie',
  'kann', 'nächste', 'nächster', 'nächstes', 'und', 'zu', 'gibt', 'es',
  // Italian
  'il', 'lo', 'i', 'gli', 'uno', 'è', 'sono', 'dove', 'quando', 'cosa', 'come',
  'posso', 'può', 'più', 'vicino', 'vicina', 'e',
  // Arabic — reviewed to the best of non-native confidence; flagged in the README as an
  // area where a native speaker's review would carry more weight than the other languages.
  'أين', 'متى', 'كيف', 'ماذا', 'ما', 'هل', 'أقرب', 'يمكن', 'يمكنني', 'و'
]);

// Arabic's definite article ("the") attaches directly as a prefix to the noun itself
// (ال, "al-") rather than appearing as a separate word the way Spanish "el" or
// French "le" do — so "alHammam" ("the bathroom") and "Hammam" ("bathroom") are different
// tokens under exact matching unless this prefix is stripped first. This is a standard,
// well-established Arabic text-processing technique (not a project-specific hack).
const ARABIC_DEFINITE_ARTICLE = 'ال';

function stripArabicDefiniteArticle(token) {
  if (token.length > ARABIC_DEFINITE_ARTICLE.length && token.startsWith(ARABIC_DEFINITE_ARTICLE)) {
    return token.slice(ARABIC_DEFINITE_ARTICLE.length);
  }
  return token;
}

/**
 * Tokenizes text into lowercase, stopword-filtered word tokens for keyword-based
 * matching (used by classifier.js's escalation-trigger detection).
 * @param {string} text - raw input text, any of the supported languages
 * @returns {string[]} normalized tokens with stopwords and punctuation removed
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ؀-ۿ\s]/gi, ' ')
    .split(/\s+/)
    .map(stripArabicDefiniteArticle)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Japanese (and CJK generally) has no whitespace word segmentation, so the whitespace-split
// tokenizer above cannot produce meaningful tokens for it — worse, its regex strips Japanese
// characters entirely (they fall outside a-z0-9À-ÿ), silently discarding them. Detected here
// so classifier.js's matchesTrigger() can route Japanese trigger matching through a different,
// honestly lower-precision fallback instead of a real tokenizer/morphological analyzer.
// Hiragana (U+3040-309F) + Katakana (U+30A0-30FF) + CJK Unified Ideographs / Kanji (U+4E00-9FFF).
const JAPANESE_CHAR_REGEX = /[぀-ヿ一-鿿]/;

/**
 * Detects whether text contains Japanese characters (Hiragana, Katakana, or Kanji),
 * since the whitespace-based tokenizer above cannot produce meaningful tokens for it.
 * @param {string} text
 * @returns {boolean}
 */
function isJapaneseText(text) {
  return JAPANESE_CHAR_REGEX.test(text);
}

function buildDocs(venue) {
  const docs = [];

  for (const gate of venue.gates || []) {
    docs.push({
      type: 'gate',
      venueId: venue.id,
      venueName: venue.name,
      text: `Gate ${gate.id}: status ${gate.status}, wheelchair accessible: ${gate.wheelchairAccessible}. ${gate.notes || ''}`,
      data: gate
    });
  }

  for (const restroom of venue.restrooms || []) {
    docs.push({
      type: 'restroom',
      venueId: venue.id,
      venueName: venue.name,
      text: `Restroom at ${restroom.location}, wheelchair accessible: ${restroom.wheelchairAccessible}.`,
      data: restroom
    });
  }

  for (const transitOption of venue.transit || []) {
    docs.push({
      type: 'transit',
      venueId: venue.id,
      venueName: venue.name,
      text: `${transitOption.mode} (${transitOption.line}): last departure at ${transitOption.lastDeparture}.`,
      data: transitOption
    });
  }

  for (const policy of venue.policies || []) {
    docs.push({
      type: 'policy',
      venueId: venue.id,
      venueName: venue.name,
      text: policy.answer,
      data: policy
    });
  }

  return docs;
}

// Stable key for looking up a doc's precomputed embedding vector, matching the key
// written by scripts/precompute-embeddings.js. Must stay in sync with that script.
/**
 * Builds the stable lookup key for a doc's precomputed embedding vector. Must stay in
 * sync with the key format written by scripts/precompute-embeddings.js.
 * @param {object} doc
 * @returns {string}
 */
function docKey(doc) {
  return `${doc.venueId}::${doc.type}::${doc.text}`;
}

// Precomputes each doc's semantic embedding vector once, at knowledge-base-load time,
// rather than recomputing it on every retrieve() call. The embedding is computed from
// `doc.text` (the plain-language fact, e.g. "Restroom at Section 214 concourse...") —
// embeddings capture meaning directly, so there's no need for keyword-synonym stuffing
// the way literal token overlap once required.
/**
 * Builds the searchable doc index for one venue, attaching a semantic embedding to
 * each fact (gate, restroom, transit, policy). Uses a precomputed vector when available
 * to avoid an API call per doc on every cold start.
 * @param {object} venue - a single venue entry from venues.json
 * @param {object|null} precomputed - map of docKey() -> embedding vector, or null/undefined
 *   to compute embeddings live via the Gemini API
 * @returns {Promise<Array<object>>} the venue's docs, each with an added `embedding` field
 */
async function buildDocIndex(venue, precomputed) {
  const docs = buildDocs(venue);
  const embeddings = await Promise.all(
    docs.map((doc) => {
      const key = docKey(doc);
      // Use precomputed vector when available to avoid an API call on every cold start.
      // venues.json is static, so the vectors never change unless the source data changes
      // (in which case re-run scripts/precompute-embeddings.js and commit the new file).
      if (precomputed && Object.prototype.hasOwnProperty.call(precomputed, key)) {
        return Promise.resolve(precomputed[key]);
      }
      return embedText(doc.text, 'RETRIEVAL_DOCUMENT');
    })
  );
  return docs.map((doc, i) => ({ ...doc, embedding: embeddings[i] }));
}

/**
 * Loads the venue knowledge base from disk and builds the embedded doc index for every
 * venue, using precomputed embeddings when present and falling back to live computation
 * otherwise.
 * @param {string} [kbPath] - path to venues.json
 * @param {string} [embeddingsPath] - path to the precomputed embeddings JSON file
 * @returns {Promise<object>} the parsed venues data plus a flattened `docIndex` array
 */
async function loadKnowledgeBase(
  kbPath = path.join(__dirname, '..', 'data', 'venues.json'),
  embeddingsPath = EMBEDDINGS_PATH
) {
  const raw = fs.readFileSync(kbPath, 'utf-8');
  const data = JSON.parse(raw);

  // Load precomputed embeddings if the file is present (production / after running
  // scripts/precompute-embeddings.js). When absent (local dev without running the
  // build script), fall back to computing embeddings live — which is the original
  // behaviour and keeps local development working without any extra setup step.
  let precomputed = null;
  if (fs.existsSync(embeddingsPath)) {
    precomputed = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
  }

  const docIndexPerVenue = await Promise.all(
    data.venues.map((venue) => module.exports.buildDocIndex(venue, precomputed))
  );
  const docIndex = docIndexPerVenue.flat();
  return { ...data, docIndex };
}

// eslint-disable-next-line no-unused-vars
function stripInternalFields({ embedding, ...doc }) {
  return doc;
}

/**
 * Computes cosine similarity between two embedding vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity in [-1, 1] (0 if either vector has zero magnitude)
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Tuned against real cosine scores from gemini-embedding-001 (see backend/scripts/
// debug-embedding-scores.js): for this small, topically-narrow knowledge base, genuine
// paraphrase matches score as low as ~0.63, while an unrelated query's top (wrong) doc can
// score ~0.64 — the two ranges overlap, so no threshold here can guarantee zero false
// positives. This is set low enough to favor recall (retrieve genuine paraphrases like
// "kid go pee" for "restroom"); precision against irrelevant matches is enforced downstream
// by generateAnswer's grounding system prompt, which refuses to answer from context that
// doesn't actually contain the answer.
const SIMILARITY_THRESHOLD = 0.6;

/**
 * Retrieves the most relevant knowledge-base facts for a query using semantic
 * (embedding-based) similarity search.
 * @param {string} query - the fan's question, any supported language, already sanitized
 * @param {object} [options]
 * @param {string} [options.venueId] - restrict results to this venue if provided
 * @param {number} [options.topK=3] - maximum number of results to return
 * @param {object} [options.kb] - pre-loaded knowledge base (for tests); loads fresh if omitted
 * @returns {Promise<Array<object>>} matching fact documents, highest similarity first
 */
async function retrieve(query, options = {}) {
  const { venueId, topK = 3, kb } = options;
  const knowledgeBase = kb || (await loadKnowledgeBase());

  const candidateDocs = venueId
    ? knowledgeBase.docIndex.filter((doc) => doc.venueId === venueId)
    : knowledgeBase.docIndex;

  if (!query || query.trim().length === 0) return [];

  const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');

  const scored = candidateDocs
    .map((doc) => ({ ...doc, score: cosineSimilarity(queryEmbedding, doc.embedding) }))
    .filter((doc) => doc.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(stripInternalFields);

  return scored.slice(0, topK);
}

module.exports = {
  retrieve,
  loadKnowledgeBase,
  tokenize,
  buildDocIndex,
  docKey,
  isJapaneseText,
  cosineSimilarity,
  SIMILARITY_THRESHOLD
};
