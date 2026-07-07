const { classify } = require('../services/classifier');
const { retrieve, loadKnowledgeBase } = require('../services/retriever');

const kb = loadKnowledgeBase();
const escalationTriggers = kb.escalationTriggers;

describe('classify', () => {
  test('escalates an obvious medical case regardless of retrieval', async () => {
    const result = await classify('my friend is having chest pain', [], { escalationTriggers });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
  });

  test('escalates even when retrieval finds an unrelated confident match', async () => {
    const query = 'medical help needed near the restroom';
    const retrievedDocs = retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('ESCALATE');
  });

  test('returns GROUNDED_FACT for an obvious factual case (restroom location)', async () => {
    const query = 'where is the nearest accessible restroom';
    const retrievedDocs = retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.confidence).toBe('high');
  });

  test('returns POLICY for an obvious policy case (re-entry rules)', async () => {
    const query = 'what is the re-entry policy';
    const retrievedDocs = retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('POLICY');
    expect(result.confidence).toBe('high');
  });

  test('exercises the LLM-assist path for an ambiguous case and escalates on its judgment', async () => {
    const query = 'i feel really strange and dizzy all of a sudden';
    const retrievedDocs = retrieve(query, { venueId: 'venue_01', kb });
    const askLLMToClassify = jest.fn().mockResolvedValue({
      category: 'ESCALATE',
      reasoning: 'possible medical distress signal'
    });

    const result = await classify(query, retrievedDocs, { escalationTriggers, askLLMToClassify });

    expect(askLLMToClassify).toHaveBeenCalledWith(query);
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('medium');
    expect(result.reason).toMatch(/distress/);
  });

  test('exercises the LLM-assist path and falls back to low-confidence GROUNDED_FACT when LLM does not escalate', async () => {
    const query = 'tell me something about this place';
    const retrievedDocs = retrieve(query, { venueId: 'venue_01', kb });
    const askLLMToClassify = jest.fn().mockResolvedValue({
      category: 'GROUNDED_FACT',
      reasoning: 'general question, no urgency detected'
    });

    const result = await classify(query, retrievedDocs, { escalationTriggers, askLLMToClassify });

    expect(askLLMToClassify).toHaveBeenCalledWith(query);
    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.confidence).toBe('low');
  });
});
