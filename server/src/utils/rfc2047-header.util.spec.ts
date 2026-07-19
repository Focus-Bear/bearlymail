import {
  decodeRfc2047HeaderValue,
  encodeMailboxDisplayName,
  encodeRfc2047Unstructured,
} from "./rfc2047-header.util";

describe("rfc2047-header.util", () => {
  describe("encodeRfc2047Unstructured", () => {
    it("returns ASCII subjects unchanged", () => {
      expect(encodeRfc2047Unstructured("Re: Hello world")).toBe(
        "Re: Hello world",
      );
    });

    it("B-encodes Unicode punctuation (em dash)", () => {
      const subject =
        "A quick chat about Euro — would love to hear your thoughts";
      const encoded = encodeRfc2047Unstructured(subject);
      expect(encoded.startsWith("=?UTF-8?B?")).toBe(true);
      expect(encoded).toContain("?=");
      expect(decodeRfc2047HeaderValue(encoded)).toBe(subject);
    });

    it("produces multiple encoded-words for long Unicode subjects", () => {
      const subject = "你好".repeat(30);
      const encoded = encodeRfc2047Unstructured(subject);
      expect(encoded).toContain(" ");
      expect(decodeRfc2047HeaderValue(encoded)).toBe(subject);
    });
  });

  describe("decodeRfc2047HeaderValue", () => {
    it("passes through plain text", () => {
      expect(decodeRfc2047HeaderValue("No encoding here")).toBe(
        "No encoding here",
      );
    });

    it("decodes UTF-8 B-encoded word", () => {
      const original = "Smörgåsbord — test";
      const encoded = encodeRfc2047Unstructured(original);
      expect(decodeRfc2047HeaderValue(encoded)).toBe(original);
    });

    it("decodes UTF-8 Q-encoded word", () => {
      const input = "=?UTF-8?Q?=E2=80=94?=";
      expect(decodeRfc2047HeaderValue(input)).toBe("—");
    });

    it("decodes mixed ASCII and encoded fragment", () => {
      const piece = encodeRfc2047Unstructured("—");
      const mixed = `Re: Hello ${piece} there`;
      expect(decodeRfc2047HeaderValue(mixed)).toBe("Re: Hello — there");
    });
  });

  describe("encodeMailboxDisplayName", () => {
    it("matches unstructured encoder for non-ASCII", () => {
      const name = "José García";
      expect(encodeMailboxDisplayName(name)).toBe(
        encodeRfc2047Unstructured(name),
      );
    });

    it("leaves a plain ASCII name unchanged", () => {
      expect(encodeMailboxDisplayName("Jeremy Nagel")).toBe("Jeremy Nagel");
    });

    it("quotes an ASCII name containing a comma (regression: Invalid To header)", () => {
      expect(encodeMailboxDisplayName("Nagel, Jeremy - Founder")).toBe(
        '"Nagel, Jeremy - Founder"',
      );
    });

    it("escapes embedded quotes and backslashes when quoting", () => {
      expect(encodeMailboxDisplayName('Smith, "AJ"')).toBe('"Smith, \\"AJ\\""');
    });

    it("returns empty string unchanged", () => {
      expect(encodeMailboxDisplayName("")).toBe("");
    });
  });
});
