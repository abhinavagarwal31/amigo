const express = require('express');
const { loadKnowledgeBase } = require('../services/retriever');
const { generateBriefing } = require('../services/llm');

const router = express.Router();
const kb = loadKnowledgeBase();

router.get('/:venueId', async (req, res) => {
  const venue = kb.venues.find((v) => v.id === req.params.venueId);
  if (!venue) {
    return res.status(404).json({ error: 'Venue not found' });
  }

  try {
    const briefing = await generateBriefing({ venue });
    return res.json({ venueId: venue.id, venueName: venue.name, briefing });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
