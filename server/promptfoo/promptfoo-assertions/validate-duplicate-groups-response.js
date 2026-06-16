/**
 * Validates a merge_duplicate_categories response.
 *
 * The prompt must return { "duplicate_groups": [ { canonical, members[] } ] }
 * where every name is copied verbatim from the input list, each group has >= 2
 * distinct members, and canonical is one of the members.
 *
 * Optional config:
 *  - inputNames: string[]            every member/canonical must be one of these
 *  - mustMergePairs: string[][]      each pair MUST end up in the same group
 *  - mustNotMerge: string[][]        each pair MUST NOT end up in the same group
 *  - maxGroups: number               at most this many groups
 *
 * @param {string|object} output - The LLM output
 * @param {object} context - Test context with expected values
 * @returns {boolean} - true if valid
 */
module.exports = (output, context) => {
  let parsed;
  try {
    let jsonString =
      typeof output === 'string' ? output : JSON.stringify(output);
    jsonString = jsonString
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const objMatch = jsonString.match(/\{[\s\S]*\}/);
    if (objMatch) jsonString = objMatch[0];
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(
      'Response must be valid JSON. Got: ' +
        (typeof output === 'string'
          ? output.substring(0, 200)
          : JSON.stringify(output).substring(0, 200)),
    );
  }

  if (!parsed || !Array.isArray(parsed.duplicate_groups)) {
    throw new Error('Response must have a "duplicate_groups" array');
  }

  const groups = parsed.duplicate_groups;
  const cfg = context.config || {};
  const norm = (s) => String(s).trim().toLowerCase();
  const inputSet = cfg.inputNames
    ? new Set(cfg.inputNames.map(norm))
    : null;

  const maxGroups = cfg.maxGroups;
  if (maxGroups !== undefined && groups.length > maxGroups) {
    throw new Error(
      `Expected at most ${maxGroups} duplicate groups, got ${groups.length}`,
    );
  }

  // Map each member name -> the group index it landed in (for pair checks)
  const groupOf = new Map();

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g || !Array.isArray(g.members)) {
      throw new Error(`Group ${i + 1} must have a "members" array`);
    }
    const distinct = new Set(g.members.map(norm));
    if (distinct.size < 2) {
      throw new Error(
        `Group ${i + 1} must contain at least 2 distinct members`,
      );
    }
    if (!g.canonical || !distinct.has(norm(g.canonical))) {
      throw new Error(
        `Group ${i + 1} canonical "${g.canonical}" must be one of its members`,
      );
    }
    for (const m of g.members) {
      if (inputSet && !inputSet.has(norm(m))) {
        throw new Error(
          `Group ${i + 1} member "${m}" is not one of the input categories`,
        );
      }
      groupOf.set(norm(m), i);
    }
  }

  for (const pair of cfg.mustMergePairs || []) {
    const [a, b] = pair.map(norm);
    if (groupOf.get(a) === undefined || groupOf.get(a) !== groupOf.get(b)) {
      throw new Error(
        `Expected "${pair[0]}" and "${pair[1]}" to be merged into the same group`,
      );
    }
  }

  for (const pair of cfg.mustNotMerge || []) {
    const [a, b] = pair.map(norm);
    if (
      groupOf.get(a) !== undefined &&
      groupOf.get(a) === groupOf.get(b)
    ) {
      throw new Error(
        `"${pair[0]}" and "${pair[1]}" must NOT be merged but were grouped together`,
      );
    }
  }

  return true;
};
