const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at',
  'for', 'and', 'or', 'do', 'does', 'my', 'me', 'i', 'it', 'this', 'that', 'there',
  'where', 'when', 'what', 'how', 'can', 'could', 'would', 'should', 'near', 'nearest'
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Multilingual keyword expansions for each document category, so a Spanish/Portuguese/
// French query can retrieve the same (English-authored) fact doc. These are fixed keyword
// synonyms added to searchText only — they never touch the underlying fact text/data, so
// the LLM still only ever sees the original, versioned venue facts.
const RESTROOM_KEYWORDS = 'restroom bathroom toilet baño banheiro toilettes';
const GATE_KEYWORDS = 'gate puerta portão porte';
const WHEELCHAIR_KEYWORDS =
  'wheelchair accessible silla de ruedas accesible cadeira de rodas acessível fauteuil roulant accessible';
const TRANSIT_KEYWORDS = 'transit train bus metro tren autobús trem ônibus métro last departure última salida última partida dernier départ';
const POLICY_KEYWORDS = 'policy política politica';
const GATE_STATUS_KEYWORDS = {
  open: 'open abierto aberto ouvert',
  closed: 'closed cerrado fechado fermé'
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

// Precomputes each doc's token set once, at knowledge-base-load time, rather than
// re-tokenizing every document's searchText on every retrieve() call.
function buildDocIndex(venue) {
  return buildDocs(venue).map((doc) => ({ ...doc, tokens: new Set(tokenize(doc.searchText)) }));
}

function loadKnowledgeBase(kbPath = path.join(__dirname, '..', 'data', 'venues.json')) {
  const raw = fs.readFileSync(kbPath, 'utf-8');
  const data = JSON.parse(raw);
  const docIndex = data.venues.flatMap((venue) => module.exports.buildDocIndex(venue));
  return { ...data, docIndex };
}

function scoreDocTokens(queryTokens, docTokens) {
  let matches = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) matches += 1;
  }
  return matches === 0 ? 0 : matches / queryTokens.length;
}

function retrieve(query, options = {}) {
  const { venueId, topK = 3, kb } = options;
  const knowledgeBase = kb || loadKnowledgeBase();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const candidateDocs = venueId
    ? knowledgeBase.docIndex.filter((doc) => doc.venueId === venueId)
    : knowledgeBase.docIndex;

  const scored = candidateDocs
    .map((doc) => ({ ...doc, score: scoreDocTokens(queryTokens, doc.tokens) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    // eslint-disable-next-line no-unused-vars
    .map(({ tokens, ...doc }) => doc);

  return scored.slice(0, topK);
}

module.exports = { retrieve, loadKnowledgeBase, tokenize, buildDocIndex };
