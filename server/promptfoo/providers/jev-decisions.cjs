require("./jev-categorisation.cjs"); // Register the shared TypeScript transport.
const { JEV } = require("../../src/constants/jev.constants");
const { requestJev } = require("../../src/llm/jev-system-one");
const { createPlan } = require("./jev-decision-plan.cjs");
const { compose } = require("./jev-decision-output.cjs");
module.exports = class JevDecisionProvider {
  constructor(options) {
    this.config = options.config;
  }
  id() {
    return "jev-raw";
  }
  async callApi(prompt, context) {
    try {
      if (!process.env[JEV.API_KEY_ENV]) throw new Error("Missing Jev API key");
      const plan = createPlan(this.config.suite, context.vars, prompt);
      const response = await requestJev(
        {
          state: { input: context.vars },
          model: process.env[JEV.MODEL_ENV] || JEV.DEFAULT_MODEL,
          questions: plan.questions,
        },
        process.env[JEV.API_KEY_ENV],
      );
      const result = compose(plan, response.answers);
      return {
        output: JSON.stringify(result.output),
        tokenUsage: {
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
        metadata: {
          model: response.model,
          answers: response.answers,
          generationRequired: result.generationRequired,
          uncertain: result.uncertain,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Jev evaluation failed",
      };
    }
  }
};
