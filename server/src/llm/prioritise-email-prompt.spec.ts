import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

/**
 * Guards the invariant that category selection NEVER happens inside the
 * analyze_priority prompt: the category is chosen beforehand by the
 * category-only prompt (see priority-category-step.ts) and the priority prompt
 * only scores urgency + goal alignment for the assigned category. Exercises the
 * REAL prompt template and the REAL renderer, so any reintroduction of the
 * category-selection machinery (and its ~12K chars of rules) is caught.
 */
describe("prioritise-email prompt: scores an already-assigned category only", () => {
  // Phrases that only exist inside the category-selection / GitHub rule blocks.
  const GITHUB_QA_RULE_PHRASE = "QA pass vs fail";
  const CATEGORY_SELECTION_HEADING = "Category selection — follow IN ORDER";
  const PROTO_CATEGORY_SECTION = "## protoCategorySuggestion";
  const TEMPLATE_TAG = /\{%|%\}/;
  // Generous ceiling: the old combined prompt rendered to ~17K+ chars.
  const MAX_RENDERED_CHARS = 9000;

  const vars = {
    fromName: "Sender Name",
    subject: "Test subject",
    body: "Test email body.",
    currentDate: "Monday, July 20, 2026 at 9:00 AM",
    emailCategories: '   1. "Customer Support": support requests',
  };

  function render(): string {
    const config = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    expect(config).not.toBeNull();
    const system = renderPrompt(config!.systemPrompt, vars);
    const user = renderPrompt(config!.prompt, vars);
    return `${system}\n${user}`;
  }

  it("contains no category-selection or GitHub categorisation rules", () => {
    const rendered = render();
    expect(rendered).not.toContain(CATEGORY_SELECTION_HEADING);
    expect(rendered).not.toContain(PROTO_CATEGORY_SECTION);
    expect(rendered).not.toContain(GITHUB_QA_RULE_PHRASE);
  });

  it("tells the model the category is already assigned and shows it", () => {
    const rendered = render();
    expect(rendered.toLowerCase()).toContain("already been assigned");
    expect(rendered).toContain("Category (already assigned)");
    expect(rendered).toContain('"Customer Support"');
  });

  it("keeps the urgency and goal-alignment scoring rules", () => {
    const rendered = render();
    expect(rendered).toContain("urgencyScore");
    expect(rendered).toContain("goalAlignmentScore");
  });

  it("renders no leftover Nunjucks tags", () => {
    expect(TEMPLATE_TAG.test(render())).toBe(false);
  });

  it("stays small now that the category machinery is gone", () => {
    expect(render().length).toBeLessThan(MAX_RENDERED_CHARS);
  });
});
