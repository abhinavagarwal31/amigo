const fs = require('fs');
const path = require('path');
const { embedText } = require('./llm');

// Filler/function words to strip before scoring, so token overlap reflects meaningful
// content words instead of grammar. English-only stopwords would silently penalize
// natural non-English sentences relative to their English equivalents (extra unmatched
// filler tokens dilute the match score) — so each supported language's equivalents of
// "where/is/the/nearest/what/how" etc. are included too.
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
// (\u0627\u0644, "al-") rather than appearing as a separate word the way Spanish "el" or
// French "le" do — so "alHammam" ("the bathroom") and "Hammam" ("bathroom") are different
// tokens under exact matching unless this prefix is stripped first. This is a standard,
// well-established Arabic text-processing technique (not a project-specific hack).
const ARABIC_DEFINITE_ARTICLE = '\u0627\u0644';

function stripArabicDefiniteArticle(token) {
  if (token.length > ARABIC_DEFINITE_ARTICLE.length && token.startsWith(ARABIC_DEFINITE_ARTICLE)) {
    return token.slice(ARABIC_DEFINITE_ARTICLE.length);
  }
  return token;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ\u0600-\u06FF\s]/gi, ' ')
    .split(/\s+/)
    .map(stripArabicDefiniteArticle)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Japanese (and CJK generally) has no whitespace word segmentation, so the whitespace-split
// tokenizer above cannot produce meaningful tokens for it — worse, its regex strips Japanese
// characters entirely (they fall outside a-z0-9À-ÿ), silently discarding them. Detected here
// so retrieve()/matchesTrigger() can route Japanese text through a different, honestly
// lower-precision fallback instead of a real tokenizer/morphological analyzer.
// Hiragana (U+3040-309F) + Katakana (U+30A0-30FF) + CJK Unified Ideographs / Kanji (U+4E00-9FFF).
const JAPANESE_CHAR_REGEX = /[\u3040-\u30FF\u4E00-\u9FFF]/;

function isJapaneseText(text) {
  return JAPANESE_CHAR_REGEX.test(text);
}

// Simple, honest fallback for Japanese: character bigram overlap instead of token overlap.
// This is lower-precision than the token-based approach used for the other seven supported
// languages (en/es/pt/fr/de/it/ar) — it can't distinguish word boundaries, so it's more
// prone to partial/spurious matches on shared character sequences. Documented as a known
// limitation in the README rather than silently shipped as equivalent-quality retrieval.
function japaneseBigrams(text) {
  const cleaned = text.replace(/\s+/g, '');
  const bigrams = new Set();
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    bigrams.add(cleaned.slice(i, i + 2));
  }
  return bigrams;
}

// No longer called by retrieve() (superseded by embedding-based cosine similarity), but
// kept side-by-side and unused-lint-suppressed until semantic retrieval is proven out
// against real queries — see the semantic-retrieval spec's step 4 cleanup commit.
// eslint-disable-next-line no-unused-vars
function scoreBigramOverlap(queryBigrams, docBigrams) {
  if (queryBigrams.size === 0) return 0;
  let matches = 0;
  for (const bigram of queryBigrams) {
    if (docBigrams.has(bigram)) matches += 1;
  }
  return matches / queryBigrams.size;
}

// Multilingual keyword expansions for each document category, so a query in any supported
// language can retrieve the same (English-authored) fact doc. These are fixed keyword
// synonyms added to searchText only — they never touch the underlying fact text/data, so
// the LLM still only ever sees the original, versioned venue facts. Japanese entries are
// included here too (harmlessly stripped by tokenize() for the other languages' matching,
// but present in the raw searchText that Japanese bigram scoring reads directly).
const RESTROOM_KEYWORDS =
  'restroom bathroom toilet baño banheiro toilettes Toilette WC Badezimmer bagno servizi دورة مياه حمام مرحاض トイレ お手洗い';
const GATE_KEYWORDS = 'gate puerta portão porte Tor Eingang cancello varco porta بوابة مدخل ゲート 入口';
const WHEELCHAIR_KEYWORDS =
  'wheelchair accessible silla de ruedas accesible cadeira de rodas acessível fauteuil roulant accessible barrierefrei rollstuhlgerecht sedia a rotelle متاح للكراسي المتحركة 車椅子 バリアフリー';
const TRANSIT_KEYWORDS =
  'transit train bus metro tren autobús trem ônibus métro last departure última salida última partida dernier départ ÖPNV Zug U-Bahn letzte Abfahrt trasporti treno ultima corsa مواصلات قطار حافلة آخر رحلة 電車 地下鉄 終電';
const POLICY_KEYWORDS = 'policy política politica Regeln regolamento سياسة ルール';
// Extension point: if venues.json ever uses a gate status value not listed here, add its
// per-language keyword entry too. An unmapped status still degrades safely — buildDocs()
// falls back to the raw status string below — but it loses the translated-keyword boost
// for non-English queries until it's added here.
const GATE_STATUS_KEYWORDS = {
  open: 'open abierto aberto ouvert offen aperto مفتوح 開場',
  closed: 'closed cerrado fechado fermé geschlossen chiuso مغلق 閉場',
  restricted: 'restricted restringido restrito restreint eingeschränkt limitato مقيد 入場制限',
  delayed: 'delayed retrasado atrasado retardé verspätet ritardo متأخر 遅延'
};

