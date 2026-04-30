import { parseDeriveExclusionsResponse } from "./derive-exclusions-parser";

const TP_SAMPLES = [
  {
    subject: "Build failed on main",
    body: "the pipeline broke in step compile",
  },
];

describe("parseDeriveExclusionsResponse", () => {
  it("returns empty arrays when the response contains no JSON", () => {
    const result = parseDeriveExclusionsResponse(
      "I cannot find usable phrases.",
      TP_SAMPLES,
      10,
      20,
    );
    expect(result).toEqual({
      subjectNotContainsAny: [],
      bodyNotContainsAny: [],
    });
  });

  it("strips markdown fences before parsing", () => {
    const response =
      '```json\n{"subjectNotContainsAny":["digest"],"bodyNotContainsAny":[]}\n```';
    const result = parseDeriveExclusionsResponse(response, TP_SAMPLES, 10, 20);
    expect(result.subjectNotContainsAny).toEqual(["digest"]);
  });

  it("drops phrases that appear in any TP subject (safety filter)", () => {
    const response = JSON.stringify({
      // "Build" is in the TP subject; must be dropped.
      subjectNotContainsAny: ["Build", "digest"],
      bodyNotContainsAny: [],
    });
    const result = parseDeriveExclusionsResponse(response, TP_SAMPLES, 10, 20);
    expect(result.subjectNotContainsAny).toEqual(["digest"]);
  });

  it("drops phrases that appear in any TP body (safety filter)", () => {
    const response = JSON.stringify({
      subjectNotContainsAny: [],
      // "pipeline" appears in the TP body — must be dropped.
      bodyNotContainsAny: ["pipeline", "unsubscribe"],
    });
    const result = parseDeriveExclusionsResponse(response, TP_SAMPLES, 10, 20);
    expect(result.bodyNotContainsAny).toEqual(["unsubscribe"]);
  });

  it("caps each list at the configured maximum", () => {
    const subjectExclusions = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const bodyExclusions = Array.from({ length: 30 }, (_, i) => `b${i}`);
    const response = JSON.stringify({
      subjectNotContainsAny: subjectExclusions,
      bodyNotContainsAny: bodyExclusions,
    });
    const result = parseDeriveExclusionsResponse(response, [], 10, 20);
    expect(result.subjectNotContainsAny).toHaveLength(10);
    expect(result.bodyNotContainsAny).toHaveLength(20);
  });

  it("ignores non-string array entries gracefully", () => {
    const response = JSON.stringify({
      subjectNotContainsAny: ["digest", 42, null, ""],
      bodyNotContainsAny: [],
    });
    const result = parseDeriveExclusionsResponse(response, [], 10, 20);
    expect(result.subjectNotContainsAny).toEqual(["digest"]);
  });
});
