import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

/**
 * Guards two cost optimisations layered into the analyze_priority prompt:
 *
 *  1. `categoryPreAssigned` — omits the whole category-selection machinery when
 *     a deterministic rule already assigned the category.
 *  2. `showGithubRules` — omits the large GitHub-specific categorisation
 *     rules block (~6K chars) unless the email is actually from a GitHub sender.
 *
 * Exercises the REAL prompt template and the REAL renderer so a regression in
 * either the Nunjucks gating or the custom renderer's `{% if %}/{% else %}`
 * handling is caught. The two gates are SEQUENTIAL (not nested) because the
 * custom renderer cannot parse nested `{% if %}` blocks.
 */
describe("prioritise-email prompt: category + GitHub gating", () => {
  // A distinctive phrase that only exists inside the GitHub-specific rules block.
  // Its presence/absence proves whether the GitHub rules rendered.
  const GITHUB_QA_RULE_PHRASE = "QA pass vs fail";
  const CATEGORY_SELECTION_HEADING = "Category selection — follow IN ORDER";
  const PROTO_CATEGORY_SECTION = "## protoCategorySuggestion";
  const TEMPLATE_TAG = /\{%|%\}/;

  const baseVars = {
    fromName: "Sender Name",
    subject: "Test subject",
    body: "Test email body.",
    currentDate: "Monday, July 20, 2026 at 9:00 AM",
    emailCategories: '1. "Customer Support": support requests',
  };

  function render(
    categoryPreAssigned: boolean,
    showGithubRules = false,
  ): string {
    const config = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    expect(config).not.toBeNull();
    const vars = {
      ...baseVars,
      categoryPreAssigned,
      showGithubRules,
    };
    const system = renderPrompt(config!.systemPrompt, vars);
    const user = renderPrompt(config!.prompt, vars);
    return `${system}\n${user}`;
  }

  it("includes the GitHub-specific rules only for GitHub senders", () => {
    const github = render(false, true);
    const nonGithub = render(false, false);
    expect(github).toContain(GITHUB_QA_RULE_PHRASE);
    expect(nonGithub).not.toContain(GITHUB_QA_RULE_PHRASE);
  });

  it("keeps the general category-selection rules for non-GitHub senders", () => {
    const nonGithub = render(false, false);
    expect(nonGithub).toContain(CATEGORY_SELECTION_HEADING);
    expect(nonGithub).toContain(PROTO_CATEGORY_SECTION);
  });

  it("renders a shorter prompt for non-GitHub than for GitHub senders", () => {
    expect(render(false, false).length).toBeLessThan(
      render(false, true).length,
    );
  });

  it("omits the category-selection rules when pre-assigned", () => {
    // The service only ever sets showGithubRules when NOT pre-assigned,
    // so the realistic pre-assigned render has the GitHub gate off.
    const slim = render(true, false);
    expect(slim).not.toContain(GITHUB_QA_RULE_PHRASE);
    expect(slim).not.toContain(CATEGORY_SELECTION_HEADING);
    expect(slim).not.toContain(PROTO_CATEGORY_SECTION);
    // Still instructs the model that a rule assigned the category.
    expect(slim.toLowerCase()).toContain("assigned by a");
  });

  it("keeps urgency + goal scoring rules in every branch", () => {
    for (const preAssigned of [false, true]) {
      for (const github of [false, true]) {
        const rendered = render(preAssigned, github);
        expect(rendered).toContain("urgencyScore");
        expect(rendered).toContain("goalAlignmentScore");
      }
    }
  });

  it("renders no leftover Nunjucks tags in any branch", () => {
    for (const preAssigned of [false, true]) {
      for (const github of [false, true]) {
        expect(TEMPLATE_TAG.test(render(preAssigned, github))).toBe(false);
      }
    }
  });

  it("cuts the pre-assigned prompt to roughly half the full prompt or less", () => {
    const fullLen = render(false, true).length;
    const slimLen = render(true, false).length;
    expect(slimLen).toBeLessThan(fullLen * 0.6);
  });
});
