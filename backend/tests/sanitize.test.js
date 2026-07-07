const { sanitizeQuery, MAX_QUERY_LENGTH } = require('../services/sanitize');

describe('sanitizeQuery', () => {
  test('trims whitespace from a normal query', () => {
    const result = sanitizeQuery('  where is the restroom?  ');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('where is the restroom?');
  });

  test('rejects empty string', () => {
    const result = sanitizeQuery('');
    expect(result.valid).toBe(false);
  });

  test('rejects whitespace-only string', () => {
    const result = sanitizeQuery('     ');
    expect(result.valid).toBe(false);
  });

  test('rejects non-string input', () => {
    const result = sanitizeQuery(12345);
    expect(result.valid).toBe(false);
  });

  test('strips control characters', () => {
    const result = sanitizeQuery('hello\x00world\x1F');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('helloworld');
  });

  test('caps length at MAX_QUERY_LENGTH', () => {
    const longQuery = 'a'.repeat(MAX_QUERY_LENGTH + 500);
    const result = sanitizeQuery(longQuery);
    expect(result.valid).toBe(true);
    expect(result.value.length).toBe(MAX_QUERY_LENGTH);
  });

  test('preserves non-ASCII characters (accented text)', () => {
    const result = sanitizeQuery('¿Dónde está el baño accesible más cercano?');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('¿Dónde está el baño accesible más cercano?');
  });
});
