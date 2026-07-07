const DEFAULT_RETRIEVAL_THRESHOLD = 0.5;

function normalizeLanguageCode(language) {
  if (typeof language !== 'string' || language.trim().length === 0) return 'en';
  return language.split('-')[0].toLowerCase();
}

// Always includes the English trigger list as a baseline fallback, since a fan may mix
// languages or type in English regardless of their declared/spoken language. This merge
// happens over a plain, pre-translated list — no translation or LLM call is involved, so
// the deterministic safety floor stays fast and dependency-free.
function resolveTriggerList(escalationTriggers, language) {
  if (!escalationTriggers || typeof escalationTriggers !== 'object') return [];
  const langCode = normalizeLanguageCode(language);
  const englishTriggers = escalationTriggers.en || [];
  if (langCode === 'en') return englishTriggers;
  const languageTriggers = escalationTriggers[langCode] || [];
  return [...languageTriggers, ...englishTriggers];
}

async function classify(query, retrievedDocs, options = {}) {
  const {
    escalationTriggers = {},
    language,
    askLLMToClassify,
    retrievalThreshold = DEFAULT_RETRIEVAL_THRESHOLD
  } = options;

  const normalized = query.toLowerCase().trim();
  const triggerList = resolveTriggerList(escalationTriggers, language);

  const matchedTrigger = triggerList.find((trigger) =>
    normalized.includes(trigger.toLowerCase())
  );
  if (matchedTrigger) {
    return {
      category: 'ESCALATE',
      confidence: 'high',
      reason: `matched escalation trigger: "${matchedTrigger}"`
    };
  }

  if (retrievedDocs.length > 0 && retrievedDocs[0].score > retrievalThreshold) {
    const category = retrievedDocs[0].type === 'policy' ? 'POLICY' : 'GROUNDED_FACT';
    return { category, confidence: 'high', reason: 'confident retrieval match' };
  }

  if (typeof askLLMToClassify === 'function') {
    const llmJudgment = await askLLMToClassify(query);
    if (llmJudgment && llmJudgment.category === 'ESCALATE') {
      return {
        category: 'ESCALATE',
        confidence: 'medium',
        reason: llmJudgment.reasoning || 'LLM flagged as a possible escalation'
      };
    }
  }

  return {
    category: 'GROUNDED_FACT',
    confidence: 'low',
    reason: 'no confident retrieval match and no escalation signal'
  };
}

module.exports = { classify, DEFAULT_RETRIEVAL_THRESHOLD, normalizeLanguageCode, resolveTriggerList };
