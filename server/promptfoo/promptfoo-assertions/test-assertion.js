// Simple test to verify promptfoo can load external files
module.exports = (output, context) => {
  console.error('[TEST] External assertion file loaded! Output:', output?.substring(0, 50));
  // This should fail - always return false
  return false;
};
