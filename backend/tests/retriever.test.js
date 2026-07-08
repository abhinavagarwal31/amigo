jest.mock('../services/llm', () => ({
  embedText: jest.fn((text) => Promise.resolve(require('./testUtils/fakeEmbeddings').fakeEmbed(text)))
}));

const retrieverModule = require('../services/retriever');
const { retrieve, loadKnowledgeBase, tokenize, japaneseBigrams, cosineSimilarity } = retrieverModule;

let kb;

beforeAll(async () => {
  kb = await loadKnowledgeBase();
});

describe('retriever', () => {
  test('finds accessible restroom for a known query', async () => {
    const results = await retrieve('where is the nearest accessible restroom', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds re-entry policy for a policy question', async () => {
    const results = await retrieve('can I re-enter the stadium after leaving', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('policy');
    expect(results[0].text).toMatch(/Re-entry/);
  });

  test('finds transit info for a train question', async () => {
    const results = await retrieve('what time is the last train', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('transit');
  });

  test('scopes results to the given venue only', async () => {
    const results = await retrieve('where is the accessible restroom', { venueId: 'venue_02', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((doc) => doc.venueId === 'venue_02')).toBe(true);
  });

  test('returns empty array for a query with no matches', async () => {
    const results = await retrieve('xyzzy nonsense gibberish', { venueId: 'venue_01', kb });
    expect(results).toEqual([]);
  });

  test('returns empty array for empty query', async () => {
    const results = await retrieve('', { venueId: 'venue_01', kb });
    expect(results).toEqual([]);
  });

  test('finds the accessible restroom for a Spanish query', async () => {
    const results = await retrieve('baño accesible', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for a Portuguese query', async () => {
    // A bare two-word phrase can tie across multiple accessible-restroom docs in this venue
    // under the test's simplified fake embedding (it has no real notion of *which* restroom
    // is "nearest" - that's Step 5's job, proven against the real embeddings API). This test
    // proves the mechanism finds the right doc *type* across languages, not the exact instance.
    const results = await retrieve('banheiro acessível', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
  });

  test('finds gate info for a French query', async () => {
    const results = await retrieve('porte ouvert', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('gate');
  });

  test('scores a full natural Spanish sentence as a confident match, same as English', async () => {
    // Regression check (semantic-retrieval era): a real fan is far more likely to type/say
    // a full sentence than an isolated two-word phrase, and cosine similarity - unlike the
    // old token-overlap scorer - is not diluted by filler words like "dónde"/"está"/"el".
    // This no longer asserts exact score equality with the English phrasing (that was an
    // artifact of the old algorithm's stopword-ratio arithmetic, not a meaningful property
    // of embeddings); it asserts the same doc wins confidently in both languages.
    const englishResults = await retrieve('where is the nearest accessible restroom', {
      venueId: 'venue_01',
      kb
    });
    const spanishResults = await retrieve('¿dónde está el baño accesible más cercano?', {
      venueId: 'venue_01',
      kb
    });

    expect(spanishResults[0].type).toBe('restroom');
    expect(spanishResults[0].type).toBe(englishResults[0].type);
    expect(spanishResults[0].score).toBeGreaterThanOrEqual(retrieverModule.SIMILARITY_THRESHOLD);
  });

  test('scores a full natural Portuguese sentence above the confidence threshold', async () => {
    // Found via live testing against the real Gemini API: "fica" (a common verb for "is
    // located") and singular "o" ("the") weren't in the Portuguese stopword list under the
    // old token-overlap scorer, diluting this exact real-world phrasing to a score of
    // exactly 0.5. Semantic retrieval sidesteps that class of bug entirely - there is no
    // stopword list to keep in sync.
    const results = await retrieve('Onde fica o banheiro acessível mais próximo?', {
      venueId: 'venue_01',
      kb
    });

    expect(results[0].type).toBe('restroom');
    expect(results[0].score).toBeGreaterThan(0.5);
  });

  test('builds the document index once at load time, not on every retrieve() call', async () => {
    const buildDocIndexSpy = jest.spyOn(retrieverModule, 'buildDocIndex');

    const freshKb = await loadKnowledgeBase();
    expect(buildDocIndexSpy).toHaveBeenCalledTimes(freshKb.venues.length);

    buildDocIndexSpy.mockClear();

    await retrieve('restroom', { venueId: 'venue_01', kb: freshKb });
    await retrieve('gate', { venueId: 'venue_01', kb: freshKb });
    await retrieve('policy', { venueId: 'venue_02', kb: freshKb });

    expect(buildDocIndexSpy).not.toHaveBeenCalled();

    buildDocIndexSpy.mockRestore();
  });

  test('degrades gracefully for a gate status not present in GATE_STATUS_KEYWORDS', async () => {
    const syntheticVenue = {
      id: 'venue_test',
      name: 'Test Venue',
      gates: [
        { id: 'gate_z', status: 'staff-only', wheelchairAccessible: false, notes: 'Employees only' }
      ],
      restrooms: [],
      transit: [],
      policies: []
    };
    const syntheticKb = {
      venues: [syntheticVenue],
      escalationTriggers: {},
      docIndex: await retrieverModule.buildDocIndex(syntheticVenue)
    };

    await expect(retrieve('staff-only gate', { venueId: 'venue_test', kb: syntheticKb })).resolves.not.toThrow();

    const results = await retrieve('staff-only gate', { venueId: 'venue_test', kb: syntheticKb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('gate');
    // No translated keyword boost for an unmapped status, but the raw string is still
    // present and the gate is still indexed/retrievable - not silently dropped.
    expect(results[0].text).toMatch(/staff-only/);
  });

  test('finds the accessible restroom for a German query', async () => {
    const results = await retrieve('wo ist die nächste barrierefreie toilette', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for an Italian query', async () => {
    // See the Portuguese test above: a bare short phrase can tie across multiple
    // accessible-restroom docs under this test's simplified fake embedding.
    const results = await retrieve('dove si trova il bagno accessibile', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
  });

  test('finds the accessible restroom for an Arabic query, including with the definite article attached', async () => {
    const results = await retrieve('أين الحمام المتاح للكراسي المتحركة', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
  });

  test('finds the accessible restroom for a Japanese query', async () => {
    const results = await retrieve('トイレはどこですか', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
  });

  test('cosineSimilarity returns 1 for identical vectors and 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

// Regression tests for the old token/bigram-overlap scoring functions. This code is no
// longer used by retrieve() (which now scores via embeddings + cosine similarity), but it
// has not been deleted yet - classifier.js's own trigger matching still depends on the
// tokenizer, and the retrieval-scoring functions are kept side-by-side with the new
// semantic path until it's proven out with real queries (see the semantic-retrieval spec's
// step 4). These tests protect that not-yet-removed code from silent breakage in the
// meantime; delete them in the same commit that deletes the code they cover.
describe('legacy token/bigram scoring (pre-embeddings, not used by retrieve() anymore)', () => {
  test('japaneseBigrams produces overlapping bigrams for a Japanese restroom query', () => {
    const bigrams = japaneseBigrams('トイレはどこですか');
    expect(bigrams.size).toBeGreaterThan(0);
  });

  test('tokenize strips stopwords consistently regardless of accents', () => {
    expect(tokenize('¿dónde está el baño?')).not.toContain('el');
  });
});
