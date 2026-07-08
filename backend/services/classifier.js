const { tokenize, isJapaneseText } = require('./retriever');

const DEFAULT_RETRIEVAL_THRESHOLD = 0.5;

/**
 * Normalizes a BCP-47 language tag (e.g. "en-US") down to its base language code
 * (e.g. "en"), defaulting to "en" for missing/invalid input.
 * @param {string} language
 * @returns {string}
 */
function normalizeLanguageCode(language) {
  if (typeof language !== 'string' || language.trim().length === 0) return 'en';
  return language.split('-')[0].toLowerCase();
}

// Contiguous-subsequence check: are triggerTokens present, in order, as a run inside
// queryTokens? Used instead of raw substring matching so a short trigger like "arma"
// (weapon) can't false-positive inside an unrelated word like "armario" (closet) — tokens
// are matched whole, not as substrings.
function containsTokenSequence(queryTokens, triggerTokens) {
  if (triggerTokens.length === 0 || triggerTokens.length > queryTokens.length) return false;

  for (let start = 0; start <= queryTokens.length - triggerTokens.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < triggerTokens.length; offset += 1) {
      if (queryTokens[start + offset] !== triggerTokens[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

// Both the trigger phrase and the query go through the same tokenizer, so contractions,
// accents, and stopword handling stay consistent on both sides of the comparison.
//
// Japanese triggers are checked differently: tokenize() strips Japanese characters
// entirely (no whitespace word segmentation to split on), so token-sequence matching can
// never work for them. As a simple, honest fallback, a Japanese trigger is matched via
// substring containment against the raw (whitespace-stripped) query instead. This
// reintroduces some of the false-positive risk the word-boundary fix eliminated for the
// other seven languages, but Japanese trigger phrases here are distinctive multi-character
// sequences rather than single ambiguous words, so the practical risk is much lower — a
// documented, known limitation rather than a silent one.
function matchesTrigger(queryTokens, trigger, rawQuery) {
  if (isJapaneseText(trigger)) {
    return rawQuery.replace(/\s+/g, '').includes(trigger.replace(/\s+/g, ''));
  }
  const triggerTokens = tokenize(trigger);
  return containsTokenSequence(queryTokens, triggerTokens);
}

// Always includes the English trigger list as a baseline fallback, since a fan may mix
// languages or type in English regardless of their declared/spoken language. This merge
// happens over a plain, pre-translated list — no translation or LLM call is involved, so
// the deterministic safety floor stays fast and dependency-free.
/**
 * Resolves the effective escalation-trigger phrase list for a language, always merging
 * in the English trigger list as a baseline safety-net fallback.
 * @param {object} escalationTriggers - map of language code -> trigger phrases (from venues.json)
 * @param {string} language - the fan's declared/output language (BCP-47 tag)
 * @returns {string[]}
 */
function resolveTriggerList(escalationTriggers, language) {
  if (!escalationTriggers || typeof escalationTriggers !== 'object') return [];
  const langCode = normalizeLanguageCode(language);
  const englishTriggers = escalationTriggers.en || [];
  if (langCode === 'en') return englishTriggers;
  const languageTriggers = escalationTriggers[langCode] || [];
  return [...languageTriggers, ...englishTriggers];
}

// Derived from the actual keys present in escalationTriggers (venues.json), not a
// separately hardcoded list — so this can't silently drift out of sync as languages are
// added or removed from the data.
/**
 * Lists the language codes that have their own translated escalation-trigger list.
 * @param {object} escalationTriggers - map of language code -> trigger phrases
 * @returns {string[]}
 */
function getSupportedTriggerLanguages(escalationTriggers) {
  if (!escalationTriggers || typeof escalationTriggers !== 'object') return [];
  return Object.keys(escalationTriggers);
}

// 'full' means this language has its own translated trigger list (and retrieval keyword
// coverage); 'partial' means it silently falls back to the English trigger baseline plus
// the LLM-assist semantic backstop — still safe, but a real, honest scope limit worth
// surfacing rather than hiding as an invisible implementation detail.
/**
 * Reports whether a language has full native trigger-list coverage or falls back
 * (silently but honestly) to the English baseline plus the LLM-assist backstop.
 * @param {object} escalationTriggers - map of language code -> trigger phrases
 * @param {string} language - the fan's declared/output language (BCP-47 tag)
 * @returns {'full'|'partial'}
 */
function resolveTriggerCoverage(escalationTriggers, language) {
  const langCode = normalizeLanguageCode(language);
  const supportedLanguages = getSupportedTriggerLanguages(escalationTriggers);
  return supportedLanguages.includes(langCode) ? 'full' : 'partial';
}

/**
 * Classifies a query into an answer category, checking (in order) deterministic
 * escalation-trigger keywords, confident retrieval matches, and an optional LLM-assist
 * judgment for ambiguous cases.
 * @param {string} query - the fan's question, already sanitized
 * @param {Array<object>} retrievedDocs - results from retriever.js's retrieve(), highest score first
 * @param {object} [options]
 * @param {object} [options.escalationTriggers] - map of language code -> trigger phrases
 * @param {string} [options.language] - the fan's declared/output language (BCP-47 tag)
 * @param {(query: string) => Promise<object>} [options.askLLMToClassify] - LLM-assist fallback
 * @param {number} [options.retrievalThreshold=DEFAULT_RETRIEVAL_THRESHOLD] - min score to trust
 *   the top retrieved doc as a confident match
 * @returns {Promise<object>} `{ category, confidence, reason, triggerCoverage }`
 */
async function classify(query, retrievedDocs, options = {}) {
  const {
    escalationTriggers = {},
    language,
    askLLMToClassify,
    retrievalThreshold = DEFAULT_RETRIEVAL_THRESHOLD
  } = options;

  const queryTokens = tokenize(query);
  const triggerList = resolveTriggerList(escalationTriggers, language);
  const triggerCoverage = resolveTriggerCoverage(escalationTriggers, language);

  const matchedTrigger = triggerList.find((trigger) => matchesTrigger(queryTokens, trigger, query));
  if (matchedTrigger) {
    return {
      category: 'ESCALATE',
      confidence: 'high',
      reason: `matched escalation trigger: "${matchedTrigger}"`,
      triggerCoverage
    };
  }

  if (retrievedDocs.length > 0 && retrievedDocs[0].score > retrievalThreshold) {
    const category = retrievedDocs[0].type === 'policy' ? 'POLICY' : 'GROUNDED_FACT';
    return { category, confidence: 'high', reason: 'confident retrieval match', triggerCoverage };
  }

  if (typeof askLLMToClassify === 'function') {
    const llmJudgment = await askLLMToClassify(query);
    if (llmJudgment && llmJudgment.category === 'ESCALATE') {
      return {
        category: 'ESCALATE',
        confidence: 'medium',
        reason: llmJudgment.reasoning || 'LLM flagged as a possible escalation',
        triggerCoverage
      };
    }
  }

  return {
    category: 'GROUNDED_FACT',
    confidence: 'low',
    reason: 'no confident retrieval match and no escalation signal',
    triggerCoverage
  };
}

module.exports = {
  classify,
  DEFAULT_RETRIEVAL_THRESHOLD,
  normalizeLanguageCode,
  resolveTriggerList,
  getSupportedTriggerLanguages,
  resolveTriggerCoverage
};
