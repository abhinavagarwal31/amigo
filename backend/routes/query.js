const express = require('express');
const { sanitizeQuery } = require('../services/sanitize');
const { retrieve, loadKnowledgeBase } = require('../services/retriever');
const { classify } = require('../services/classifier');
const { generateAnswer, classifyAmbiguous } = require('../services/llm');

const router = express.Router();
const kb = loadKnowledgeBase();

router.post('/', async (req, res) => {
  const { query, venueId, outputLanguage } = req.body || {};

  if (venueId !== undefined && typeof venueId !== 'string') {
    return res.status(400).json({ error: 'venueId must be a string' });
  }
  if (outputLanguage !== undefined && typeof outputLanguage !== 'string') {
    return res.status(400).json({ error: 'outputLanguage must be a string' });
  }

  const sanitized = sanitizeQuery(query);
  if (!sanitized.valid) {
    return res.status(400).json({ error: sanitized.error });
  }
  const cleanQuery = sanitized.value;

  try {
    const retrievedDocs = retrieve(cleanQuery, { venueId, kb });

    const classification = await classify(cleanQuery, retrievedDocs, {
      escalationTriggers: kb.escalationTriggers,
      language: outputLanguage,
      askLLMToClassify: classifyAmbiguous
    });

    if (classification.category === 'ESCALATE') {
      return res.json({
        escalation: true,
        reason: classification.reason,
        action: 'Notify on-site medical/security team immediately. Do not attempt to resolve via chat.',
        answer: null,
        category: 'ESCALATE',
        confidence: classification.confidence,
        triggerCoverage: classification.triggerCoverage,
        sourceDocs: []
      });
    }

    const answer = await generateAnswer({
      query: cleanQuery,
      context: retrievedDocs,
      outputLanguage
    });

    return res.json({
      answer,
      sourceDocs: retrievedDocs.map((doc) => ({
        type: doc.type,
        text: doc.text,
        venueId: doc.venueId
      })),
      category: classification.category,
      confidence: classification.confidence,
      triggerCoverage: classification.triggerCoverage,
      escalation: false
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
