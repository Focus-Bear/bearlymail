import {
  buildEmlContentDisposition,
  buildEmlFilename,
} from "./eml-download.helpers";

describe("buildEmlFilename", () => {
  it("uses the subject as the file name", () => {
    expect(buildEmlFilename("Quarterly report")).toBe("Quarterly report.eml");
  });

  it("replaces characters that filesystems reject", () => {
    expect(buildEmlFilename('Re: a/b\\c *?"<>| done')).toBe(
      "Re_ a_b_c ______ done.eml",
    );
  });

  it("strips control characters and collapses whitespace (no header injection)", () => {
    expect(buildEmlFilename("Hello\r\nContent-Type: text/html\t  there")).toBe(
      "Hello__Content-Type_ text_html_ there.eml",
    );
  });

  it("removes leading dots so the file is not hidden", () => {
    expect(buildEmlFilename("...secret  ")).toBe("secret.eml");
  });

  it("falls back to a neutral name for an empty or unusable subject", () => {
    expect(buildEmlFilename("")).toBe("email.eml");
    expect(buildEmlFilename(null)).toBe("email.eml");
    expect(buildEmlFilename(" ... ")).toBe("email.eml");
  });

  it("caps long subjects by code point without splitting an emoji", () => {
    const filename = buildEmlFilename("🐻".repeat(150));
    expect(filename).toBe(`${"🐻".repeat(100)}.eml`);
  });
});

describe("buildEmlContentDisposition", () => {
  it("is an attachment with both ASCII and RFC 5987 file names", () => {
    expect(buildEmlContentDisposition("Invoice 42")).toBe(
      "attachment; filename=\"Invoice 42.eml\"; filename*=UTF-8''Invoice%2042.eml",
    );
  });

  it("keeps non-ASCII subjects in filename* and degrades filename= to ASCII", () => {
    expect(buildEmlContentDisposition("Café ☕ (draft)'s")).toBe(
      "attachment; filename=\"Caf_ _ (draft)'s.eml\"; filename*=UTF-8''Caf%C3%A9%20%E2%98%95%20%28draft%29%27s.eml",
    );
  });

  it("never lets a quote close the filename parameter early", () => {
    const header = buildEmlContentDisposition('He said "hi"');
    expect(header).toContain('filename="He said _hi_.eml"');
  });
});
