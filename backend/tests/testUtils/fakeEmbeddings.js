// Deterministic, dependency-free stand-in for the real Gemini embeddings API in unit
// tests. It has no real semantic understanding — it buckets text into a handful of
// concept dimensions (restroom/gate/transit/policy/wheelchair) using multilingual keyword
// lists, plus a small bag-of-words hash tail for incidental lexical overlap. This is enough
// to make cosine similarity in tests discriminate correctly between relevant/irrelevant
// docs and exercise retrieve()'s scoring/sorting/threshold mechanics. Real cross-language
// semantic accuracy is proven separately by the RUN_LIVE_TESTS-gated suite against the
// real embeddings API, not by this fake.

const CONCEPT_KEYWORDS = {
  restroom: [
    'restroom', 'bathroom', 'toilet', 'toilette', 'baño', 'bano', 'banheiro',
    'wc', 'badezimmer', 'bagno', 'servizi', 'دورة مياه', 'حمام', 'مرحاض', 'トイレ', 'お手洗い'
  ],
  gate: [
    'gate', 'puerta', 'portão', 'portao', 'porte', 'tor', 'eingang', 'cancello', 'porta',
    'بوابة', 'مدخل', 'ゲート', '入口'
  ],
  transit: [
    'transit', 'train', 'bus', 'metro', 'tren', 'autobús', 'autobus', 'trem', 'ônibus', 'onibus',
    'métro', 'zug', 'u-bahn', 'treno', 'مواصلات', 'قطار', 'حافلة', '電車', '地下鉄', '終電',
    'departure', 'última salida', 'ultima salida', 'última partida', 'ultima partida',
    'dernier départ', 'letzte abfahrt'
  ],
  policy: [
    'policy', 'política', 'politica', 'regeln', 'regolamento', 'سياسة', 'ルール',
    're-entry', 'reentry', 're-enter', 'reenter'
  ],
  wheelchair: [
    'wheelchair', 'accessible', 'silla de ruedas', 'accesible', 'cadeira de rodas',
    'acessível', 'acessivel', 'fauteuil roulant', 'barrierefrei', 'rollstuhlgerecht',
    'sedia a rotelle', 'accessibile', 'متاح للكراسي المتحركة', '車椅子', 'バリアフリー'
  ]
};

const CONCEPTS = Object.keys(CONCEPT_KEYWORDS);
const CONCEPT_WEIGHT = 10;
// The "wheelchair accessible: true/false" clause appears in every gate/restroom doc's text
// regardless of relevance, so it gets a much smaller weight than the primary category
// concepts — otherwise a short bare-category query (no companion "accessible" word) gets
// diluted below threshold by a boilerplate phrase that isn't the thing being asked about.
const SECONDARY_CONCEPT_WEIGHT = 2;
const HASH_BUCKETS = 16;

const CJK_REGEX = /[぀-ヿ㐀-䶿一-鿿]/;

function hashWord(word) {
  let hash = 0;
  for (let i = 0; i < word.length; i += 1) {
    hash = (hash * 31 + word.charCodeAt(i)) % HASH_BUCKETS;
  }
  return hash;
}

// Mirrors production's own CJK-bigram fallback (japaneseBigrams in retriever.js): CJK text
// has no whitespace to split on, so a plain word-split would collapse an entire sentence
// into a single hash "word" and unfairly starve it of lexical-overlap signal relative to a
// whitespace-split sentence in another language.
function extractWords(text) {
  const lower = text.toLowerCase();
  if (CJK_REGEX.test(lower)) {
    const chars = lower.replace(/\s+/g, '');
    const bigrams = [];
    for (let i = 0; i < chars.length - 1; i += 1) {
      bigrams.push(chars.slice(i, i + 2));
    }
    return bigrams.length > 0 ? bigrams : [chars];
  }
  return lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function fakeEmbed(text) {
  const lower = (text || '').toLowerCase();
  const conceptVector = CONCEPTS.map((concept) => {
    const weight = concept === 'wheelchair' ? SECONDARY_CONCEPT_WEIGHT : CONCEPT_WEIGHT;
    return CONCEPT_KEYWORDS[concept].some((keyword) => lower.includes(keyword)) ? weight : 0;
  });

  const hashVector = new Array(HASH_BUCKETS).fill(0);
  extractWords(text).forEach((word) => {
    hashVector[hashWord(word)] += 1;
  });

  return [...conceptVector, ...hashVector];
}

module.exports = { fakeEmbed };
