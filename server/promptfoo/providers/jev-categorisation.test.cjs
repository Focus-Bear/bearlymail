const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Provider = require('./jev-categorisation.cjs');
const originalFetch = global.fetch;
const originalKey = process.env.TYPESAFE_AI_API_KEY;
const VARS = {
  subject: 'Review completed', summary: 'QA verified the fix.',
  githubFacts: 'project status: QA passed',
  categories: '1. "QA failed": Fix failed\n2. QA — passed — Verified fix',
};

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TYPESAFE_AI_API_KEY;
  else process.env.TYPESAFE_AI_API_KEY = originalKey;
});

test('preserves full category descriptions and authoritative facts without ambiguous name splitting', () => {
  const request = Provider.buildRequest(VARS, 'test-model');
  assert.equal(request.state.githubFacts, VARS.githubFacts);
  assert.equal(request.questions.category.criteria['2'], 'QA — passed — Verified fix');
  assert.match(request.questions.category.criteria['0'], /Other/);
  assert.match(request.questions.category.instructions, /exclusion/);
});

test('rejects malformed, duplicated and oversized category lists instead of dropping candidates', () => {
  for (const categories of ['', 'Sales', '1. A\n1. B', Array.from({ length: 255 }, (_, index) => `${index + 1}. A`).join('\n')]) {
    assert.throws(() => Provider.buildRequest({ ...VARS, categories }, 'test-model'));
  }
});

test('missing credentials never make a network request', async () => {
  delete process.env.TYPESAFE_AI_API_KEY;
  global.fetch = () => { throw new Error('Unexpected network request'); };
  assert.match((await new Provider().callApi('', { vars: VARS })).error, /TYPESAFE_AI_API_KEY/);
});

test('maps the chosen number and retains raw confidence, model and usage', async () => {
  process.env.TYPESAFE_AI_API_KEY = 'test-only';
  global.fetch = async () => ({ ok: true, json: async () => ({
    model: 'test-model', usage: { input_tokens: 100, output_tokens: 10 },
    answers: { category: { type: 'choice', choice: '2', confidence: 0.8, probabilities: { 0: 0, 1: 0.1, 2: 0.9 } } },
  }) });
  const response = await new Provider().callApi('', { vars: VARS });
  assert.equal(JSON.parse(response.output).result.categoryNumber, 2);
  assert.equal(response.metadata.confidence, 0.8);
  assert.equal(response.tokenUsage.total, 110);
  assert.equal(JSON.parse(response.output).result.protoCategorySuggestion, undefined);
});

test('service failures and unknown choices are errors, never scored Other responses', async () => {
  process.env.TYPESAFE_AI_API_KEY = 'test-only';
  global.fetch = async () => ({ ok: false, status: 429 });
  assert.equal((await new Provider().callApi('', { vars: VARS })).error, 'Jev HTTP 429');
  global.fetch = async () => ({ ok: true, json: async () => ({
    answers: { category: { type: 'choice', choice: '99', confidence: 1, probabilities: {} } },
  }) });
  assert.match((await new Provider().callApi('', { vars: VARS })).error, /Invalid/);
});
