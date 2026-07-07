const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at',
  'for', 'and', 'or', 'do', 'does', 'my', 'me', 'i', 'it', 'this', 'that', 'there',
  'where', 'when', 'what', 'how', 'can', 'could', 'would', 'should', 'near', 'nearest'
]);

function loadKnowledgeBase(kbPath = path.join(__dirname, '..', 'data', 'venues.json')) {
  const raw = fs.readFileSync(kbPath, 'utf-8');
  return JSON.parse(raw);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function buildDocs(venue) {
  const docs = [];

  for (const gate of venue.gates || []) {
    docs.push({
      type: 'gate',
      venueId: venue.id,
      venueName: venue.name,
      text: `Gate ${gate.id}: status ${gate.status}, wheelchair accessible: ${gate.wheelchairAccessible}. ${gate.notes || ''}`,
      searchText: `gate ${gate.id} ${gate.status} ${gate.wheelchairAccessible ? 'wheelchair accessible' : ''} ${gate.notes || ''}`,
      data: gate
    });
  }

  for (const restroom of venue.restrooms || []) {
    docs.push({
      type: 'restroom',
      venueId: venue.id,
      venueName: venue.name,
      text: `Restroom at ${restroom.location}, wheelchair accessible: ${restroom.wheelchairAccessible}.`,
      searchText: `restroom bathroom toilet ${restroom.location} ${restroom.wheelchairAccessible ? 'wheelchair accessible' : ''}`,
      data: restroom
    });
  }

  for (const transitOption of venue.transit || []) {
    docs.push({
      type: 'transit',
      venueId: venue.id,
      venueName: venue.name,
      text: `${transitOption.mode} (${transitOption.line}): last departure at ${transitOption.lastDeparture}.`,
      searchText: `transit train bus metro ${transitOption.mode} ${transitOption.line} last departure`,
      data: transitOption
    });
  }

  for (const policy of venue.policies || []) {
    docs.push({
      type: 'policy',
      venueId: venue.id,
      venueName: venue.name,
      text: policy.answer,
      searchText: `policy ${policy.topic} ${policy.answer}`,
      data: policy
    });
  }

  return docs;
}

function scoreDoc(queryTokens, doc) {
  const docTokens = new Set(tokenize(doc.searchText));
  let matches = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) matches += 1;
  }
  if (matches === 0) return 0;
  return matches / queryTokens.length;
}

function retrieve(query, options = {}) {
  const { venueId, topK = 3, kb } = options;
  const knowledgeBase = kb || loadKnowledgeBase();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const venues = venueId
    ? knowledgeBase.venues.filter((v) => v.id === venueId)
    : knowledgeBase.venues;

  const allDocs = venues.flatMap(buildDocs);

  const scored = allDocs
    .map((doc) => ({ ...doc, score: scoreDoc(queryTokens, doc) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

module.exports = { retrieve, loadKnowledgeBase, tokenize };
