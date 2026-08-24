import {
  appendSignature,
  EMAIL_CONTROLLER_DEFAULTS,
  looksLikeHtml,
} from "./email-controller.helpers";

describe("appendSignature", () => {
  const multilineSignature = "Regards,\nEkaterine";

  it("converts signature newlines to <br> for an HTML body", () => {
    const result = appendSignature("<p>Hi there</p>", multilineSignature);

    expect(result).toBe("<p>Hi there</p><br><br>Regards,<br>Ekaterine");
    expect(result).not.toContain("Regards,\nEkaterine");
  });

  it("handles CRLF newlines in an HTML signature", () => {
    const result = appendSignature("<p>Hi</p>", "Regards,\r\nEkaterine");

    expect(result).toBe("<p>Hi</p><br><br>Regards,<br>Ekaterine");
  });

  it("keeps newlines as-is for a plain-text body", () => {
    const result = appendSignature("Hi there", multilineSignature);

    expect(result).toBe("Hi there\n\nRegards,\nEkaterine");
  });

  it("falls back to the default signature when none is provided", () => {
    expect(appendSignature("Hi there", null)).toBe(
      `Hi there\n\n${EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE}`,
    );
  });
});

describe("looksLikeHtml", () => {
  it("detects an HTML body", () => {
    expect(looksLikeHtml("<p>hi</p>")).toBe(true);
  });

  it("treats plain text as non-HTML", () => {
    expect(looksLikeHtml("just plain text")).toBe(false);
  });
});
