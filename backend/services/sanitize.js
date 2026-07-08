const MAX_QUERY_LENGTH = 1000;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Validates and cleans a raw query string: strips control characters, rejects
 * non-strings and empty input, and caps length at MAX_QUERY_LENGTH.
 * @param {*} input - raw request body value, expected to be a string
 * @returns {{valid: boolean, error: (string|null), value: string}}
 */
function sanitizeQuery(input) {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Query must be a string', value: '' };
  }

  const stripped = input.replace(CONTROL_CHARS_REGEX, '').trim();

  if (stripped.length === 0) {
    return { valid: false, error: 'Query must not be empty', value: '' };
  }

  const capped = stripped.slice(0, MAX_QUERY_LENGTH);

  return { valid: true, error: null, value: capped };
}

module.exports = { sanitizeQuery, MAX_QUERY_LENGTH };
