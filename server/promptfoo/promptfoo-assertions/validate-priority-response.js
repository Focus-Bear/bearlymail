/**
 * Parse the ordered category display names out of the numbered (or legacy
 * dashed) "Available Categories" list. Index 0 === number 1. Tolerant of both
 * `1. "Name"` (numbered) and `- "Name"` (legacy) line formats.
 */
function parseNumberedCategoryNames(emailCategories) {
  const names = [];
  if (!emailCategories) return names;
  for (const line of String(emailCategories).split('\n')) {
    // number/dash, then an OPTIONAL [id: ...] prefix, then the quoted name.
    const match = line.match(/^\s*(?:\d+\.|-)\s*(?:\[id:[^\]]*\]\s*)?"([^"]+)"/);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * Resolve a parsed priority response's category to a display name. Prefers the
 * single-mode `categoryNumber` (1-based index into `orderedNames`, 0 = Other);
 * falls back to a `category` name string (batch mode / legacy). Returns
 * undefined when neither is usable.
 */
function resolveResponseCategory(parsed, orderedNames) {
  if (parsed.categoryNumber !== undefined && parsed.categoryNumber !== null) {
    const n = Number(parsed.categoryNumber);
    if (n === 0) return 'Other';
    if (Number.isInteger(n) && n >= 1 && n <= orderedNames.length) {
      return orderedNames[n - 1];
    }
    return undefined;
  }
  if (typeof parsed.category === 'string' && parsed.category) {
    return parsed.category;
  }
  return undefined;
}

/**
 * Calculate keyword overlap similarity between two strings
 * Returns a score between 0 and 1
 */
