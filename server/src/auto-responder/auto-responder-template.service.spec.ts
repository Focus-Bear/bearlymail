import { AutoResponderTemplateService } from "./auto-responder-template.service";

describe("AutoResponderTemplateService.markdownToHtml links", () => {
  const service = new AutoResponderTemplateService();

  it("converts http(s) links", () => {
    expect(service.markdownToHtml("[Site](https://example.com)")).toContain(
      '<a href="https://example.com"',
    );
  });

  it("leaves script URLs as plain text", () => {
    const html = service.markdownToHtml("[click](javascript:alert(1))");
    expect(html).not.toContain("<a ");
  });

  it("does not let a link target add attributes", () => {
    const html = service.markdownToHtml('[x](https://a.com" onclick="x)');
    expect(html).not.toContain("<a ");
  });
});
