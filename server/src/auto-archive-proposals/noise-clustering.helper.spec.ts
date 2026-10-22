import { clusterEmails, cosineSimilarity } from "./noise-clustering.helper";

const ciFailure = (workflow: string, branch: string, sha: string) => ({
  subject: `[Acme/app] Run failed: ${workflow} - ${branch} (${sha})`,
  body: `${workflow}: Some jobs were not successful\nView workflow run: https://example.com/runs/${sha}`,
});

const reviewRequest = (title: string, pr: number) => ({
  subject: `[Acme/app] ${title} (PR #${pr})`,
  body: `@someone requested your review on: Acme/app#${pr} ${title}.\nYou are receiving this because your review was requested.`,
});

describe("noise-clustering.helper", () => {
  describe("cosineSimilarity", () => {
    it("is 1 for identical vectors, 0 for disjoint or empty ones", () => {
      const vector = new Map([
        ["a", 1],
        ["b", 2],
      ]);
      expect(cosineSimilarity(vector, new Map(vector))).toBeCloseTo(1);
      expect(cosineSimilarity(vector, new Map([["c", 1]]))).toBe(0);
      expect(cosineSimilarity(vector, new Map())).toBe(0);
    });
  });

  it("returns no clusters for no emails", () => {
    expect(clusterEmails([])).toEqual([]);
  });

  it("puts every instance of a templated notification in one cluster", () => {
    const emails = [
      ciFailure("Lint", "main", "a1b2c3d"),
      ciFailure("Lint", "fix/x", "b2c3d4e"),
      ciFailure("Lint", "feat/y", "c3d4e5f"),
    ];
    expect(clusterEmails(emails)).toEqual([[0, 1, 2]]);
  });

  it("separates CI failures from review requests", () => {
    const emails = [
      ciFailure("Lint", "main", "a1b2c3d"),
      reviewRequest("Add login page", 12),
      ciFailure("Lint", "fix/x", "b2c3d4e"),
      reviewRequest("Fix crash on start", 13),
      reviewRequest("Refactor settings", 14),
    ];
    expect(clusterEmails(emails)).toEqual([
      [1, 3, 4],
      [0, 2],
    ]);
  });

  it("splits similar templates apart at a tighter threshold", () => {
    const emails = [
      ciFailure("Check Translations", "main", "a1b2c3d"),
      ciFailure("Check Translations", "fix/x", "b2c3d4e"),
      ciFailure("Build and Test", "main", "c3d4e5f"),
      ciFailure("Build and Test", "fix/y", "d4e5f6a"),
    ];
    expect(clusterEmails(emails, 0.2)).toHaveLength(1);
    expect(clusterEmails(emails, 0.6)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("is deterministic for the same input", () => {
    const emails = [
      reviewRequest("Add login page", 12),
      ciFailure("Lint", "main", "a1b2c3d"),
      reviewRequest("Fix crash", 13),
    ];
    expect(clusterEmails(emails)).toEqual(clusterEmails(emails));
  });
});
