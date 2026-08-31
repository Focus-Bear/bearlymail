import {
  appendSignature,
  EMAIL_CONTROLLER_DEFAULTS,
  looksLikeHtml,
} from "./email-controller.helpers";

describe("appendSignature", () => {
  const multilineSignature = "Regards,\nEkaterine";
  // The HTML signature is wrapped in a bordered, dimmed block so it reads as a
  // distinct signature rather than blending into the body.
  const htmlBlock = (htmlSignature: string) =>
    `<br><br><div style="color:#888888;border-top:1px solid #dddddd;padding-top:8px;margin-top:8px">${htmlSignature}</div>`;
  // Plain-text bodies get the standard "-- " signature delimiter.
  const plainBlock = (signature: string) => `\n\n-- \n${signature}`;

  it("converts signature newlines to <br> and wraps HTML signatures in a block", () => {
    const result = appendSignature("<p>Hi there</p>", multilineSignature);

    expect(result).toBe(`<p>Hi there</p>${htmlBlock("Regards,<br>Ekaterine")}`);
    expect(result).not.toContain("Regards,\nEkaterine");
  });

  it("handles CRLF newlines in an HTML signature", () => {
    const result = appendSignature("<p>Hi</p>", "Regards,\r\nEkaterine");

    expect(result).toBe(`<p>Hi</p>${htmlBlock("Regards,<br>Ekaterine")}`);
  });

  it("adds the plain-text delimiter for a plain-text body", () => {
    const result = appendSignature("Hi there", multilineSignature);

    expect(result).toBe(`Hi there${plainBlock("Regards,\nEkaterine")}`);
  });

  it("forces HTML formatting when forceHtml=true even for a non-HTML body", () => {
    const result = appendSignature("Hi there", multilineSignature, true);

    expect(result).toBe(`Hi there${htmlBlock("Regards,<br>Ekaterine")}`);
  });

  it("forces plain formatting when forceHtml=false even for an HTML body", () => {
    const result = appendSignature("<p>Hi</p>", multilineSignature, false);

    expect(result).toBe(`<p>Hi</p>${plainBlock("Regards,\nEkaterine")}`);
  });

  it("falls back to the default signature when none is provided", () => {
    expect(appendSignature("Hi there", null)).toBe(
      `Hi there${plainBlock(EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE)}`,
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
