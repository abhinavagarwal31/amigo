const express = require('express');
const { loadKnowledgeBase } = require('../services/retriever');
const { generateBriefing } = require('../services/llm');

const router = express.Router();

// Lazy + memoized for the same reason as routes/query.js: loading the knowledge base now
// computes a semantic embedding per doc, so it must not happen just from requiring this
// module.
let kbPromise = null;
function getKnowledgeBase() {
  if (!kbPromise) kbPromise = loadKnowledgeBase();
  return kbPromise;
}

router.get('/:venueId', async (req, res) => {
  const kb = await getKnowledgeBase();
  const venue = kb.venues.find((v) => v.id === req.params.venueId);
  if (!venue) {
    return res.status(404).json({ error: 'Venue not found' });
  }

  try {
    const briefing = await generateBriefing({ venue });
    return res.json({ venueId: venue.id, venueName: venue.name, briefing });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error in /api/briefing:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
