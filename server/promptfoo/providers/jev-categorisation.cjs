const fs = require('node:fs');
const path = require('node:path');

const API_URL = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = 'jev-latest';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OPTIONS = 255;
const OTHER_OPTION = '0';
const OTHER_CATEGORY = 'Other';
const QUESTION_ID = 'category';
const QUESTION_TYPE = 'choice';
const PROMPT_DIRECTORY = path.resolve(__dirname, '../prompts');
const STATE_FIELDS = ['subject', 'senderName', 'senderEmail', 'summary', 'githubFacts'];

function readPrompt(filename) {
  return fs.readFileSync(path.join(PROMPT_DIRECTORY, filename), 'utf8').trim();
}

function parseCategories(text) {
  const categories = new Map();
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*([1-9]\d*)\.\s*(.+?)\s*$/);
    if (!match || categories.has(match[1])) {
      throw new Error('Expected unique positive numbered categories, one per line');
    }
    categories.set(match[1], match[2]);
  }
  if (!categories.size || categories.size >= MAX_OPTIONS) {
    throw new Error(`Expected 1–${MAX_OPTIONS - 1} categories (one option is reserved for Other)`);
  }
  return categories;
}

function buildRequest(vars, model) {
  const categories = parseCategories(vars.categories);
  const criteria = Object.fromEntries(categories);
  criteria[OTHER_OPTION] = 'Other: no listed category reasonably fits after respecting exclusions.';
  const state = Object.fromEntries(STATE_FIELDS.map(field => [field, vars[field] || '']));
  return {
    state,
    model,
    questions: {
      [QUESTION_ID]: {
        type: QUESTION_TYPE,
        instructions: {
          question: readPrompt('categorise-summary-jev.md'),
          selectionRules: readPrompt('_shared/category-selection-rules.md'),
          githubRules: readPrompt('_shared/category-github-rules.md'),
        },
        criteria,
      },
    },
  };
}

function validateAnswer(answer, criteria) {
  if (answer?.type !== QUESTION_TYPE ||
      !Object.hasOwn(criteria, answer.choice) ||
      !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1 ||
      !answer.probabilities ||
      Object.keys(answer.probabilities).length !== Object.keys(criteria).length ||
      Object.keys(criteria).some(option => !Number.isFinite(answer.probabilities[option]) ||
        answer.probabilities[option] < 0 || answer.probabilities[option] > 1)) {
    throw new Error('TypeSafe returned an invalid category Choice answer');
  }
}

class JevCategorisationProvider {
  constructor(options = {}) {
    this.model = options.config?.model || DEFAULT_MODEL;
  }

  id() {
    return `typesafe:${this.model}`;
  }

  async callApi(_prompt, context) {
    const apiKey = process.env.TYPESAFE_AI_API_KEY;
    if (!apiKey) return { error: 'TYPESAFE_AI_API_KEY is required for the Jev categorisation evaluation' };
    try {
      const request = buildRequest(context.vars, this.model);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // Do not turn service failures into an Other verdict or echo response bodies containing email data.
      if (!response.ok) return { error: `TypeSafe HTTP ${response.status}` };
      const result = await response.json();
      const answer = result.answers?.[QUESTION_ID];
      validateAnswer(answer, request.questions[QUESTION_ID].criteria);
      return {
        output: JSON.stringify({
          result: {
            categoryNumber: Number(answer.choice),
            ...(answer.choice === OTHER_OPTION ? { categoryName: OTHER_CATEGORY } : {}),
            // Raw confidence is retained; no uncalibrated HIGH/MEDIUM/LOW mapping or invented prose.
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          },
        }),
        metadata: { model: result.model, confidence: answer.confidence, probabilities: answer.probabilities },
        tokenUsage: result.usage ? {
          prompt: result.usage.input_tokens,
          completion: result.usage.output_tokens,
          total: result.usage.input_tokens + result.usage.output_tokens,
        } : undefined,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Jev categorisation request failed' };
    }
  }
}

module.exports = JevCategorisationProvider;
module.exports.buildRequest = buildRequest;
