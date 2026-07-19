/**
 * Validates an action items extraction response
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with expected values
 * @returns {boolean} - true if valid
 */
module.exports = (output, context) => {
  // Validate JSON first - handle markdown code blocks
  let parsed;
  try {
    let jsonString = typeof output === 'string' ? output : JSON.stringify(output);
    // Remove markdown code blocks if present
    jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Response must be valid JSON. Got: ' + output.substring(0, 200));
  }
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  
  // Validate structure
  if (!parsed.actionItems || !Array.isArray(parsed.actionItems)) {
    throw new Error('Response must contain an "actionItems" array');
  }
  
  // Validate minimum count if specified
  const minCount = context.config?.minCount;
  if (minCount !== undefined && parsed.actionItems.length < minCount) {
    throw new Error(`Expected at least ${minCount} action items, got ${parsed.actionItems.length}`);
  }
  
  // Validate maximum count if specified
  const maxCount = context.config?.maxCount;
  if (maxCount !== undefined && parsed.actionItems.length > maxCount) {
    throw new Error(`Expected at most ${maxCount} action items, got ${parsed.actionItems.length}`);
  }
  
  // Validate each action item has required fields
  const allDescriptions = [];
  for (let i = 0; i < parsed.actionItems.length; i++) {
    const item = parsed.actionItems[i];
    if (!item.description || typeof item.description !== 'string') {
      throw new Error(`Action item ${i + 1} must have a "description" string`);
    }
    // confidence is optional — some models omit it; default to 1 if missing
    if (item.confidence !== undefined) {
      if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
        throw new Error(`Action item ${i + 1} "confidence" must be a number between 0 and 1`);
      }
    }
    allDescriptions.push(item.description.toLowerCase());
  }
  
  // Check for required phrases (shouldContain)
  const shouldContain = context.config?.shouldContain;
  if (shouldContain && Array.isArray(shouldContain)) {
    for (const phrase of shouldContain) {
      const found = allDescriptions.some(desc => desc.includes(phrase.toLowerCase()));
      if (!found) {
        throw new Error(`Expected to find action item containing "${phrase}", but didn't. Found: ${allDescriptions.join(', ')}`);
      }
    }
  }
  
  // Check for forbidden phrases (shouldNotContain)
  const shouldNotContain = context.config?.shouldNotContain;
  if (shouldNotContain && Array.isArray(shouldNotContain)) {
    for (const phrase of shouldNotContain) {
      const found = allDescriptions.some(desc => desc.includes(phrase.toLowerCase()));
      if (found) {
        throw new Error(`Should NOT contain action item with "${phrase}", but found one. Found: ${allDescriptions.join(', ')}`);
      }
    }
  }
  
  return true;
};
