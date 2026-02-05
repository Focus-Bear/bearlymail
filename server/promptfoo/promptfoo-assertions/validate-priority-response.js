/**
 * Validates a priority analysis response
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with expected values
 * @returns {boolean} - true if valid
 */
module.exports = (output, context) => {
  console.log('validate-priority-response', output, context);
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
    throw new Error('Response must be valid JSON. Got: ' + output.substring(0, 200));
  }
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  
  // Validate required fields - new format uses urgencyScore, sentimentScore, reasoning, urgencyExplanation
  if (typeof parsed.urgencyScore !== 'number' || parsed.urgencyScore < 0 || parsed.urgencyScore > 100) {
    throw new Error('Response must have a valid urgencyScore (0-100)');
  }
  
  if (!parsed.urgencyExplanation || typeof parsed.urgencyExplanation !== 'string') {
    throw new Error('Response must have an urgencyExplanation string');
  }
  
  if (typeof parsed.sentimentScore !== 'number' || parsed.sentimentScore < -1 || parsed.sentimentScore > 1) {
    throw new Error('Response must have a valid sentimentScore (-1 to 1)');
  }
  
  if (!parsed.reasoning || typeof parsed.reasoning !== 'string') {
    throw new Error('Response must have a reasoning string');
  }
  
  // Check for VIP mentions (should not be in reasoning)
  if (parsed.reasoning.toLowerCase().includes('vip')) {
    throw new Error('Reasoning should not mention VIP status');
  }
  
  // Validate expected values from context.config
  if (context.config) {
    // Support both old format (score) and new format (urgencyScore)
    const score = parsed.score !== undefined ? parsed.score : parsed.urgencyScore;
    const isUrgent = parsed.isUrgent !== undefined ? parsed.isUrgent : (parsed.urgencyScore >= 90);
    
    if (context.config.minScore !== undefined && score < context.config.minScore) {
      throw new Error(`Expected score >= ${context.config.minScore}, got ${score}`);
    }
    
    if (context.config.maxScore !== undefined && score > context.config.maxScore) {
      throw new Error(`Expected score <= ${context.config.maxScore}, got ${score}`);
    }
    
    if (context.config.expectedIsUrgent !== undefined && isUrgent !== context.config.expectedIsUrgent) {
      throw new Error(`Expected isUrgent to be ${context.config.expectedIsUrgent}, got ${isUrgent} (urgencyScore: ${parsed.urgencyScore})`);
    }
    
    if (context.config.expectedSentiment) {
      const expectedSentiments = Array.isArray(context.config.expectedSentiment) 
        ? context.config.expectedSentiment 
        : [context.config.expectedSentiment];
      
      // Derive sentiment from sentimentScore if sentiment field is not present
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
      
      // If maxSentimentScore is also specified, allow OR logic: sentiment matches OR sentimentScore is negative
      if (context.config.maxSentimentScore !== undefined) {
        const sentimentMatches = expectedSentiments.includes(actualSentiment);
        const sentimentScoreValid = typeof parsed.sentimentScore === 'number' && parsed.sentimentScore < context.config.maxSentimentScore;
        
        if (!sentimentMatches && !sentimentScoreValid) {
          throw new Error(`Expected sentiment to be one of [${expectedSentiments.join(', ')}] OR sentimentScore < ${context.config.maxSentimentScore}, got sentiment=${actualSentiment}, sentimentScore=${parsed.sentimentScore}`);
        }
      } else {
        // No sentimentScore check, just validate sentiment
        if (!expectedSentiments.includes(actualSentiment)) {
          throw new Error(`Expected sentiment to be one of [${expectedSentiments.join(', ')}], got ${actualSentiment} (derived from sentimentScore: ${parsed.sentimentScore})`);
        }
      }
    }
    
    if (context.config.minSentimentScore !== undefined) {
      if (typeof parsed.sentimentScore !== 'number') {
        throw new Error(`Expected sentimentScore to be a number, but it's missing or invalid`);
      }
      if (parsed.sentimentScore >= context.config.minSentimentScore) {
        throw new Error(`Expected sentimentScore < ${context.config.minSentimentScore}, got ${parsed.sentimentScore}`);
      }
    }
    
    // maxSentimentScore without expectedSentiment means just check sentimentScore
    if (context.config.maxSentimentScore !== undefined && !context.config.expectedSentiment) {
      if (typeof parsed.sentimentScore !== 'number') {
        throw new Error(`Expected sentimentScore to be a number, but it's missing or invalid`);
      }
      // maxSentimentScore means "must be more negative than this" (e.g., if maxSentimentScore is -0.01, sentimentScore should be < -0.01)
      if (parsed.sentimentScore >= context.config.maxSentimentScore) {
        throw new Error(`Expected sentimentScore < ${context.config.maxSentimentScore} (more negative), got ${parsed.sentimentScore}`);
      }
    }
    
    // Category validation
    if (context.config.expectedCategory !== undefined) {
      if (!parsed.category || typeof parsed.category !== 'string') {
        throw new Error(`Expected category to be a string, but it's missing or invalid`);
      }
      const expectedCategories = Array.isArray(context.config.expectedCategory) 
        ? context.config.expectedCategory 
        : [context.config.expectedCategory];
      if (!expectedCategories.includes(parsed.category)) {
        throw new Error(`Expected category to be one of [${expectedCategories.join(', ')}], got "${parsed.category}"`);
      }
    }
    
    // Category exclusion validation (ensure category is NOT one of these)
    if (context.config.excludedCategories !== undefined) {
      if (!parsed.category || typeof parsed.category !== 'string') {
        throw new Error(`Expected category to be a string, but it's missing or invalid`);
      }
      const excludedCategories = Array.isArray(context.config.excludedCategories) 
        ? context.config.excludedCategories 
        : [context.config.excludedCategories];
      if (excludedCategories.includes(parsed.category)) {
        throw new Error(`Category should NOT be one of [${excludedCategories.join(', ')}], but got "${parsed.category}"`);
      }
    }
  }
  
  return true;
};
