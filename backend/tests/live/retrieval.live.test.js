// Hits the REAL Gemini embeddings API — real network calls, real latency, real cost.
// Never runs as part of `npm test` (excluded via testPathIgnorePatterns in package.json).
// Run explicitly with `npm run test:live`, which requires GEMINI_API_KEY in the environment.
// Unlike gemini.live.test.js (which exercises the full /api/query pipeline, including answer
// generation), this file calls retrieve() directly so it can assert on retrieval identity and
// scoring in isolation, without also paying for an LLM answer-generation call per case. Since
// it never requires server.js, it needs its own dotenv load to pick up GEMINI_API_KEY from
// .env (gemini.live.test.js gets this for free as a side effect of requiring the server app).
require('dotenv').config();
const { retrieve, loadKnowledgeBase, SIMILARITY_THRESHOLD } = require('../../services/retriever');

const canRunLive = !!process.env.GEMINI_API_KEY && process.env.RUN_LIVE_TESTS === 'true';
const describeLive = canRunLive ? describe : describe.skip;

describeLive('semantic retrieval against the real Gemini embeddings API', () => {
  let kb;

  beforeAll(async () => {
    kb = await loadKnowledgeBase();
  }, 30000);

  test(
    'retrieves the accessible restroom for a genuine paraphrase sharing no vocabulary with the doc text',
    async () => {
      const results = await retrieve('is there somewhere my kid can go pee around here', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('restroom');
    },
    20000
  );

  test(
    'retrieves the re-entry policy for a paraphrase describing leaving and coming back',
    async () => {
      const results = await retrieve('if I step out for a bit can I get back in later', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('policy');
    },
    20000
  );

  test(
    'retrieves transit info for a paraphrase about the last ride home',
    async () => {
      const results = await retrieve('what is the latest ride I can catch to get home tonight', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('transit');
    },
    20000
  );

  test(
    'retrieves the closed gate for a paraphrase describing an entrance that is shut',
    async () => {
      const results = await retrieve('which way in is currently shut down for repairs', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('gate');
    },
    20000
  );

  test(
    'returns no results for a genuinely unrelated query',
    async () => {
      const results = await retrieve("what will the weather be like during tomorrow's match", {
        venueId: 'venue_01',
        kb
      });
      expect(results).toEqual([]);
    },
    20000
  );

  // Real-world edge cases exercised during earlier live testing under the old token-overlap
  // algorithm (see the comments preserved in retriever.test.js) - re-run here against the real
  // embeddings API to confirm semantic retrieval preserves, or improves on, that behavior.
  test(
    'finds gate info for a French sentence with no direct keyword-list match',
    async () => {
      const results = await retrieve('la porte est ouverte pour entrer', { venueId: 'venue_01', kb });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('gate');
    },
    20000
  );

  test(
    'finds the accessible restroom for a Japanese query',
    async () => {
      const results = await retrieve('トイレはどこですか', { venueId: 'venue_01', kb });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('restroom');
    },
    20000
  );

  test(
    'finds the accessible restroom for a natural Portuguese sentence, previously diluted by a stopword-list gap',
    async () => {
      // Under the old token-overlap scorer, "fica" (a common verb for "is located") and
      // singular "o" ("the") weren't in the Portuguese stopword list, diluting this exact
      // real-world phrasing to a score of exactly 0.5. Embeddings have no stopword list to
      // keep in sync, so this should now score well above that.
      const results = await retrieve('Onde fica o banheiro acessível mais próximo?', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('restroom');
      expect(results[0].score).toBeGreaterThan(0.5);
    },
    20000
  );

  test(
    'finds the accessible restroom for an Arabic query with the definite article attached',
    async () => {
      const results = await retrieve('أين الحمام المتاح للكراسي المتحركة', { venueId: 'venue_01', kb });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('restroom');
    },
    20000
  );

  test(
    'a confident match clears the production similarity threshold',
    async () => {
      const results = await retrieve('where is the nearest accessible restroom', {
        venueId: 'venue_01',
        kb
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    },
    20000
  );
});
