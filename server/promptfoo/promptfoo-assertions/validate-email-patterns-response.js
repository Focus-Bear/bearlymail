/**
 * Validates that the output is a valid JSON object for email pattern analysis
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with config
 * @returns {boolean} - true if valid, throws error if invalid
 */
module.exports = (output, context) => {
  let parsed;
  try {
    let jsonString = typeof output === 'string' ? output : JSON.stringify(output);
    // Handle markdown code blocks
    jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Response must be valid JSON. Got: ' + output.substring(0, 200));
  }
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  
  // Validate required structure
  if (!parsed.context || !Array.isArray(parsed.context)) {
    throw new Error('Response must contain a "context" array');
  }
  
  if (!parsed.writingStyle || typeof parsed.writingStyle !== 'object') {
    throw new Error('Response must contain a "writingStyle" object');
  }
  
  // Validate writingStyle structure
  if (typeof parsed.writingStyle.tone !== 'string') {
    throw new Error('writingStyle.tone must be a string');
  }
  
  if (typeof parsed.writingStyle.style !== 'string') {
    throw new Error('writingStyle.style must be a string');
  }
  
  if (!Array.isArray(parsed.writingStyle.commonPhrases)) {
    throw new Error('writingStyle.commonPhrases must be an array');
  }
  
  // Validate context items
  for (let i = 0; i < parsed.context.length; i++) {
    const item = parsed.context[i];
    if (!item || typeof item !== 'object') {
      throw new Error(`Context item ${i + 1} must be an object`);
    }
    if (!item.key || typeof item.key !== 'string') {
      throw new Error(`Context item ${i + 1} must have a "key" string. Got: ${JSON.stringify(item)}`);
    }
    if (item.value === undefined || item.value === null || typeof item.value !== 'string') {
      throw new Error(`Context item ${i + 1} must have a "value" string. Got: ${JSON.stringify(item)}`);
    }
    if (!item.source || typeof item.source !== 'string') {
      throw new Error(`Context item ${i + 1} must have a "source" string. Got: ${JSON.stringify(item)}`);
    }
  }
  
  // Check config assertions
  const config = context.config || {};
  
  // Check if should have a specific context key (can be string or array of strings)
  const shouldHaveContextKey = config.shouldHaveContextKey;
  if (shouldHaveContextKey) {
    const expectedKeys = Array.isArray(shouldHaveContextKey) ? shouldHaveContextKey : [shouldHaveContextKey];
    const hasKey = parsed.context.some(item => expectedKeys.includes(item.key));
    if (!hasKey) {
      const expectedKeysStr = expectedKeys.join('" or "');
      throw new Error(`Expected to find context key "${expectedKeysStr}", but didn't. Found keys: ${parsed.context.map(c => c.key).join(', ')}`);
    }
  }
  
  // Check if should contain a specific value (can be string or array of strings)
  const shouldContainValue = config.shouldContainValue;
  if (shouldContainValue) {
    const requiredValues = Array.isArray(shouldContainValue) ? shouldContainValue : [shouldContainValue];
    for (const requiredValue of requiredValues) {
      const found = parsed.context.some(item => 
        item.value.toLowerCase().includes(requiredValue.toLowerCase()) ||
        item.key.toLowerCase().includes(requiredValue.toLowerCase())
      );
      if (!found) {
        const allValues = parsed.context.map(c => c.value).join(', ');
        throw new Error(`Expected to find value containing "${requiredValue}", but didn't. Found values: ${allValues}`);
      }
    }
  }
  
  // Check if should NOT contain a specific value (can be string or array of strings)
  // Only check VIP_CONTACT items unless specified otherwise
  const shouldNotContainValue = config.shouldNotContainValue;
  const shouldNotContainInKey = config.shouldNotContainInKey; // Optional: specify which key(s) to check (string or array)
  if (shouldNotContainValue) {
    const forbiddenValues = Array.isArray(shouldNotContainValue) ? shouldNotContainValue : [shouldNotContainValue];
    for (const forbiddenValue of forbiddenValues) {
      // By default, only check VIP_CONTACT unless specified otherwise
      // Support both single key (string) and multiple keys (array)
      const keysToCheck = shouldNotContainInKey 
        ? (Array.isArray(shouldNotContainInKey) ? shouldNotContainInKey : [shouldNotContainInKey])
        : ['VIP_CONTACT'];
      
      const itemsToCheck = parsed.context.filter(item => keysToCheck.includes(item.key));
      
      // If no specific key was requested and we're checking VIP_CONTACT, check all if no VIP_CONTACT items exist
      const contextToSearch = (shouldNotContainInKey || itemsToCheck.length > 0) 
        ? itemsToCheck 
        : parsed.context;
      
      const found = contextToSearch.some(item => 
        item.value.toLowerCase().includes(forbiddenValue.toLowerCase()) ||
        item.key.toLowerCase().includes(forbiddenValue.toLowerCase())
      );
      if (found) {
        const allValues = contextToSearch.map(c => c.value).join(', ');
        const keyName = Array.isArray(shouldNotContainInKey) ? shouldNotContainInKey.join(' or ') : (shouldNotContainInKey || 'VIP_CONTACT');
        throw new Error(`Should NOT contain value with "${forbiddenValue}" in ${keyName}, but found one. Found values: ${allValues}`);
      }
    }
  }
  
  // Check if should have writing style
  const shouldHaveWritingStyle = config.shouldHaveWritingStyle;
  if (shouldHaveWritingStyle !== undefined) {
    if (shouldHaveWritingStyle && (!parsed.writingStyle || !parsed.writingStyle.tone)) {
      throw new Error('Expected writingStyle to be present and have a tone');
    }
  }
  
  // Check if should have common phrases
  const shouldHaveCommonPhrases = config.shouldHaveCommonPhrases;
  if (shouldHaveCommonPhrases !== undefined) {
    if (shouldHaveCommonPhrases && (!parsed.writingStyle.commonPhrases || parsed.writingStyle.commonPhrases.length === 0)) {
      throw new Error('Expected writingStyle.commonPhrases to be present and non-empty');
    }
  }
  
  // Check minimum common phrases
  const minCommonPhrases = config.minCommonPhrases;
  if (minCommonPhrases !== undefined) {
    if (!parsed.writingStyle.commonPhrases || parsed.writingStyle.commonPhrases.length < minCommonPhrases) {
      throw new Error(`Expected at least ${minCommonPhrases} common phrases, got ${parsed.writingStyle.commonPhrases?.length || 0}`);
    }
  }
  
  // Check minimum context items
  const minContextItems = config.minContextItems;
  if (minContextItems !== undefined) {
    if (parsed.context.length < minContextItems) {
      throw new Error(`Expected at least ${minContextItems} context items, got ${parsed.context.length}`);
    }
  }
  
  return true;
};
