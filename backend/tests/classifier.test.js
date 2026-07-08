jest.mock('../services/llm', () => ({
  embedText: jest.fn((text) => Promise.resolve(require('./testUtils/fakeEmbeddings').fakeEmbed(text)))
}));

const {
  classify,
  getSupportedTriggerLanguages,
  resolveTriggerCoverage
} = require('../services/classifier');
const { retrieve, loadKnowledgeBase } = require('../services/retriever');

let kb;
let escalationTriggers;

beforeAll(async () => {
  kb = await loadKnowledgeBase();
  escalationTriggers = kb.escalationTriggers;
});

describe('classify', () => {
  test('escalates an obvious medical case regardless of retrieval', async () => {
    const result = await classify('my friend is having chest pain', [], { escalationTriggers });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
  });

  test('escalates even when retrieval finds an unrelated confident match', async () => {
    const query = 'medical help needed near the restroom';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('ESCALATE');
  });

  test('returns GROUNDED_FACT for an obvious factual case (restroom location)', async () => {
    const query = 'where is the nearest accessible restroom';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.confidence).toBe('high');
  });

  test('returns POLICY for an obvious policy case (re-entry rules)', async () => {
    const query = 'what is the re-entry policy';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers });
    expect(result.category).toBe('POLICY');
    expect(result.confidence).toBe('high');
  });

  test('exercises the LLM-assist path for an ambiguous case and escalates on its judgment', async () => {
    // retrievedDocs is passed as [] directly rather than via retrieve(): this test's job is to
    // exercise classify()'s no-confident-match branching, not retrieve()'s scoring for this exact
    // string. fakeEmbed's incidental hash-bucket overlap for this phrase isn't representative of
    // real embedding behavior (see retriever.js's SIMILARITY_THRESHOLD comment), and retrieve()'s
    // own empty-result behavior already has dedicated coverage in retriever.test.js.
    const query = 'i feel really strange and dizzy all of a sudden';
    const askLLMToClassify = jest.fn().mockResolvedValue({
      category: 'ESCALATE',
      reasoning: 'possible medical distress signal'
    });

    const result = await classify(query, [], { escalationTriggers, askLLMToClassify });

    expect(askLLMToClassify).toHaveBeenCalledWith(query);
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('medium');
    expect(result.reason).toMatch(/distress/);
  });

  test('exercises the LLM-assist path and falls back to low-confidence GROUNDED_FACT when LLM does not escalate', async () => {
    // See the comment in the previous test: retrievedDocs is [] by design here, not derived from
    // retrieve(), since this test targets classify()'s branching, not retrieval scoring.
    const query = 'tell me something about this place';
    const askLLMToClassify = jest.fn().mockResolvedValue({
      category: 'GROUNDED_FACT',
      reasoning: 'general question, no urgency detected'
    });

    const result = await classify(query, [], { escalationTriggers, askLLMToClassify });

    expect(askLLMToClassify).toHaveBeenCalledWith(query);
    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.confidence).toBe('low');
  });

  test('escalates a Spanish medical-emergency phrase using the Spanish trigger list', async () => {
    const query = 'mi amigo no puede respirar bien';
    const result = await classify(query, [], { escalationTriggers, language: 'es-ES' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
  });

  test('escalates a Portuguese medical-emergency phrase using the Portuguese trigger list', async () => {
    const query = 'meu amigo está com dor no peito';
    const result = await classify(query, [], { escalationTriggers, language: 'pt-BR' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
  });

  test('escalates a French medical-emergency phrase using the French trigger list', async () => {
    const query = 'mon ami ne peut pas respirer';
    const result = await classify(query, [], { escalationTriggers, language: 'fr-FR' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
  });

  test('classifies a full natural Spanish factual sentence as a confident GROUNDED_FACT', async () => {
    const query = '¿dónde está el baño accesible más cercano?';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers, language: 'es-ES' });
    expect(result.category).toBe('GROUNDED_FACT');
    expect(result.confidence).toBe('high');
  });

  test('still escalates on an English trigger word even when the declared language is Spanish', async () => {
    const query = 'medical emergency please help right now';
    const result = await classify(query, [], { escalationTriggers, language: 'es-ES' });
    expect(result.category).toBe('ESCALATE');
  });

  test('defaults to the English trigger list when no language is declared', async () => {
    const result = await classify('chest pain', [], { escalationTriggers });
    expect(result.category).toBe('ESCALATE');
  });

  test('does NOT escalate on "armario" (closet) even though it contains the substring "arma" (weapon)', async () => {
    const query = 'necesito ir al armario';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers, language: 'es-ES' });
    expect(result.category).not.toBe('ESCALATE');
  });

  test('still escalates on a genuine short-trigger word ("arma" = weapon) as its own token', async () => {
    const query = 'tiene un arma';
    const result = await classify(query, [], { escalationTriggers, language: 'es-ES' });
    expect(result.category).toBe('ESCALATE');
    expect(result.reason).toMatch(/arma/);
  });

  test('matches a multi-word trigger phrase ("dolor de pecho") only as the exact contiguous phrase', async () => {
    const matchingQuery = 'tengo un fuerte dolor de pecho';
    const matchResult = await classify(matchingQuery, [], { escalationTriggers, language: 'es-ES' });
    expect(matchResult.category).toBe('ESCALATE');

    const nonMatchingQuery = 'el dolor de mi pie y el color del pecho de pollo';
    const retrievedDocs = await retrieve(nonMatchingQuery, { venueId: 'venue_01', kb });
    const nonMatchResult = await classify(nonMatchingQuery, retrievedDocs, {
      escalationTriggers,
      language: 'es-ES'
    });
    expect(nonMatchResult.category).not.toBe('ESCALATE');
  });

  test('getSupportedTriggerLanguages is derived from the actual escalationTriggers keys', () => {
    const supported = getSupportedTriggerLanguages(escalationTriggers);
    expect(supported.sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'pt'].sort());
  });

  test('resolveTriggerCoverage reports "full" for supported languages and "partial" otherwise', () => {
    expect(resolveTriggerCoverage(escalationTriggers, 'es-ES')).toBe('full');
    expect(resolveTriggerCoverage(escalationTriggers, 'en-US')).toBe('full');
    expect(resolveTriggerCoverage(escalationTriggers, 'de-DE')).toBe('full');
    expect(resolveTriggerCoverage(escalationTriggers, 'nl-NL')).toBe('partial');
    expect(resolveTriggerCoverage(escalationTriggers, undefined)).toBe('full');
  });

  test('classify() surfaces triggerCoverage on every return path', async () => {
    const escalateResult = await classify('chest pain', [], { escalationTriggers, language: 'en-US' });
    expect(escalateResult.triggerCoverage).toBe('full');

    const query = 'where is the nearest accessible restroom';
    const groundedResult = await classify(query, await retrieve(query, { venueId: 'venue_01', kb }), {
      escalationTriggers,
      language: 'en-US'
    });
    expect(groundedResult.triggerCoverage).toBe('full');
  });

  test('an unsupported language (e.g. Dutch) degrades gracefully to English-only trigger matching', async () => {
    // Falls back to the English trigger baseline (no translated Dutch list exists), and
    // reports that honestly via triggerCoverage — it must not throw or silently match nothing.
    const result = await classify('medical emergency please help', [], {
      escalationTriggers,
      language: 'nl-NL'
    });
    expect(result.category).toBe('ESCALATE');
    expect(result.triggerCoverage).toBe('partial');
  });

  test('an unsupported language with no English trigger words present does not throw and does not escalate', async () => {
    const query = 'waar is het dichtstbijzijnde toilet';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers, language: 'nl-NL' });
    expect(result.category).not.toBe('ESCALATE');
    expect(result.triggerCoverage).toBe('partial');
  });

  test('escalates a German medical-emergency phrase using the German trigger list', async () => {
    const result = await classify('ich habe Brustschmerzen', [], { escalationTriggers, language: 'de-DE' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
    expect(result.triggerCoverage).toBe('full');
  });

  test('escalates an Italian medical-emergency phrase using the Italian trigger list', async () => {
    const result = await classify('ho un forte dolore al petto', [], { escalationTriggers, language: 'it-IT' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
    expect(result.triggerCoverage).toBe('full');
  });

  test('escalates an Arabic medical-emergency phrase using the Arabic trigger list', async () => {
    const result = await classify('لدي ألم في الصدر', [], { escalationTriggers, language: 'ar-SA' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
    expect(result.triggerCoverage).toBe('full');
  });

  test('escalates a Japanese medical-emergency phrase using the Japanese trigger list', async () => {
    const result = await classify('友達が息ができない', [], { escalationTriggers, language: 'ja-JP' });
    expect(result.category).toBe('ESCALATE');
    expect(result.confidence).toBe('high');
    expect(result.triggerCoverage).toBe('full');
  });

  test('does NOT escalate on Italian "armadio" (wardrobe) even though it contains the substring "arma" (weapon)', async () => {
    // Same class of risk as the original Spanish "arma"/"armario" bug — proves the
    // word-boundary-aware matching generalizes correctly to a newly-added language too,
    // rather than needing a fresh per-language patch.
    const query = 'dove è larmadio';
    const retrievedDocs = await retrieve(query, { venueId: 'venue_01', kb });
    const result = await classify(query, retrievedDocs, { escalationTriggers, language: 'it-IT' });
    expect(result.category).not.toBe('ESCALATE');
  });
});
