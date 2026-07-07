const DEFAULT_RETRIEVAL_THRESHOLD = 0.5;

async function classify(query, retrievedDocs, options = {}) {
  const {
    escalationTriggers = [],
    askLLMToClassify,
    retrievalThreshold = DEFAULT_RETRIEVAL_THRESHOLD
  } = options;

  const normalized = query.toLowerCase().trim();

  const matchedTrigger = escalationTriggers.find((trigger) =>
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

module.exports = { classify, DEFAULT_RETRIEVAL_THRESHOLD };
