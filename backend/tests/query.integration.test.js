jest.mock('../services/llm', () => ({
  generateAnswer: jest.fn(),
  classifyAmbiguous: jest.fn(),
  generateBriefing: jest.fn(),
  embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

const request = require('supertest');
const app = require('../server');
const llm = require('../services/llm');

describe('POST /api/query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns a grounded answer for a factual query and calls the LLM once', async () => {
    llm.generateAnswer.mockResolvedValue('The nearest accessible restroom is at Section 214 concourse.');

    const res = await request(app)
      .post('/api/query')
      .send({ query: 'where is the nearest accessible restroom', venueId: 'venue_01', outputLanguage: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.escalation).toBe(false);
    expect(res.body.category).toBe('GROUNDED_FACT');
    expect(res.body.answer).toMatch(/Section 214/);
    expect(res.body.sourceDocs.length).toBeGreaterThan(0);
    expect(llm.generateAnswer).toHaveBeenCalledTimes(1);
  });

  test('returns POLICY category for a policy question', async () => {
    llm.generateAnswer.mockResolvedValue('Re-entry is not allowed except for verified medical reasons.');

    const res = await request(app)
      .post('/api/query')
      .send({ query: 'what is the re-entry policy', venueId: 'venue_01' });

    expect(res.status).toBe(200);
    expect(res.body.category).toBe('POLICY');
    expect(res.body.escalation).toBe(false);
  });

  test('short-circuits on escalation and never calls the LLM for an answer', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ query: 'my friend is having chest pain', venueId: 'venue_01' });

    expect(res.status).toBe(200);
    expect(res.body.escalation).toBe(true);
    expect(res.body.category).toBe('ESCALATE');
    expect(res.body.answer).toBeNull();
    expect(res.body.action).toMatch(/medical|security/i);
    expect(llm.generateAnswer).not.toHaveBeenCalled();
  });

  test('rejects an empty query with 400', async () => {
    const res = await request(app).post('/api/query').send({ query: '' });
    expect(res.status).toBe(400);
    expect(llm.generateAnswer).not.toHaveBeenCalled();
  });

  test('rejects a non-string venueId with 400', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ query: 'where is the restroom', venueId: 12345 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/briefing/:venueId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns a generated briefing for a known venue', async () => {
    llm.generateBriefing.mockResolvedValue('Gate C is closed today; use Gate A or B instead.');

    const res = await request(app).get('/api/briefing/venue_01');

    expect(res.status).toBe(200);
    expect(res.body.venueId).toBe('venue_01');
    expect(res.body.briefing).toMatch(/Gate C/);
    expect(llm.generateBriefing).toHaveBeenCalledTimes(1);
  });

  test('returns 404 for an unknown venue', async () => {
    const res = await request(app).get('/api/briefing/venue_99');
    expect(res.status).toBe(404);
    expect(llm.generateBriefing).not.toHaveBeenCalled();
  });
});
