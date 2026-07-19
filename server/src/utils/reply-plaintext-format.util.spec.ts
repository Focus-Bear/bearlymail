import { normalizeGeneratedReplyPlaintext } from "./reply-plaintext-format.util";

describe("normalizeGeneratedReplyPlaintext", () => {
  it("unescapes literal \\n sequences", () => {
    expect(normalizeGeneratedReplyPlaintext("Hi,\\n\\nBody.")).toBe(
      "Hi,\n\nBody.",
    );
  });

  it("inserts paragraph break after greeting when the model returns one line", () => {
    const out = normalizeGeneratedReplyPlaintext(
      "Hi Kurt, Thanks for the update — no problem at all.",
    );
    expect(out).toContain("Hi Kurt,\n\n");
    expect(out).toContain("Thanks for the update");
  });

  it("inserts paragraph break before a closing after sentence punctuation", () => {
    const out = normalizeGeneratedReplyPlaintext(
      "Hi Kurt, Body text here. cheers, Alex",
    );
    expect(out).toContain("here.\n\ncheers, Alex");
  });

  it("strips a trailing AES-GCM ciphertext blob mistaken for a name", () => {
    const blob =
      "9518edda947ebbee1b345d5cbadb359d:84924624b945510b940a7101dc715a5a:63b4ca486f70";
    const out = normalizeGeneratedReplyPlaintext(`cheers, ${blob}`);
    expect(out).toBe("cheers,");
    expect(out).not.toContain("9518edda");
  });

  it("does not change text that already has multiple non-empty lines", () => {
    const input = "Line one.\n\nLine two.\n\nLine three.";
    expect(normalizeGeneratedReplyPlaintext(input)).toBe(input);
  });
});
