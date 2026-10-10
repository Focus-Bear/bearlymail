import * as nunjucks from "nunjucks";

import { renderTemplate } from "./prompt-template-renderer";

/**
 * Parity guard between our minimal renderer and the real Nunjucks that promptfoo
 * uses on the SAME prompt files. If prod and the prompt tests render a template
 * differently, the tests validate a shape prod never produces (issue #266).
 *
 * These tests assert truthiness/branch-selection parity for the constructs we
 * support, and pin the ONE known divergence — empty arrays — so it stays
 * intentional and documented rather than silently drifting.
 */

/** Normalise whitespace so the comparison is about which branch rendered, not
 * the two engines' block-whitespace handling. */
const norm = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

const renderBoth = (
  template: string,
  vars: Record<string, unknown>,
): { ours: string; nunjucks: string } => ({
  ours: norm(renderTemplate(template, vars)),
  nunjucks: norm(nunjucks.renderString(template, vars)),
});

describe("renderer / Nunjucks parity", () => {
  describe("if/else truthiness agrees for scalars", () => {
    const template = "{% if x %}YES{% else %}NO{% endif %}";
    const cases: Array<[string, unknown, string]> = [
      ["non-empty string", "hi", "YES"],
      ["empty string", "", "NO"],
      ["true", true, "YES"],
      ["false", false, "NO"],
      ["zero", 0, "NO"],
      ["positive number", 3, "YES"],
      ["undefined", undefined, "NO"],
    ];
    it.each(cases)("%s", (_label, value, expected) => {
      const { ours, nunjucks: nj } = renderBoth(template, { x: value });
      expect(ours).toBe(expected);
      expect(ours).toBe(nj);
    });
  });

  describe("arrays", () => {
    const template = "{% if xs %}YES{% else %}NO{% endif %}";

    it("agrees for a NON-empty array (both truthy)", () => {
      const { ours, nunjucks: nj } = renderBoth(template, { xs: ["a"] });
      expect(ours).toBe("YES");
      expect(ours).toBe(nj);
    });

    it("KNOWN DIVERGENCE: an empty array is falsy here but truthy in Nunjucks (issue #266)", () => {
      const { ours, nunjucks: nj } = renderBoth(template, { xs: [] });
      // This is the exact trap: do not gate `{% if %}` on an array's truthiness.
      expect(ours).toBe("NO");
      expect(nj).toBe("YES");
      expect(ours).not.toBe(nj);
    });

    it("FIX: gating on an explicit boolean agrees in both engines", () => {
      const boolTemplate = "{% if hasXs %}YES{% else %}NO{% endif %}";
      for (const xs of [[], ["a"]]) {
        const vars = { hasXs: xs.length > 0, xs };
        const { ours, nunjucks: nj } = renderBoth(boolTemplate, vars);
        expect(ours).toBe(xs.length > 0 ? "YES" : "NO");
        expect(ours).toBe(nj);
      }
    });

    it("a for-loop over an empty array renders nothing in both", () => {
      const loop = "start{% for i in xs %}-{{i}}{% endfor %}end";
      const { ours, nunjucks: nj } = renderBoth(loop, { xs: [] });
      expect(ours).toBe("startend");
      expect(ours).toBe(nj);
    });

    it("a for-loop over a non-empty array agrees in both", () => {
      const loop = "{% for i in xs %}[{{i}}]{% endfor %}";
      const { ours, nunjucks: nj } = renderBoth(loop, { xs: ["a", "b"] });
      expect(ours).toBe(nj);
      expect(ours).toContain("[a]");
      expect(ours).toContain("[b]");
    });
  });

  describe("the four prompts' fixed pattern renders the fallback when empty", () => {
    // Mirrors the shape used by generate-reply / generate-meeting-reply etc.
    const template =
      "{% if hasEmailExamples %}EXAMPLES:{% for e in emailExamples %} {{e}}{% endfor %}{% else %}NO EXAMPLES{% endif %}";

    it("empty examples -> fallback, identical in both engines", () => {
      const vars = { hasEmailExamples: false, emailExamples: [] as string[] };
      const { ours, nunjucks: nj } = renderBoth(template, vars);
      expect(ours).toBe("NO EXAMPLES");
      expect(ours).toBe(nj);
    });

    it("present examples -> examples block, identical in both engines", () => {
      const vars = { hasEmailExamples: true, emailExamples: ["x", "y"] };
      const { ours, nunjucks: nj } = renderBoth(template, vars);
      expect(ours).toBe(nj);
      expect(ours).toContain("EXAMPLES:");
    });
  });
});