function buildDocs(venue) {
  const docs = [];

  for (const gate of venue.gates || []) {
    const statusKeywords = GATE_STATUS_KEYWORDS[gate.status] || gate.status;
    docs.push({
      type: 'gate',
      venueId: venue.id,
      venueName: venue.name,
      text: `Gate ${gate.id}: status ${gate.status}, wheelchair accessible: ${gate.wheelchairAccessible}. ${gate.notes || ''}`,
      searchText: `${GATE_KEYWORDS} ${gate.id} ${statusKeywords} ${
        gate.wheelchairAccessible ? WHEELCHAIR_KEYWORDS : ''
      } ${gate.notes || ''}`,
      data: gate
    });
  }

  for (const restroom of venue.restrooms || []) {
    docs.push({
      type: 'restroom',
      venueId: venue.id,
      venueName: venue.name,
      text: `Restroom at ${restroom.location}, wheelchair accessible: ${restroom.wheelchairAccessible}.`,
      searchText: `${RESTROOM_KEYWORDS} ${restroom.location} ${
        restroom.wheelchairAccessible ? WHEELCHAIR_KEYWORDS : ''
      }`,
      data: restroom
    });
  }

  for (const transitOption of venue.transit || []) {
    docs.push({
      type: 'transit',
      venueId: venue.id,
      venueName: venue.name,
      text: `${transitOption.mode} (${transitOption.line}): last departure at ${transitOption.lastDeparture}.`,
      searchText: `${TRANSIT_KEYWORDS} ${transitOption.mode} ${transitOption.line}`,
      data: transitOption
    });
  }

  for (const policy of venue.policies || []) {
    docs.push({
      type: 'policy',
      venueId: venue.id,
      venueName: venue.name,
      text: policy.answer,
      searchText: `${POLICY_KEYWORDS} ${policy.topic} ${policy.answer}`,
      data: policy
    });
  }

  return docs;
}

// Precomputes each doc's token set, Japanese bigram set, AND semantic embedding vector
// once, at knowledge-base-load time, rather than recomputing any of them on every
// retrieve() call. The embedding is computed from `doc.text` (the plain-language fact,
// e.g. "Restroom at Section 214 concourse...") rather than `searchText` (the
// keyword-stuffed field used for token matching) — embeddings capture meaning, so they
// don't need synonym-list stuffing the way literal token overlap does.
async function buildDocIndex(venue) {
  const docs = buildDocs(venue);
  const embeddings = await Promise.all(docs.map((doc) => embedText(doc.text)));
  return docs.map((doc, i) => ({
    ...doc,
    tokens: new Set(tokenize(doc.searchText)),
    japaneseBigrams: japaneseBigrams(doc.searchText),
    embedding: embeddings[i]
  }));
}

async function loadKnowledgeBase(kbPath = path.join(__dirname, '..', 'data', 'venues.json')) {
  const raw = fs.readFileSync(kbPath, 'utf-8');
  const data = JSON.parse(raw);
  const docIndexPerVenue = await Promise.all(
    data.venues.map((venue) => module.exports.buildDocIndex(venue))
  );
  const docIndex = docIndexPerVenue.flat();
  return { ...data, docIndex };
}

// No longer called by retrieve() (superseded by embedding-based cosine similarity), but
// kept side-by-side and unused-lint-suppressed until semantic retrieval is proven out
// against real queries — see the semantic-retrieval spec's step 4 cleanup commit.
// eslint-disable-next-line no-unused-vars
function scoreDocTokens(queryTokens, docTokens) {
  let matches = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) matches += 1;
  }
  return matches === 0 ? 0 : matches / queryTokens.length;
}

// eslint-disable-next-line no-unused-vars
function stripInternalFields({ tokens, japaneseBigrams: docBigrams, embedding, ...doc }) {
  return doc;
}

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

// Tuned against the same real-world queries used in earlier live testing (see the
// RUN_LIVE_TESTS-gated suite) — high enough to reject unrelated docs, low enough that
// genuine paraphrases of a fact still clear it.
const SIMILARITY_THRESHOLD = 0.75;

async function retrieve(query, options = {}) {
  const { venueId, topK = 3, kb } = options;
  const knowledgeBase = kb || (await loadKnowledgeBase());

  const candidateDocs = venueId
    ? knowledgeBase.docIndex.filter((doc) => doc.venueId === venueId)
    : knowledgeBase.docIndex;

  if (!query || query.trim().length === 0) return [];

  const queryEmbedding = await embedText(query);

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
  isJapaneseText,
  japaneseBigrams,
  cosineSimilarity,
  SIMILARITY_THRESHOLD
};
