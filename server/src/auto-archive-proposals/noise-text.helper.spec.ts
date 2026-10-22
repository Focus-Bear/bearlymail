import {
  extractPhrases,
  featureTokens,
  isVolatileToken,
  templateSignature,
} from "./noise-text.helper";

describe("noise-text.helper", () => {
  describe("isVolatileToken", () => {
    it.each([
      ["2850", "numbers"],
      ["#2850)", "PR / issue numbers"],
      ["(a1b2c3d)", "short commit hashes"],
      ["deadbeefcafebabe", "long hex ids without digits"],
      ["https://github.com/Focus-Bear/Mac-App/actions/runs/123", "URLs"],
      ["www.example.com", "bare www URLs"],
      ["jeremy@focusbear.io", "email addresses"],
      ["fix/onboarding-copy", "branch names"],
      ["/server", "paths"],
      ["2026-10-20", "dates"],
      ["Oct", "month names"],
      ["Monday", "weekday names"],
      ["v2.3.1", "versions"],
    ])("masks %s (%s)", (token) => {
      expect(isVolatileToken(token)).toBe(true);
    });

    it.each([
      "Check",
      "Translations",
      "failed:",
      "[Focus-Bear/Mac-App]",
      "focus-bear-mac",
      "-",
    ])("keeps the stable token %s", (token) => {
      expect(isVolatileToken(token)).toBe(false);
    });
  });

  describe("extractPhrases", () => {
    const subject =
      "[Focus-Bear/Mac-App] Run failed: Check Translations - fix/onboarding-copy (cc20259)";

    it("returns only literal, case-insensitive substrings of the text", () => {
      for (const phrase of extractPhrases(subject)) {
        expect(subject.toLowerCase()).toContain(phrase);
      }
    });

    it("finds the template's stable phrases and never the volatile parts", () => {
      const phrases = extractPhrases(subject);
      expect(phrases).toContain("run failed: check translations");
      expect(phrases).toContain("check translations");
      expect(phrases).toContain("[focus-bear/mac-app]");
      expect([...phrases].some((phrase) => phrase.includes("cc20259"))).toBe(
        false,
      );
      expect([...phrases].some((phrase) => phrase.includes("onboarding"))).toBe(
        false,
      );
    });

    it("gives two instances of one template the same phrases", () => {
      const other =
        "[Focus-Bear/Mac-App] Run failed: Check Translations - main-hotfix/x (ff10572)";
      expect(extractPhrases(other)).toEqual(extractPhrases(subject));
    });

    it("never cuts through a bracket pair", () => {
      for (const phrase of extractPhrases(subject)) {
        expect(phrase.split("[").length).toBe(phrase.split("]").length);
      }
      expect(extractPhrases(subject)).not.toContain("focus-bear/mac-app] run");
    });

    it("respects the word limit and skips stopword-only phrases", () => {
      const phrases = extractPhrases("This is for the team", 2);
      expect(phrases).toContain("the team");
      expect(phrases).not.toContain("is for");
      expect(phrases).not.toContain("this is for");
    });

    it("never yields glob or regex syntax the pattern matcher would reinterpret", () => {
      const phrases = extractPhrases("Release *beta* build /nightly/ ready");
      expect([...phrases].some((phrase) => phrase.includes("*"))).toBe(false);
      expect([...phrases].some((phrase) => phrase.startsWith("/"))).toBe(false);
    });

    it("does not join phrases across lines", () => {
      const phrases = extractPhrases("New issue in project\nEvents seen today");
      expect(phrases).toContain("new issue in project");
      expect(phrases).not.toContain("project events");
    });
  });

  describe("featureTokens", () => {
    it("drops volatile tokens, punctuation and stopwords", () => {
      expect(
        featureTokens("Re: [Focus-Bear/Mac-App] Fix the crash (PR #2850)"),
      ).toEqual(["focus-bear", "mac-app", "fix", "crash", "pr"]);
    });
  });

  describe("templateSignature", () => {
    it("collapses notifications that differ only in ids, branches and URLs", () => {
      const first = templateSignature(
        "[Focus-Bear/Mac-App] Run failed: CI - fix/a (a1b2c3d)",
        "CI: Some jobs were not successful\nView run: https://github.com/x/actions/runs/111",
      );
      const second = templateSignature(
        "[Focus-Bear/Mac-App] Run failed: CI - feat/b (e4f5a6b)",
        "CI: Some jobs were not successful\nView run: https://github.com/x/actions/runs/222",
      );
      expect(first).toBe(second);
    });

    it("keeps different templates apart", () => {
      expect(templateSignature("Run failed: Lint", "")).not.toBe(
        templateSignature("Run failed: Build", ""),
      );
    });
  });
});
