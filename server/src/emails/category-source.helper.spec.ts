import { deriveCategorizationSource } from "./category-source.helper";

describe("deriveCategorizationSource", () => {
  it("maps a user override to 'user'", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "user",
        protoCategoryId: null,
      }),
    ).toBe("user");
  });

  it("maps a deterministic rule to 'rule'", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "rule",
        protoCategoryId: null,
      }),
    ).toBe("rule");
  });

  it("maps the local model to 'local'", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "local",
        protoCategoryId: null,
      }),
    ).toBe("local");
  });

  it("maps a proto-category routing to 'proto' even when the AI picked it", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "priority",
        protoCategoryId: "proto-1",
      }),
    ).toBe("proto");
  });

  it("maps a plain AI priority pick to 'ai'", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "priority",
        protoCategoryId: null,
      }),
    ).toBe("ai");
  });

  it("treats the legacy 'summary' source as AI-decided", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "summary",
        protoCategoryId: null,
      }),
    ).toBe("ai");
  });

  it("ranks a rule above a proto routing", () => {
    expect(
      deriveCategorizationSource({
        categorySource: "rule",
        protoCategoryId: "proto-1",
      }),
    ).toBe("rule");
  });

  it("returns null when nothing has decided a category yet", () => {
    expect(
      deriveCategorizationSource({
        categorySource: null,
        protoCategoryId: null,
      }),
    ).toBeNull();
  });
});
