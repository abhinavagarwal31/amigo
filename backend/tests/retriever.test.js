jest.mock('../services/llm', () => ({
  embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

const retrieverModule = require('../services/retriever');
const { retrieve, loadKnowledgeBase } = retrieverModule;

let kb;

beforeAll(async () => {
  kb = await loadKnowledgeBase();
});

describe('retriever', () => {
  test('finds accessible restroom for a known query', () => {
    const results = retrieve('where is the nearest accessible restroom', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds re-entry policy for a policy question', () => {
    const results = retrieve('can I re-enter the stadium after leaving', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('policy');
    expect(results[0].text).toMatch(/Re-entry/);
  });

  test('finds transit info for a train question', () => {
    const results = retrieve('what time is the last train', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('transit');
  });

  test('scopes results to the given venue only', () => {
    const results = retrieve('restroom', { venueId: 'venue_02', kb });
    expect(results.every((doc) => doc.venueId === 'venue_02')).toBe(true);
  });

  test('returns empty array for a query with no matches', () => {
    const results = retrieve('xyzzy nonsense gibberish', { venueId: 'venue_01', kb });
    expect(results).toEqual([]);
  });

  test('returns empty array for empty query', () => {
    const results = retrieve('', { venueId: 'venue_01', kb });
    expect(results).toEqual([]);
  });

  test('finds the accessible restroom for a Spanish query', () => {
    const results = retrieve('baño accesible', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for a Portuguese query', () => {
    const results = retrieve('banheiro acessível', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds gate info for a French query', () => {
    const results = retrieve('porte ouvert', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('gate');
  });

  test('scores a full natural Spanish sentence as confidently as its English equivalent', () => {
    // Regression check: Spanish filler words ("dónde", "está", "el", "más") used to count
    // as unmatched query tokens and dilute the score well below the classifier's confidence
    // threshold, even though the correct doc was still the top result. A real fan is far
    // more likely to type/say a full sentence than an isolated two-word phrase.
    const englishResults = retrieve('where is the nearest accessible restroom', {
      venueId: 'venue_01',
      kb
    });
    const spanishResults = retrieve('¿dónde está el baño accesible más cercano?', {
      venueId: 'venue_01',
      kb
    });

    expect(spanishResults[0].type).toBe('restroom');
    expect(spanishResults[0].score).toBe(englishResults[0].score);
    expect(spanishResults[0].score).toBeGreaterThan(0.5);
  });

  test('scores a full natural Portuguese sentence above the confidence threshold', () => {
    // Found via live testing against the real Gemini API: "fica" (a common verb for "is
    // located") and singular "o" ("the") weren't in the Portuguese stopword list, diluting
    // this exact real-world phrasing to a score of exactly 0.5 — which fails classifier.js's
    // strict `> 0.5` confidence check by the boundary, even though this was the correct doc.
    const results = retrieve('Onde fica o banheiro acessível mais próximo?', {
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

    retrieve('restroom', { venueId: 'venue_01', kb: freshKb });
    retrieve('gate', { venueId: 'venue_01', kb: freshKb });
    retrieve('policy', { venueId: 'venue_02', kb: freshKb });

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

    expect(() => retrieve('gate_z', { venueId: 'venue_test', kb: syntheticKb })).not.toThrow();

    const results = retrieve('gate_z', { venueId: 'venue_test', kb: syntheticKb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('gate');
    // No translated keyword boost for an unmapped status, but the raw string is still
    // present and the gate is still indexed/retrievable — not silently dropped.
    expect(results[0].text).toMatch(/staff-only/);
  });

  test('finds the accessible restroom for a German query', () => {
    const results = retrieve('wo ist die nächste barrierefreie toilette', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for an Italian query', () => {
    const results = retrieve('dove si trova il bagno accessibile', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for an Arabic query, including with the definite article attached', () => {
    const results = retrieve('أين الحمام المتاح للكراسي المتحركة', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
    expect(results[0].text).toMatch(/Section 214/);
  });

  test('finds the accessible restroom for a Japanese query via the bigram fallback', () => {
    const results = retrieve('トイレはどこですか', { venueId: 'venue_01', kb });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('restroom');
  });
});