function keywordSimilarity(text1, text2) {
  const normalize = (str) => str.toLowerCase().replace(/[\p{Emoji}]/gu, '').trim();
  const getWords = (str) => normalize(str).split(/\s+/).filter(w => w.length > 2);
  
  const words1 = new Set(getWords(text1));
  const words2 = new Set(getWords(text2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union; // Jaccard similarity
}

/**
 * Check if proto category name is semantically relevant to expected topics
 * Uses keyword matching with synonyms/related terms
 */
function isProtoCategoryRelevant(categoryName, expectedTopics) {
  const topicSynonyms = {
    'legal': ['legal', 'contract', 'agreement', 'nda', 'law', 'attorney', 'compliance', 'document', 'signature'],
    'infrastructure': ['server', 'alert', 'monitor', 'system', 'infrastructure', 'devops', 'cpu', 'memory', 'technical', 'ops'],
    'shipping': ['shipping', 'delivery', 'package', 'tracking', 'logistics', 'fedex', 'ups', 'mail', 'parcel'],
    'billing': ['billing', 'invoice', 'payment', 'finance', 'accounting', 'receipt', 'transaction', 'money'],
    'calendar': ['calendar', 'meeting', 'invite', 'event', 'schedule', 'appointment', 'standup', 'sync'],
    'learning': ['learning', 'course', 'education', 'training', 'tutorial', 'lesson', 'study', 'class']
  };
  
  const categoryLower = categoryName.toLowerCase();
  
  for (const topic of expectedTopics) {
    const synonyms = topicSynonyms[topic.toLowerCase()] || [topic.toLowerCase()];
    for (const synonym of synonyms) {
      if (categoryLower.includes(synonym)) {
        return { relevant: true, matchedTopic: topic, matchedSynonym: synonym };
      }
    }
  }
  
  return { relevant: false };
}

/**
 * Validates a priority analysis response
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with expected values
 * @returns {boolean|object} - true if valid, or { pass: boolean, score: number, reason: string }
 */
module.exports = (output, context) => {
  // console.log('validate-priority-response', output, context);
  // Validate JSON first - handle markdown code blocks if present
  let parsed;
  try {
    let jsonString = typeof output === 'string' ? output : JSON.stringify(output);
    // Trim first, then strip markdown code blocks if present (handles leading/trailing whitespace)
    jsonString = jsonString.trim();
    // Remove markdown code blocks - handle various formats with optional whitespace/newlines
    jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { pass: false, score: 0, reason: 'Response must be valid JSON. Got: ' + String(output).substring(0, 200) };
  }
  
  if (!parsed || typeof parsed !== 'object') {
    return { pass: false, score: 0, reason: 'Response must be a JSON object' };
  }

  // Unwrap "result" key if present (new format: { "result": { ... } })
  if (parsed.result && typeof parsed.result === 'object') {
    parsed = parsed.result;
  }

  // Validate required fields - new format uses urgencyScore, reasoning, urgencyExplanation
  // Note: sentimentScore is NO LONGER returned by the priority prompt — it comes from the
  // summary step (commit #781). Validation is intentionally omitted here.
  if (typeof parsed.urgencyScore !== 'number' || parsed.urgencyScore < 0 || parsed.urgencyScore > 100) {
    return { pass: false, score: 0, reason: 'Response must have a valid urgencyScore (0-100)' };
  }
  
  if (!parsed.urgencyExplanation || typeof parsed.urgencyExplanation !== 'string') {
    return { pass: false, score: 0, reason: 'Response must have an urgencyExplanation string' };
  }
  
  // sentimentScore is pre-computed from the summary step — the priority prompt omits it.
  // If present (e.g., old test data), validate it; if absent, skip.
  if (parsed.sentimentScore !== undefined && parsed.sentimentScore !== null) {
    if (typeof parsed.sentimentScore !== 'number' || parsed.sentimentScore < -1 || parsed.sentimentScore > 1) {
      return { pass: false, score: 0, reason: 'sentimentScore present but invalid — must be a number between -1 and 1' };
    }
  }
  
  if (!parsed.reasoning || typeof parsed.reasoning !== 'string') {
    return { pass: false, score: 0, reason: 'Response must have a reasoning string' };
  }

  // categoryConfidence is required in single-mode responses (batch mode may omit it)
  if (parsed.categoryConfidence !== undefined) {
    const validValues = ['HIGH', 'MEDIUM', 'LOW'];
    if (!validValues.includes(parsed.categoryConfidence)) {
      return { pass: false, score: 0, reason: `categoryConfidence must be HIGH, MEDIUM, or LOW — got "${parsed.categoryConfidence}"` };
    }
  }
  
  // Check for VIP mentions (should not be in reasoning)
  if (parsed.reasoning.toLowerCase().includes('vip')) {
    return { pass: false, score: 0, reason: 'Reasoning should not mention VIP status' };
  }

  // Explanations must reference categories by NAME, never by list number
  // ("category 2") — the user never sees the numbered list the model picked from.
  const positionalRef = /\bcategory\s+#?\d/i;
  for (const field of ['categoryExplanation', 'reasoning']) {
    if (typeof parsed[field] === 'string' && positionalRef.test(parsed[field])) {
      return { pass: false, score: 0, reason: `${field} must use category NAMES, not list numbers: "${parsed[field]}"` };
    }
  }
  
  // Validate expected values from context.config
  if (context.config) {
    // Support both old format (score) and new format (urgencyScore)
    const score = parsed.score !== undefined ? parsed.score : parsed.urgencyScore;
    const isUrgent = parsed.isUrgent !== undefined ? parsed.isUrgent : (parsed.urgencyScore >= 90);
    
    if (context.config.minScore !== undefined && score < context.config.minScore) {
      return { pass: false, score: 0, reason: `Expected score >= ${context.config.minScore}, got ${score}` };
    }
    
    if (context.config.maxScore !== undefined && score > context.config.maxScore) {
      return { pass: false, score: 0, reason: `Expected score <= ${context.config.maxScore}, got ${score}` };
    }
    
    if (context.config.expectedIsUrgent !== undefined && isUrgent !== context.config.expectedIsUrgent) {
      return { pass: false, score: 0, reason: `Expected isUrgent to be ${context.config.expectedIsUrgent}, got ${isUrgent} (urgencyScore: ${parsed.urgencyScore})` };
    }
    
    if (context.config.expectedSentiment) {
      const expectedSentiments = Array.isArray(context.config.expectedSentiment) 
        ? context.config.expectedSentiment 
        : [context.config.expectedSentiment];
      
      // sentimentScore is no longer returned by the priority prompt (it comes from the summary step).
      // Derive sentiment from sentimentScore if present; otherwise skip sentiment validation.
      let actualSentiment = parsed.sentiment;
      if (actualSentiment === undefined && typeof parsed.sentimentScore === 'number') {
        // Map sentimentScore to sentiment categories
        if (parsed.sentimentScore > 0.3) {
          actualSentiment = 'positive';
        } else if (parsed.sentimentScore < -0.3) {
          actualSentiment = 'negative';
        } else if (parsed.sentimentScore < -0.1) {
          actualSentiment = 'upset';
        } else {
          actualSentiment = 'neutral';
        }
      }
      
      // If sentimentScore is absent (expected — the prompt no longer returns it),
      // skip the sentiment check rather than failing.
      if (actualSentiment !== undefined) {
        // If maxSentimentScore is also specified, allow OR logic: sentiment matches OR sentimentScore is negative
        if (context.config.maxSentimentScore !== undefined) {
          const sentimentMatches = expectedSentiments.includes(actualSentiment);
          const sentimentScoreValid = typeof parsed.sentimentScore === 'number' && parsed.sentimentScore < context.config.maxSentimentScore;
          
          if (!sentimentMatches && !sentimentScoreValid) {
            return {
              pass: false,
              score: 0,
              reason: `Expected sentiment to be one of [${expectedSentiments.join(', ')}] OR sentimentScore < ${context.config.maxSentimentScore}, got sentiment=${actualSentiment}, sentimentScore=${parsed.sentimentScore}`
            };
          }
        } else {
          // No sentimentScore check, just validate sentiment
          if (!expectedSentiments.includes(actualSentiment)) {
            return {
              pass: false,
              score: 0,
              reason: `Expected sentiment to be one of [${expectedSentiments.join(', ')}], got ${actualSentiment} (derived from sentimentScore: ${parsed.sentimentScore})`
            };
          }
        }
      }
      // else: sentimentScore absent from priority prompt response — skip sentiment assertion
    }
    
    if (context.config.minSentimentScore !== undefined) {
      if (typeof parsed.sentimentScore !== 'number') {
        // sentimentScore absent (expected) — skip this check
      } else if (parsed.sentimentScore >= context.config.minSentimentScore) {
        return { pass: false, score: 0, reason: `Expected sentimentScore < ${context.config.minSentimentScore}, got ${parsed.sentimentScore}` };
      }
    }
    
    // maxSentimentScore without expectedSentiment means just check sentimentScore
    if (context.config.maxSentimentScore !== undefined && !context.config.expectedSentiment) {
      if (typeof parsed.sentimentScore !== 'number') {
        // sentimentScore absent (expected) — skip this check
      } else if (parsed.sentimentScore >= context.config.maxSentimentScore) {
        // maxSentimentScore means "must be more negative than this" (e.g., if maxSentimentScore is -0.01, sentimentScore should be < -0.01)
        return { pass: false, score: 0, reason: `Expected sentimentScore < ${context.config.maxSentimentScore} (more negative), got ${parsed.sentimentScore}` };
      }
    }
    
    // Resolve the chosen category to a name. Single mode now returns
    // `categoryNumber` (1-based index into the numbered Available Categories,
    // 0 = Other); batch mode and older responses return a `category` name.
    const numberedCategoryNames = parseNumberedCategoryNames(
      context.vars && context.vars.emailCategories,
    );
    const resolvedCategory = resolveResponseCategory(parsed, numberedCategoryNames);

    // Category validation
    if (context.config.expectedCategory !== undefined) {
      if (!resolvedCategory || typeof resolvedCategory !== 'string') {
        return { pass: false, score: 0, reason: `Expected a resolvable category, but categoryNumber/category was missing or invalid` };
      }
      const expectedCategories = Array.isArray(context.config.expectedCategory)
        ? context.config.expectedCategory
        : [context.config.expectedCategory];
      if (!expectedCategories.includes(resolvedCategory)) {
        return { pass: false, score: 0, reason: `Expected category to be one of [${expectedCategories.join(', ')}], got "${resolvedCategory}" (categoryNumber=${parsed.categoryNumber})` };
      }
    }

    // Category exclusion validation (ensure category is NOT one of these)
    if (context.config.excludedCategories !== undefined) {
      if (!resolvedCategory || typeof resolvedCategory !== 'string') {
        return { pass: false, score: 0, reason: `Expected a resolvable category, but categoryNumber/category was missing or invalid` };
      }
      const excludedCategories = Array.isArray(context.config.excludedCategories)
        ? context.config.excludedCategories
        : [context.config.excludedCategories];
      if (excludedCategories.includes(resolvedCategory)) {
        return {
          pass: false,
          score: 0,
          reason: `Category should NOT be one of [${excludedCategories.join(', ')}], but got "${resolvedCategory}"`
        };
      }
    }
    
    // Proto category suggestion validation
    if (context.config.expectProtoCategorySuggestion !== undefined) {
      if (context.config.expectProtoCategorySuggestion === true) {
        // Expect category "Other" with a proto suggestion, OR a non-listed category
        // gpt-5.4-mini may assign a relevant custom category instead of "Other"
        const isListedCategory =
          resolvedCategory !== undefined &&
          resolvedCategory !== 'Other' &&
          numberedCategoryNames.includes(resolvedCategory);
        const isOther = resolvedCategory === 'Other' || resolvedCategory === undefined;
        if (isListedCategory) {
          return { pass: false, score: 0, reason: `Expected category to be "Other" or a new category, got listed category "${resolvedCategory}"` };
        }
        if (isOther && (!parsed.protoCategorySuggestion || typeof parsed.protoCategorySuggestion !== 'object')) {
          return { pass: false, score: 0, reason: `Expected protoCategorySuggestion object when category is "Other", but it's missing or invalid` };
        }
        if (isOther || parsed.protoCategorySuggestion) {
          if (parsed.protoCategorySuggestion) {
            if (!parsed.protoCategorySuggestion.name || typeof parsed.protoCategorySuggestion.name !== 'string') {
              return { pass: false, score: 0, reason: `Expected protoCategorySuggestion.name to be a non-empty string` };
            }
            if (!parsed.protoCategorySuggestion.description || typeof parsed.protoCategorySuggestion.description !== 'string') {
              return { pass: false, score: 0, reason: `Expected protoCategorySuggestion.description to be a non-empty string` };
            }
            // Note: emoji prefix is preferred but not a hard requirement — LLMs occasionally
            // omit it despite prompt guidance. Warn via score penalty instead of hard failing.
            if (!/^[\p{Emoji}]/u.test(parsed.protoCategorySuggestion.name)) {
              // Pass but with a partial score to signal the style violation
              return { pass: true, score: 0.7, reason: `protoCategorySuggestion.name should start with an emoji (style guideline), got "${parsed.protoCategorySuggestion.name}" — passing with reduced score` };
            }
          }
        }
      } else if (context.config.expectProtoCategorySuggestion === false) {
        // Should NOT have a proto category suggestion (e.g., when a category is matched)
        if (parsed.protoCategorySuggestion) {
          return { pass: false, score: 0, reason: `Expected no protoCategorySuggestion when a category matches, but got one: "${parsed.protoCategorySuggestion.name}"` };
        }
      }
    }
    
    // Proto category name matching (for when we expect a specific proto category name pattern)
    if (context.config.protoCategoryNameContains !== undefined) {
      if (!parsed.protoCategorySuggestion || typeof parsed.protoCategorySuggestion !== 'object') {
        return { pass: false, score: 0, reason: `Expected protoCategorySuggestion object, but it's missing or invalid` };
      }
      const expectedSubstrings = Array.isArray(context.config.protoCategoryNameContains) 
        ? context.config.protoCategoryNameContains 
        : [context.config.protoCategoryNameContains];
      const nameMatches = expectedSubstrings.some(substring => 
        parsed.protoCategorySuggestion.name.toLowerCase().includes(substring.toLowerCase())
      );
      if (!nameMatches) {
        return { pass: false, score: 0, reason: `Expected protoCategorySuggestion.name to contain one of [${expectedSubstrings.join(', ')}], got "${parsed.protoCategorySuggestion.name}"` };
      }
    }
    
    // Validate that existing proto categories are matched when provided
    if (context.config.shouldMatchProtoCategory !== undefined) {
      const expectedProtoCategory = context.config.shouldMatchProtoCategory;
      // The LLM should either:
      // 1. Return the exact proto category name as the category
      // 2. Return a category that contains key parts of the proto category name
      // We normalize by removing emojis and comparing case-insensitively
      const normalizeCategory = (cat) => cat.replace(/[\p{Emoji}]/gu, '').trim().toLowerCase();
      const normalizedExpected = normalizeCategory(expectedProtoCategory);
      const normalizedActual = normalizeCategory(parsed.category || '');
      
      // Check for match (either exact or partial overlap of main words)
      const expectedWords = normalizedExpected.split(/\s+/).filter(w => w.length > 2);
      const actualWords = normalizedActual.split(/\s+/).filter(w => w.length > 2);
      const hasWordOverlap = expectedWords.some(word => actualWords.includes(word));
      
      if (normalizedActual !== normalizedExpected && !hasWordOverlap) {
        return { pass: false, score: 0, reason: `Expected to match existing proto category "${expectedProtoCategory}", got category "${parsed.category}". Neither exact match nor word overlap found.` };
      }
    }
    
    // Validate proto category relevance using keyword similarity
    // This is more deterministic than LLM-rubric while still being flexible
    if (context.config.protoCategoryRelevantTo !== undefined) {
      const expectedTopics = Array.isArray(context.config.protoCategoryRelevantTo)
        ? context.config.protoCategoryRelevantTo
        : [context.config.protoCategoryRelevantTo];
      
      // gpt-5.4-mini may assign a relevant custom category directly instead of "Other" + proto suggestion
      const nameToCheck = (parsed.protoCategorySuggestion && parsed.protoCategorySuggestion.name)
        ? parsed.protoCategorySuggestion.name
        : parsed.category;
      
      if (!nameToCheck) {
        return {
          pass: false,
          score: 0,
          reason: `Expected protoCategorySuggestion or a relevant category name, but neither is present.`
        };
      }
      
      const relevanceCheck = isProtoCategoryRelevant(nameToCheck, expectedTopics);
      
      if (!relevanceCheck.relevant) {
        const combinedTopics = expectedTopics.join(' ');
        const similarity = keywordSimilarity(nameToCheck, combinedTopics);
        
        return {
          pass: false,
          score: similarity,
          reason: `Category/proto "${nameToCheck}" is not relevant to expected topics [${expectedTopics.join(', ')}]. Similarity score: ${(similarity * 100).toFixed(1)}%`
        };
      }
    }
  }
  
  return true;
};

