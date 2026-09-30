const path = require('node:path');
require('ts-node').register({ transpileOnly: true, project: path.resolve(__dirname, '../../tsconfig.json') });
const { JEV } = require('../../src/constants/jev.constants');
const { buildJevCategoryRequest, requestJevCategory } = require('../../src/llm/jev-category-request');

function toCategoryParams(vars) {
  const categories = [];
  for (const line of String(vars.categories || '').split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*([1-9]\d*)\.\s*(.+?)\s*$/);
    if (!match || Number(match[1]) !== categories.length + 1) {
      throw new Error('Expected consecutive numbered categories, one per line');
    }
    // Keep the whole description: names themselves can contain dashes.
    categories.push({ name: match[2] });
  }
  return { ...vars, categories };
}

function buildRequest(vars, model) {
  return buildJevCategoryRequest(toCategoryParams(vars), model);
}

class JevCategorisationProvider {
  constructor(options = {}) {
    this.model = options.config?.model || process.env[JEV.MODEL_ENV] || JEV.DEFAULT_MODEL;
  }

  id() { return `typesafe:${this.model}`; }

  async callApi(_prompt, context) {
    const apiKey = process.env[JEV.API_KEY_ENV];
    if (!apiKey) return { error: `${JEV.API_KEY_ENV} is required for the Jev categorisation evaluation` };
    try {
      const result = await requestJevCategory(buildRequest(context.vars, this.model), apiKey);
      const answer = result.answers[JEV.QUESTION_ID];
      return {
        output: JSON.stringify({ result: { categoryNumber: Number(answer.choice),
          ...(answer.choice === JEV.OTHER_OPTION ? { categoryName: JEV.OTHER_CATEGORY } : {}),
          confidence: answer.confidence, probabilities: answer.probabilities } }),
        metadata: { model: result.model, confidence: answer.confidence, probabilities: answer.probabilities },
        tokenUsage: { prompt: result.usage.input_tokens, completion: result.usage.output_tokens,
          total: result.usage.input_tokens + result.usage.output_tokens },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Jev categorisation request failed' };
    }
  }
}

module.exports = JevCategorisationProvider;
module.exports.buildRequest = buildRequest;
module.exports.toCategoryParams = toCategoryParams;
