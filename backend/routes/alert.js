const express = require('express');
const { sanitizeQuery } = require('../services/sanitize');

const router = express.Router();

const DEFAULT_REASON = 'Fan requested staff assistance from a kiosk';

// In-memory for this prototype; a production deployment would page a real staff system.
const alerts = [];

router.post('/', (req, res) => {
  const { venueId, reason } = req.body || {};

  if (typeof venueId !== 'string' || venueId.trim().length === 0) {
    return res.status(400).json({ error: 'venueId is required' });
  }

  const sanitizedReason = sanitizeQuery(reason || DEFAULT_REASON);
  const alert = {
    id: alerts.length + 1,
    venueId,
    reason: sanitizedReason.valid ? sanitizedReason.value : DEFAULT_REASON,
    timestamp: new Date().toISOString()
  };
  alerts.push(alert);

  // eslint-disable-next-line no-console
  console.log(`[STAFF ALERT] venue=${alert.venueId} reason="${alert.reason}" at ${alert.timestamp}`);

  return res.status(201).json({ acknowledged: true, alertId: alert.id, timestamp: alert.timestamp });
});

module.exports = router;
