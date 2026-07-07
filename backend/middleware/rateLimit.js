const rateLimit = require('express-rate-limit');

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

// Per-IP, in-memory, resets on server restart — a reasonable floor for this prototype,
// not a production-grade rate limiter. Applied only to routes that trigger paid Gemini
// calls (/api/query, /api/briefing).
function createRateLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: MAX_REQUESTS_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment and try again.' }
  });
}

module.exports = { createRateLimiter, WINDOW_MS, MAX_REQUESTS_PER_WINDOW };
