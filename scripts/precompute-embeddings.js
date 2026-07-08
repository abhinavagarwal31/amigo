#!/usr/bin/env node
/**
 * scripts/precompute-embeddings.js
 *
 * One-time script to precompute Gemini embedding vectors for every doc in
 * backend/data/venues.json and write them to backend/data/venues.embeddings.json.
 *
 * Run this whenever venues.json changes:
 *   GEMINI_API_KEY=<key> node scripts/precompute-embeddings.js
 *
 * The output file maps each doc's unique identifier (venueId + type + text hash) to
 * its embedding vector. loadKnowledgeBase() in retriever.js reads this file when
 * present, skipping live API calls entirely on cold starts.
 *
 * Commit the resulting venues.embeddings.json to the repo — it contains only float
 * vectors, no keys or PII. If venue data ever becomes dynamic/live in a future version,
 * this caching strategy would need revisiting (e.g. recompute only changed docs).
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const VENUES_PATH = path.join(__dirname, '../backend/data/venues.json');
const OUTPUT_PATH = path.join(__dirname, '../backend/data/venues.embeddings.json');
const EMBEDDING_MODEL = 'gemini-embedding-001';

function buildDocs(venue) {
  const docs = [];
  for (const gate of venue.gates || []) {
    docs.push({
      venueId: venue.id,
      type: 'gate',
      text: `Gate ${gate.id}: status ${gate.status}, wheelchair accessible: ${gate.wheelchairAccessible}. ${gate.notes || ''}`
    });
  }
  for (const restroom of venue.restrooms || []) {
    docs.push({
      venueId: venue.id,
      type: 'restroom',
      text: `Restroom at ${restroom.location}, wheelchair accessible: ${restroom.wheelchairAccessible}.`
    });
  }
  for (const transitOption of venue.transit || []) {
    docs.push({
      venueId: venue.id,
      type: 'transit',
      text: `${transitOption.mode} (${transitOption.line}): last departure at ${transitOption.lastDeparture}.`
    });
  }
  for (const policy of venue.policies || []) {
    docs.push({
      venueId: venue.id,
      type: 'policy',
      text: policy.answer
    });
  }
  return docs;
}

/**
 * Stable identifier for a doc so we can look up its precomputed vector.
 * Must match the key used in retriever.js's loadKnowledgeBase().
 */
function docKey(doc) {
  return `${doc.venueId}::${doc.type}::${doc.text}`;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });

  const raw = fs.readFileSync(VENUES_PATH, 'utf-8');
  const data = JSON.parse(raw);

  const allDocs = data.venues.flatMap(buildDocs);
  console.log(`Found ${allDocs.length} docs across ${data.venues.length} venues.`);

  const embeddings = {};
  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];
    const key = docKey(doc);
    process.stdout.write(`  [${i + 1}/${allDocs.length}] ${doc.venueId} / ${doc.type} ... `);
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text: doc.text }] },
      taskType: 'RETRIEVAL_DOCUMENT'
    });
    embeddings[key] = result.embedding.values;
    console.log('done');
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings, null, 2), 'utf-8');
  console.log(`\nWrote ${Object.keys(embeddings).length} embeddings to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Precompute script failed:', err.message);
  process.exit(1);
});
