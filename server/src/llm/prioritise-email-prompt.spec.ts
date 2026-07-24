import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

/**
 * Guards the cost optimisation that omits the category-selection machinery from
 * the analyze_priority prompt when a deterministic rule has already assigned the
 * category (`categoryPreAssigned`). Exercises the REAL prompt template and the
 * REAL renderer so a regression in either the Nunjucks gating or the custom
 * renderer's `{% if %}/{% else %}` handling is caught.
 */
describe("prioritise-email prompt: categoryPreAssigned gating", () => {
  // A distinctive phrase that only exists inside the gated category-selection
  // rules (the GitHub QA pass/fail block). Its presence/absence proves whether
  // the ~12K chars of category machinery rendered.
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

  function render(categoryPreAssigned: boolean): string {
    const config = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    expect(config).not.toBeNull();
    const system = renderPrompt(config!.systemPrompt, {
      ...baseVars,
      categoryPreAssigned,
    });
    const user = renderPrompt(config!.prompt, {
      ...baseVars,
      categoryPreAssigned,
    });
    return `${system}\n${user}`;
  }

  it("includes the full category-selection rules when NOT pre-assigned", () => {
    const full = render(false);
    expect(full).toContain(GITHUB_QA_RULE_PHRASE);
    expect(full).toContain(CATEGORY_SELECTION_HEADING);
    expect(full).toContain(PROTO_CATEGORY_SECTION);
  });

  it("omits the category-selection rules when pre-assigned", () => {
    const slim = render(true);
    expect(slim).not.toContain(GITHUB_QA_RULE_PHRASE);
    expect(slim).not.toContain(CATEGORY_SELECTION_HEADING);
    expect(slim).not.toContain(PROTO_CATEGORY_SECTION);
    // Still instructs the model that a rule assigned the category.
    expect(slim.toLowerCase()).toContain("assigned by a");
  });

  it("keeps urgency + goal scoring rules in BOTH branches", () => {
    for (const preAssigned of [false, true]) {
      const rendered = render(preAssigned);
      expect(rendered).toContain("urgencyScore");
      expect(rendered).toContain("goalAlignmentScore");
    }
  });

  it("renders no leftover Nunjucks tags in either branch", () => {
    expect(TEMPLATE_TAG.test(render(false))).toBe(false);
    expect(TEMPLATE_TAG.test(render(true))).toBe(false);
  });

  it("cuts the pre-assigned prompt to roughly half the full prompt or less", () => {
    const fullLen = render(false).length;
    const slimLen = render(true).length;
    expect(slimLen).toBeLessThan(fullLen * 0.6);
  });
});
