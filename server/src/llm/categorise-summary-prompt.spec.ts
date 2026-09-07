/**
 * The categoriser's GitHub facts block is rendered from the REAL prompt file,
 * so a template typo (or a partial that stops being injected) fails here
 * rather than silently sending an unrendered `{% if githubFacts %}` to the
 * model.
 */
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

const GITHUB_FACTS =
  "Item: issue #812 Focus-Bear/Mac-App · state: open · project status: QA passed (Mac App roadmap)";

const BASE_VARS = {
  subject: "Re: [Focus-Bear/Mac-App] Timer drifts after sleep (Issue #812)",
  senderName: "qa-tester",
  senderEmail: "notifications@github.com",
  summary: "QA — please proceed with testing.",
  categories: "1. ✅ QA passed issues — verified by QA",
  showGithubRules: true,
};

function render(vars: Record<string, unknown>): string {
  const config = getPrompt(UTILITY_PROMPT_IDS.CATEGORISE_SUMMARY);
  expect(config).not.toBeNull();
  return `${renderPrompt(config?.systemPrompt ?? "", vars)}\n${renderPrompt(
    config?.prompt ?? "",
    vars,
  )}`;
}

describe("categorise_summary prompt", () => {
  it("renders the GitHub facts block when facts are supplied", () => {
    const rendered = render({ ...BASE_VARS, githubFacts: GITHUB_FACTS });

    expect(rendered).toContain("### GitHub facts (authoritative)");
    expect(rendered).toContain(GITHUB_FACTS);
  });

  it("omits the facts heading entirely when there are no facts", () => {
    const rendered = render({ ...BASE_VARS, githubFacts: "" });

    expect(rendered).not.toContain("### GitHub facts (authoritative)");
    expect(rendered).toContain(BASE_VARS.summary);
  });

  it("tells the model the facts outrank prose inference", () => {
    const rendered = render({ ...BASE_VARS, githubFacts: GITHUB_FACTS });

    expect(rendered).toContain('"GitHub facts (authoritative)" block');
    expect(rendered).toContain("OUTRANKS");
  });

  it("leaves no unrendered template syntax either way", () => {
    for (const githubFacts of [GITHUB_FACTS, ""]) {
      expect(render({ ...BASE_VARS, githubFacts })).not.toMatch(/\{\{|\{%/);
    }
  });
});
