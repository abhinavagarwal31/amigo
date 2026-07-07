const { retrieve, loadKnowledgeBase } = require('../services/retriever');

const kb = loadKnowledgeBase();

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
});
