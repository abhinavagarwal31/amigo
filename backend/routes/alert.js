const express = require('express');
const { sanitizeQuery } = require('../services/sanitize');

const router = express.Router();

const DEFAULT_REASON = 'Fan requested staff assistance from a kiosk';
const MAX_ALERTS = 500;

// In-memory for this prototype; a production deployment would persist alerts externally
// (and page a real staff system) instead of holding them in process memory. Capped at
// MAX_ALERTS, dropping the oldest, so long uptime can't grow this unbounded.
const alerts = [];
let nextAlertId = 1;

router.post('/', (req, res) => {
  const { venueId, reason } = req.body || {};

  if (typeof venueId !== 'string' || venueId.trim().length === 0) {
    return res.status(400).json({ error: 'venueId is required' });
  }

  const sanitizedReason = sanitizeQuery(reason || DEFAULT_REASON);
  const alert = {
    id: nextAlertId,
    venueId,
    reason: sanitizedReason.valid ? sanitizedReason.value : DEFAULT_REASON,
    timestamp: new Date().toISOString()
  };
  nextAlertId += 1;

  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.shift();
  }

  // eslint-disable-next-line no-console
  console.log(`[STAFF ALERT] venue=${alert.venueId} reason="${alert.reason}" at ${alert.timestamp}`);

  return res.status(201).json({ acknowledged: true, alertId: alert.id, timestamp: alert.timestamp });
});

router.alerts = alerts;
router.MAX_ALERTS = MAX_ALERTS;

module.exports = router;
