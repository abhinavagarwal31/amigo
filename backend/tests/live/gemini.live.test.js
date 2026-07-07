// Hits the REAL Gemini API — real network calls, real latency, real cost.
// Never runs as part of `npm test` (excluded via testPathIgnorePatterns in package.json).
// Run explicitly with `npm run test:live`, which requires GEMINI_API_KEY in the
// environment. The internal guard below is a second safety net: even if this file were
// picked up by some other runner/config, it stays skipped unless RUN_LIVE_TESTS=true is
// also explicitly set.
const request = require('supertest');
const app = require('../../server');
const { classifyAmbiguous } = require('../../services/llm');

const canRunLive = !!process.env.GEMINI_API_KEY && process.env.RUN_LIVE_TESTS === 'true';
const describeLive = canRunLive ? describe : describe.skip;

describeLive('Gemini live API', () => {
  test(
    'grounded-fact case: real answer cites an expected fact from venues.json',
    async () => {
      const res = await request(app).post('/api/query').send({
        query: 'Where is the nearest accessible restroom?',
        venueId: 'venue_01',
        outputLanguage: 'en-US'
      });

      expect(res.status).toBe(200);
      expect(res.body.escalation).toBe(false);
      expect(res.body.answer).toMatch(/214/);
    },
    20000
  );

  test(
    'out-of-scope case: does not fabricate a fact absent from the knowledge base',
    async () => {
      const res = await request(app).post('/api/query').send({
        query: 'What time does the fireworks show start?',
        venueId: 'venue_01',
        outputLanguage: 'en-US'
      });

      expect(res.status).toBe(200);
      expect(res.body.escalation).toBe(false);
      // Must not invent a specific-looking time (e.g. "9:30 PM").
      expect(res.body.answer).not.toMatch(/\d{1,2}(:\d{2})?\s*(am|pm)/i);
      expect(res.body.answer.toLowerCase()).toMatch(/don't have|do not have|check with|staff|not sure|unable to/);
    },
    20000
  );

  test(
    'ambiguous case: classifyAmbiguous returns a real, parseable {category, reasoning} response',
    async () => {
      const result = await classifyAmbiguous('i feel really strange and dizzy all of a sudden');

      expect(['ESCALATE', 'GROUNDED_FACT']).toContain(result.category);
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
      // A failure (parse error, network/quota error) would produce this exact fallback
      // reasoning string (see llm.js) — asserting against it confirms the real response
      // was valid JSON, not the fail-closed path.
      expect(result.reasoning).not.toMatch(/could not be completed/i);
    },
    20000
  );
});
