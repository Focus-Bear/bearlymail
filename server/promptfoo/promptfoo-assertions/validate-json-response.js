/**
 * Validates that the output is a valid JSON object
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context
 * @returns {boolean|object} - true if valid, throws error if invalid
 */
module.exports = (output, context) => {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (e) {
    throw new Error('Response must be valid JSON. Got: ' + output.substring(0, 200));
  }
  
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Response must be a JSON object');
  }
  
  return parsed;
};
