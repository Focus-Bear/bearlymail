/**
 * Validates a discover_user_context response (slim onboarding discovery).
 *
 * Config options (all optional):
 *   minCategories / maxCategories — bounds on categories.length
 *   forbiddenCategoryTerms        — lowercase substrings no category name may contain
 *                                   (per-sender variants, existing categories)
 *   expectedCategoryTerms         — lowercase substrings; each must appear in at
 *                                   least one category name or description
 *   maxCategoryShare              — 0-1; no category's threadNumbers may cover more
 *                                   than this share of the sample (vars.threadCount)
 *   forbiddenCategoryNames        — lowercase names (emoji/punctuation ignored) no
 *                                   category may have exactly, e.g. a catch-all bucket
 *   forbiddenVipTerms             — lowercase substrings no VIP name may contain
 *   expectedVipTerms              — lowercase substrings; each must match a VIP name
 *   forbiddenVipEmails            — lowercase substrings no VIP email may contain
 *   maxVips                       — upper bound on vipContacts.length
 *   minProjects / maxProjects     — bounds on projects.length
 *   expectedProjectTerms          — lowercase substrings; each must match a project name
 *   forbiddenProjectTerms         — lowercase substrings no project name may contain
 *
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with config
 * @returns {boolean} - true if valid
 */
