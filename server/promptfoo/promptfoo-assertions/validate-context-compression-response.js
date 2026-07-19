module.exports = (output, context) => {
  let parsed;
  try {
    let jsonString = typeof output === 'string' ? output : JSON.stringify(output);
    jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonString = jsonMatch[0];
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Response must be valid JSON object. Got: ${String(output).slice(0, 180)}`);
  }

  const result = parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed;
  if (!Array.isArray(result.items)) {
    throw new Error('result.items must be an array');
  }

  const maxItemsPerKey = context.config?.maxItemsPerKey ?? 8;
  const keyCounts = new Map();

  for (const item of result.items) {
    if (!item.key || typeof item.key !== 'string') {
      throw new Error('Each item must contain string key');
    }
    if (!item.value || typeof item.value !== 'string') {
      throw new Error('Each item must contain string value');
    }
    if (item.value.length > 140) {
      throw new Error(`Compressed value exceeds 140 char limit for key ${item.key}`);
    }
    keyCounts.set(item.key, (keyCounts.get(item.key) || 0) + 1);
  }

  for (const [key, count] of keyCounts.entries()) {
    if (count > maxItemsPerKey) {
      throw new Error(`Too many items for key ${key}: ${count} > ${maxItemsPerKey}`);
    }
  }

  return true;
};

