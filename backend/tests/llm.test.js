const mockGenerateContent = jest.fn();
const mockEmbedContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
  embedContent: mockEmbedContent
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

const { classifyAmbiguous, embedText } = require('../services/llm');

describe('classifyAmbiguous', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test('fails closed to ESCALATE when the Gemini response cannot be parsed as JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'this is not valid JSON at all, just rambling prose.' }
    });

    const result = await classifyAmbiguous('some ambiguous fan question');

    expect(result.category).toBe('ESCALATE');
    expect(result.reasoning).toMatch(/could not be completed/i);
  });

  test('fails closed to ESCALATE when the Gemini API call itself throws (network error, quota, outage)', async () => {
    // Found via live testing: a real 429 quota error from the API propagated uncaught
    // because the old try/catch only wrapped JSON.parse, not the network call itself —
    // that would crash the whole /api/query request instead of failing closed.
    mockGenerateContent.mockRejectedValue(new Error('[429 Too Many Requests] quota exceeded'));

    const result = await classifyAmbiguous('some ambiguous fan question');

    expect(result.category).toBe('ESCALATE');
    expect(result.reasoning).toMatch(/could not be completed/i);
  });

  test('fails closed to ESCALATE when Gemini returns an empty response', () => {
    mockGenerateContent.mockResolvedValue({ response: { text: () => '' } });

    return classifyAmbiguous('another ambiguous question').then((result) => {
      expect(result.category).toBe('ESCALATE');
    });
  });

  test('returns the parsed category as-is when the Gemini response is valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"category": "GROUNDED_FACT", "reasoning": "routine question"}'
      }
    });

    const result = await classifyAmbiguous('where is the restroom');

    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.reasoning).toBe('routine question');
  });

  test('strips markdown code fences before parsing', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '```json\n{"category": "ESCALATE", "reasoning": "possible distress"}\n```'
      }
    });

    const result = await classifyAmbiguous('i feel really strange');

    expect(result.category).toBe('ESCALATE');
    expect(result.reasoning).toBe('possible distress');
  });
});

describe('embedText', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  beforeEach(() => {
    mockEmbedContent.mockReset();
  });

  test('returns the embedding vector from the Gemini embeddings API', async () => {
    mockEmbedContent.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });

    const vector = await embedText('where is the nearest restroom');

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(mockEmbedContent).toHaveBeenCalledWith('where is the nearest restroom');
  });
});
