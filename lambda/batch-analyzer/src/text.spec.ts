import { stripLoneSurrogates, truncateAtCodePoint } from "./text";

// From the DLQ message that triggered the ContextAnalysis DLQ alarm on 2026-09-03:
// a Meetup newsletter written in mathematical bold letters (2 code units each) was
// cut by substring(0, 500) exactly between the halves of one character.
const MATH_BOLD_T = "\u{1D413}";

describe("truncateAtCodePoint", () => {
  it("returns short input unchanged", () => {
    expect(truncateAtCodePoint("hello", 10)).toBe("hello");
  });

  it("cuts at the limit when the boundary is between BMP characters", () => {
    expect(truncateAtCodePoint("abcdef", 3)).toBe("abc");
  });

  it("never leaves a dangling high surrogate at the cut", () => {
    const text = "ab" + MATH_BOLD_T + "cd"; // units: a b HI LO c d
    const cut = truncateAtCodePoint(text, 3); // would split the pair
    expect(cut).toBe("ab");
    expect(JSON.parse(JSON.stringify(cut))).toBe(cut);
    expect(/[\uD800-\uDFFF]/.test(cut)).toBe(false);
  });

  it("keeps a complete astral character that fits exactly", () => {
    expect(truncateAtCodePoint("ab" + MATH_BOLD_T + "cd", 4)).toBe(
      "ab" + MATH_BOLD_T,
    );
  });
});

describe("stripLoneSurrogates", () => {
  it("leaves well-formed text, including emoji, untouched", () => {
    const text = "Thursday Thoughts 💡 " + MATH_BOLD_T;
    expect(stripLoneSurrogates(text)).toBe(text);
  });

  it("removes unpaired high and low surrogates", () => {
    expect(stripLoneSurrogates("a\uD835b\uDC11c")).toBe("abc");
  });

  it("produces a body the provider can parse as JSON", () => {
    const body = JSON.stringify({ text: stripLoneSurrogates("x\uD835") });
    expect(body).not.toMatch(/\\ud8/i);
  });
});
