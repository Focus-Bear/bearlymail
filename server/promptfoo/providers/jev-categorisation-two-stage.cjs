const { toCategoryParams } = require("./jev-categorisation.cjs");
const { JevCategoryClient } = require("../../src/llm/jev-category-client");
const { JEV_TWO_STAGE } = require("../../src/constants/jev.constants");

// Production's two-stage Jev path (family, then category) with the flag on.
// Reports only what Jev itself accepts; a declined case is an error here, as
// production would hand it to Gemini.
module.exports = class JevTwoStageProvider {
  id() {
    return "jev-two-stage";
  }

  async callApi(_prompt, context) {
    const usage = [];
    const logger = { log() {}, warn() {} };
    const client = new JevCategoryClient(
      (key) => (key === JEV_TWO_STAGE.ENABLED_ENV ? "true" : process.env[key]),
      logger,
      { logUsage: async (record) => usage.push(record) },
    );
    const apiKey = process.env.TYPESAFE_AI_API_KEY;
    if (!apiKey) return { error: "TYPESAFE_AI_API_KEY is required" };
    let declined = null;
    const result = await client.categorise(
      toCategoryParams(context.vars),
      { apiKey },
      (pick) => {
        declined = pick;
      },
    );
    const promptTokens = usage.reduce((sum, r) => sum + r.promptTokens, 0);
    const tokenUsage = {
      prompt: promptTokens,
      completion: 0,
      total: promptTokens,
    };
    if (!result)
      return {
        error: "Two-stage Jev declined; production falls back to Gemini",
        metadata: { declined },
        tokenUsage,
      };
    return { output: JSON.stringify({ result }), tokenUsage };
  }
};
