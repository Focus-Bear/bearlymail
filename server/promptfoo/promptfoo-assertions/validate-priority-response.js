/**
 * Validates a priority analysis response
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with expected values
 * @returns {boolean} - true if valid
 */
module.exports = (output, context) => {
  console.log('validate-priority-response', output, context);
  // Validate JSON first
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (e) {
    throw new Error('Response must be valid JSON. Got: ' + output.substring(0, 200));
  }
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  
  // Validate required fields
  if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
    throw new Error('Response must have a valid score (0-100)');
  }
  
  if (typeof parsed.isUrgent !== 'boolean') {
    throw new Error('Response must have a boolean isUrgent field');
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
    if (context.config.minScore !== undefined && parsed.score < context.config.minScore) {
      throw new Error(`Expected score >= ${context.config.minScore}, got ${parsed.score}`);
    }
    
    if (context.config.maxScore !== undefined && parsed.score > context.config.maxScore) {
      throw new Error(`Expected score <= ${context.config.maxScore}, got ${parsed.score}`);
    }
    
    if (context.config.expectedIsUrgent !== undefined && parsed.isUrgent !== context.config.expectedIsUrgent) {
      throw new Error(`Expected isUrgent to be ${context.config.expectedIsUrgent}, got ${parsed.isUrgent}`);
    }
    
    if (context.config.expectedSentiment) {
      const expectedSentiments = Array.isArray(context.config.expectedSentiment) 
        ? context.config.expectedSentiment 
        : [context.config.expectedSentiment];
      
      // If maxSentimentScore is also specified, allow OR logic: sentiment matches OR sentimentScore is negative
      if (context.config.maxSentimentScore !== undefined) {
        const sentimentMatches = expectedSentiments.includes(parsed.sentiment);
        const sentimentScoreValid = typeof parsed.sentimentScore === 'number' && parsed.sentimentScore < context.config.maxSentimentScore;
        
        if (!sentimentMatches && !sentimentScoreValid) {
          throw new Error(`Expected sentiment to be one of [${expectedSentiments.join(', ')}] OR sentimentScore < ${context.config.maxSentimentScore}, got sentiment=${parsed.sentiment}, sentimentScore=${parsed.sentimentScore}`);
        }
      } else {
        // No sentimentScore check, just validate sentiment
        if (!expectedSentiments.includes(parsed.sentiment)) {
          throw new Error(`Expected sentiment to be one of [${expectedSentiments.join(', ')}], got ${parsed.sentiment}`);
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
  }
  
  return true;
};
