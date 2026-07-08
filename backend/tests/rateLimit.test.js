jest.mock('../services/llm', () => ({
  generateAnswer: jest.fn(),
  classifyAmbiguous: jest.fn(),
  generateBriefing: jest.fn(),
  embedText: jest.fn((text) => Promise.resolve(require('./testUtils/fakeEmbeddings').fakeEmbed(text)))
}));

const request = require('supertest');
const app = require('../server');
const { MAX_REQUESTS_PER_WINDOW } = require('../middleware/rateLimit');

describe('rate limiting on /api/query', () => {
  test('returns 429 with a clear error message once the per-IP limit is exceeded within the window', async () => {
    let lastResponse;

    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW + 1; i += 1) {
      // Escalation short-circuits before any Gemini call, so this stays fast and needs no key.
      // eslint-disable-next-line no-await-in-loop
      lastResponse = await request(app)
        .post('/api/query')
        .send({ query: 'medical emergency, chest pain', venueId: 'venue_01' });
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.body.error).toMatch(/too many requests/i);
  });
});
