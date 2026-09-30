const { toCategoryParams } = require('./jev-categorisation.cjs');
const { JevCategoryClient } = require('../../src/llm/jev-category-client');
const { categoriseWithEscalation } = require('../../src/llm/llm-categorise-summary');
const { buildGeminiGenerationConfig } = require('../../src/llm/gemini-request.helper');
const { GoogleGenAI } = require('@google/genai');
const { STRONG_GEMINI_MODEL, STRONG_GEMINI_MODEL_ENV_VAR } = require('../../src/constants/llm-constants');
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

module.exports = class JevHybridProvider {
  id() { return 'jev-primary-gemini-fallback'; }

  async callApi(_prompt, context) {
    const usage = [];
    const logger = { log() {}, warn() {}, error() {} };
    const jev = new JevCategoryClient(key => process.env[key], logger, {
      logUsage: async record => { usage.push(record); },
    });
    const client = {
      categoriseWithJev: params => jev.categorise(params),
      generateText: async request => {
        const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
        const model = request.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
        const response = await google.models.generateContent({ model,
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          config: buildGeminiGenerationConfig(request),
        });
        usage.push({ provider: 'gemini', model, operation: request.operation,
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0 });
        if (!response.text) throw new Error('Gemini returned no text');
        return response.text;
      },
    };
    try {
      const result = await categoriseWithEscalation(client, logger, {
        ...toCategoryParams(context.vars),
        escalationModel: process.env[STRONG_GEMINI_MODEL_ENV_VAR] || STRONG_GEMINI_MODEL,
      });
      if (!result) return { error: 'Both category providers failed', metadata: { usage } };
      const promptTokens = usage.reduce((sum, record) => sum + record.promptTokens, 0);
      const completionTokens = usage.reduce((sum, record) => sum + record.completionTokens, 0);
      return { output: JSON.stringify({ result }), metadata: { usage },
        tokenUsage: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens } };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Hybrid category evaluation failed' };
    }
  }
};