module.exports = (output, context) => {
  let parsed;
  try {
    let jsonString = typeof output === 'string' ? output : JSON.stringify(output);
    jsonString = jsonString.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Response must be a valid JSON object. Got: ' + String(output).substring(0, 200));
  }

  const config = context.config || {};
  const { categories, vipContacts, projects, urgentHints, notUrgentHints } = parsed;

  if (!Array.isArray(categories)) throw new Error('categories must be an array');
  if (!Array.isArray(vipContacts)) throw new Error('vipContacts must be an array');
  if (!Array.isArray(projects)) throw new Error('projects must be an array');
  if (!Array.isArray(urgentHints)) throw new Error('urgentHints must be an array');
  if (!Array.isArray(notUrgentHints)) throw new Error('notUrgentHints must be an array');

  const emojiPrefix = /^\p{Extended_Pictographic}/u;
  const normalise = (name) =>
    name
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/[^\p{Letter}\p{Number}&]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const seen = new Set();
  for (const category of categories) {
    if (!category || typeof category.name !== 'string' || !category.name.trim()) {
      throw new Error('Every category needs a non-empty string name: ' + JSON.stringify(category));
    }
    if (typeof category.description !== 'string' || !category.description.trim()) {
      throw new Error(`Category "${category.name}" needs a description`);
    }
    if (!emojiPrefix.test(category.name.trim())) {
      throw new Error(`Category "${category.name}" must start with an emoji`);
    }
    const wordCount = normalise(category.name).split(' ').filter(Boolean).length;
    if (wordCount < 1 || wordCount > 5) {
      throw new Error(`Category "${category.name}" must be 1-5 words after the emoji`);
    }
    if (category.threadNumbers !== undefined) {
      const threadCount = Number((context.vars || {}).threadCount);
      const isValidNumber = (n) => Number.isInteger(n) && n >= 1 && (!threadCount || n <= threadCount);
      if (!Array.isArray(category.threadNumbers) || !category.threadNumbers.every(isValidNumber)) {
        throw new Error(`Category "${category.name}" threadNumbers must be thread numbers from the sample: ${JSON.stringify(category.threadNumbers)}`);
      }
    }
    const key = normalise(category.name);
    if (seen.has(key)) {
      throw new Error(`Duplicate category name: "${category.name}"`);
    }
    seen.add(key);
  }

  if (config.minCategories !== undefined && categories.length < config.minCategories) {
    throw new Error(`Expected at least ${config.minCategories} categories, got ${categories.length}: ${categories.map((c) => c.name).join(', ')}`);
  }
  if (config.maxCategories !== undefined && categories.length > config.maxCategories) {
    throw new Error(`Expected at most ${config.maxCategories} categories, got ${categories.length}: ${categories.map((c) => c.name).join(', ')}`);
  }

  if (config.maxCategoryShare !== undefined) {
    const threadCount = Number((context.vars || {}).threadCount);
    for (const category of categories) {
      const share = new Set(category.threadNumbers || []).size / threadCount;
      if (share > config.maxCategoryShare) {
        throw new Error(`Category "${category.name}" holds ${Math.round(share * 100)}% of the sample (max ${Math.round(config.maxCategoryShare * 100)}%) — split it by intent/topic`);
      }
    }
  }
  for (const name of config.forbiddenCategoryNames || []) {
    const hit = categories.find((c) => normalise(c.name) === normalise(name));
    if (hit) throw new Error(`Category "${hit.name}" is a catch-all bucket — split it by intent/topic`);
  }

  const categoryNames = categories.map((c) => c.name.toLowerCase());
  for (const term of config.forbiddenCategoryTerms || []) {
    const hit = categoryNames.find((name) => name.includes(term.toLowerCase()));
    if (hit) throw new Error(`Category "${hit}" must not contain "${term}"`);
  }
  const categoryText = categories.map((c) => `${c.name} ${c.description}`.toLowerCase());
  for (const term of config.expectedCategoryTerms || []) {
    if (!categoryText.some((text) => text.includes(term.toLowerCase()))) {
      throw new Error(`Expected a category about "${term}". Got: ${categories.map((c) => c.name).join(', ')}`);
    }
  }

  for (const vip of vipContacts) {
    if (!vip || typeof vip.name !== 'string' || !vip.name.trim()) {
      throw new Error('Every VIP needs a non-empty string name: ' + JSON.stringify(vip));
    }
    if (typeof vip.reason !== 'string' || !vip.reason.trim()) {
      throw new Error(`VIP "${vip.name}" needs a reason — it is shown when the user hovers the VIP`);
    }
  }
  if (config.maxVips !== undefined && vipContacts.length > config.maxVips) {
    throw new Error(`Expected at most ${config.maxVips} VIPs, got ${vipContacts.length}`);
  }
  const vipNames = vipContacts.map((vip) => vip.name.toLowerCase());
  const vipEmails = vipContacts.map((vip) => String(vip.email || '').toLowerCase());
  for (const term of config.forbiddenVipTerms || []) {
    const hit = vipNames.find((name) => name.includes(term.toLowerCase()));
    if (hit) throw new Error(`VIP "${hit}" must not be listed (matches "${term}")`);
  }
  for (const term of config.forbiddenVipEmails || []) {
    const hit = vipEmails.find((email) => email.includes(term.toLowerCase()));
    if (hit) throw new Error(`VIP email "${hit}" must not be recorded (matches "${term}")`);
  }
  for (const term of config.expectedVipTerms || []) {
    if (!vipNames.some((name) => name.includes(term.toLowerCase()))) {
      throw new Error(`Expected VIP matching "${term}". Got: ${vipNames.join(', ') || '(none)'}`);
    }
  }

  for (const project of projects) {
    if (!project || typeof project.name !== 'string' || !project.name.trim()) {
      throw new Error('Every project needs a non-empty string name: ' + JSON.stringify(project));
    }
  }
  if (config.minProjects !== undefined && projects.length < config.minProjects) {
    throw new Error(`Expected at least ${config.minProjects} projects, got ${projects.length}`);
  }
  if (config.maxProjects !== undefined && projects.length > config.maxProjects) {
    throw new Error(`Expected at most ${config.maxProjects} projects, got ${projects.length}: ${projects.map((p) => p.name).join(', ')}`);
  }
  const projectNames = projects.map((project) => project.name.toLowerCase());
  for (const term of config.forbiddenProjectTerms || []) {
    const hit = projectNames.find((name) => name.includes(term.toLowerCase()));
    if (hit) throw new Error(`Project "${hit}" must not be listed (matches "${term}")`);
  }
  for (const term of config.expectedProjectTerms || []) {
    if (!projectNames.some((name) => name.includes(term.toLowerCase()))) {
      throw new Error(`Expected a project matching "${term}". Got: ${projectNames.join(', ') || '(none)'}`);
    }
  }

  return true;
};
