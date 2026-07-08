// One-off diagnostic, not part of the test suite or npm scripts. Run manually with:
//   node backend/scripts/debug-embedding-scores.js
// Prints raw cosine similarity scores (no threshold filtering) so we can see the real
// numbers gemini-embedding-001 produces, instead of just pass/fail from a 0.75 cutoff.
require('dotenv').config();
const { loadKnowledgeBase, cosineSimilarity } = require('../services/retriever');
const { embedText } = require('../services/llm');

const QUERIES = [
  'where is the nearest accessible restroom',
  'is there somewhere my kid can go pee around here',
  'if I step out for a bit can I get back in later',
  'which way in is currently shut down for repairs',
  "what will the weather be like during tomorrow's match"
];

async function main() {
  const kb = await loadKnowledgeBase();
  const docs = kb.docIndex.filter((doc) => doc.venueId === 'venue_01');

  for (const query of QUERIES) {
    // eslint-disable-next-line no-await-in-loop
    const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');

    const scored = docs
      .map((doc) => ({ type: doc.type, text: doc.text, score: cosineSimilarity(queryEmbedding, doc.embedding) }))
      .sort((a, b) => b.score - a.score);

    console.log(`Query: "${query}"`);
    for (const doc of scored.slice(0, 4)) {
      console.log(`  ${doc.score.toFixed(4)}  [${doc.type}]  ${doc.text}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
