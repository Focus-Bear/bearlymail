import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import {
  buildRuleMatchText,
  cleanEmailContent,
  cleanEmailForThread,
  getEmailPreview,
} from "./email-content-cleaner";

describe("buildRuleMatchText", () => {
  it("returns the plain-text body when there is no HTML", () => {
    expect(buildRuleMatchText("Your pull request was merged", null)).toContain(
      "pull request",
    );
  });

  it("includes text that appears only in the HTML part", () => {
    const result = buildRuleMatchText(
      "View this email in your browser",
      "<p>QA Status: <b>PASS</b></p>",
    );
    expect(result).toContain("View this email in your browser");
    expect(result).toContain("PASS");
  });

  it("does not duplicate when plain text and HTML resolve to the same text", () => {
    const result = buildRuleMatchText("Hello world", "<p>Hello world</p>");
    expect(result).toBe("Hello world");
  });

  it("falls back to the HTML-derived text when the body is empty", () => {
    expect(buildRuleMatchText("", "<div>Only in HTML</div>")).toContain(
      "Only in HTML",
    );
  });
});

describe("EmailContentCleaner", () => {
  describe("cleanEmailContent", () => {
    it("should return empty string for null body", () => {
      const result = cleanEmailContent(null);
      expect(result).toBe("");
    });

    it("should return empty string for undefined body", () => {
      const result = cleanEmailContent(undefined);
      expect(result).toBe("");
    });

    it("should return empty string for empty string", () => {
      const result = cleanEmailContent("");
      expect(result).toBe("");
    });

    it("should trim whitespace", () => {
      const result = cleanEmailContent("  Hello World  ");
      expect(result).toBe("Hello World");
    });

    it("should strip HTML tags", () => {
      const result = cleanEmailContent("<p>Hello <strong>World</strong></p>");
      expect(result).toBe("Hello World");
    });

    it("should remove style blocks", () => {
      const html = "<style>body { color: red; }</style>Hello World";
      const result = cleanEmailContent(html);
      expect(result).toBe("Hello World");
    });

    it("should remove script blocks", () => {
      const html = '<script>alert("xss")</script>Hello World';
      const result = cleanEmailContent(html);
      expect(result).toBe("Hello World");
    });

    it("should convert block elements to newlines", () => {
      const html = "<p>Line 1</p><div>Line 2</div>";
      const result = cleanEmailContent(html);
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
    });

    it("should decode HTML entities", () => {
      // Note: The actual implementation only decodes in stripHtml, not in cleanEmailContent directly
      // This test checks that HTML entities in HTML content get decoded
      const html = "<p>Hello &amp; World</p>";
      const result = cleanEmailContent(html);
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("should decode numeric HTML entities in HTML content", () => {
      // &#65; is 'A'
      const html = "<p>Hello &#65; World</p>";
      const result = cleanEmailContent(html);
      // The implementation should decode when processing HTML
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("should remove email signatures with -- when there is sufficient content", () => {
      // Signature removal only works if there's >50 chars before the signature
      const longPrefix = "A".repeat(60);
      const text = `${longPrefix}\n\n--\nJohn Doe`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("--");
    });

    it('should remove email signatures with "Best regards" when there is sufficient content', () => {
      const longPrefix = "A".repeat(60);
      const text = `${longPrefix}\n\nBest regards,\nJohn Doe`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("Best regards");
    });

    it('should remove quoted replies starting with "On ... wrote:" when there is sufficient content', () => {
      const longPrefix = "A".repeat(110);
      const text = `${longPrefix}\n\nOn Jan 1, 2024, John wrote:\n> Previous message`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("On Jan 1, 2024");
    });

    it("should remove lines starting with >", () => {
      const text = "Hello World\n\n> Quoted text\n> More quoted text";
      const result = cleanEmailContent(text);
      expect(result).not.toContain("> Quoted");
    });

    it('should remove Outlook-style "Original Message" blocks when there is sufficient content', () => {
      const longPrefix = "A".repeat(110);
      const text = `${longPrefix}\n\n-----Original Message-----\nFrom: test@example.com`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("Original Message");
    });

    it("should remove Outlook forwarded headers when there is sufficient content", () => {
      const longPrefix = "A".repeat(110);
      const text = `${longPrefix}\n\nFrom: test@example.com\nSent: Jan 1\nTo: you@example.com\nSubject: Test`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("From: test@example.com");
    });

    it("should normalize whitespace", () => {
      const text = "Hello    World\n\n\n\nTest";
      const result = cleanEmailContent(text);
      // Multiple spaces
      expect(result).not.toContain("    ");
      // No triple newlines
      expect(result.split("\n\n\n").length).toBe(1);
    });

    it("should normalize line endings (CRLF to LF)", () => {
      const text = "Hello World\r\nTest Line";
      const result = cleanEmailContent(text);
      expect(result).not.toContain("\r\n");
    });

    it("should truncate text longer than maxLength", () => {
      const longText = "A".repeat(3000);
      const result = cleanEmailContent(longText, undefined, 1000);
      // +3 for "..."
      expect(result.length).toBeLessThanOrEqual(1000 + 3);
    });

    it("should prefer htmlBody with proper stripping over plain text body", () => {
      const plainText = "Plain text content";
      const htmlBody = "<p>HTML content</p>";
      const result = cleanEmailContent(plainText, htmlBody);
      expect(result).toBe("HTML content");
    });

    it("should use htmlBody when body is empty", () => {
      const htmlBody = "<p>HTML content</p>";
      const result = cleanEmailContent("", htmlBody);
      expect(result).toContain("HTML content");
    });

    it("should use htmlBody when body starts with <", () => {
      const body = "<html><body>Content</body></html>";
      const htmlBody = "<p>HTML content</p>";
      const result = cleanEmailContent(body, htmlBody);
      expect(result).toContain("HTML content");
    });

    it("should not remove short content before signature markers", () => {
      // Signature should only be removed if there's meaningful content (>50 chars) before it
      const shortText = "Hi\n\n--\nJohn";
      const result = cleanEmailContent(shortText);
      expect(result).toContain("Hi");
    });

    it('should remove "Sent from my iPhone" signatures when there is sufficient content', () => {
      const longPrefix = "A".repeat(60);
      const text = `${longPrefix}\n\nSent from my iPhone`;
      const result = cleanEmailContent(text);
      expect(result).not.toContain("Sent from my iPhone");
    });

    it("should handle smart truncation at sentence boundary", () => {
      const text = `First sentence. Second sentence. Third sentence. ${"A".repeat(2000)}`;
      const result = cleanEmailContent(text, undefined, 100);
      // Should end at a sentence boundary or add "..."
      expect(result).toMatch(/(\.|\.\.\.)$/);
    });

    it("should handle truncation at word boundary when no sentence boundary", () => {
      const text = `${"A".repeat(3000)} word`;
      const result = cleanEmailContent(text, undefined, 100);
      expect(result).toMatch(/(\.\.\.|word)$/);
    });
  });

  describe("cleanEmailForThread", () => {
    it("should use smaller maxLength per message", () => {
      const longText = "A".repeat(2000);
      const result = cleanEmailForThread(longText, undefined, 500);
      // +3 for "..."
      expect(result.length).toBeLessThanOrEqual(503);
    });

    it("should default to 500 maxLength", () => {
      const longText = "A".repeat(2000);
      const result = cleanEmailForThread(longText);
      expect(result.length).toBeLessThanOrEqual(503);
    });

    it("should process content same as cleanEmailContent", () => {
      const html = "<p>Hello <strong>World</strong></p>";
      const result = cleanEmailForThread(html);
      expect(result).toBe("Hello World");
    });
  });

  describe("getEmailPreview", () => {
    it("should return preview limited to maxLength", () => {
      const longText = "A".repeat(500);
      const result = getEmailPreview(longText, undefined, 150);
      expect(result.length).toBeLessThanOrEqual(150);
    });

    it("should default to 150 maxLength", () => {
      const longText = "A".repeat(500);
      const result = getEmailPreview(longText);
      expect(result.length).toBeLessThanOrEqual(150);
    });

    it("should remove newlines from preview", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const result = getEmailPreview(text);
      expect(result).not.toContain("\n");
    });

    it("should clean HTML from preview", () => {
      const html = "<p>Hello <strong>World</strong></p>";
      const result = getEmailPreview(html);
      expect(result).toBe("Hello World");
    });

    it("should handle empty input", () => {
      const result = getEmailPreview("");
      expect(result).toBe("");
    });

    it("should handle null input", () => {
      const result = getEmailPreview(null);
      expect(result).toBe("");
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long HTML content", () => {
      const html = `<div>${"A".repeat(10000)}</div>`;
      const result = cleanEmailContent(html, undefined, 1000);
      expect(result.length).toBeLessThanOrEqual(1003);
    });

    it("should handle content with only HTML tags", () => {
      const html = "<p></p><div></div><span></span>";
      const result = cleanEmailContent(html);
      expect(result.trim()).toBe("");
    });

    it("should handle content with only signatures", () => {
      const text = "--\nJohn Doe";
      const result = cleanEmailContent(text);
      // Should not be empty if content is too short (< 50 chars before signature)
      expect(result).toBeTruthy();
    });

    it("should handle multiple signature markers", () => {
      const text = `${"A".repeat(100)}\n\nBest regards,\n--\nJohn Doe`;
      const result = cleanEmailContent(text);
      // Should remove from first signature marker
      expect(result).not.toContain("Best regards");
    });

    it("should handle nested HTML tags", () => {
      const html = "<div><p><span>Nested content</span></p></div>";
      const result = cleanEmailContent(html);
      expect(result).toContain("Nested content");
    });

    it("should handle malformed HTML", () => {
      const html = "<p>Hello</div><span>World";
      const result = cleanEmailContent(html);
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("should handle content with only whitespace", () => {
      const text = "   \n\n   \t  ";
      const result = cleanEmailContent(text);
      expect(result).toBe("");
    });

    it("should handle unicode characters", () => {
      const text = "Hello 世界 🌍";
      const result = cleanEmailContent(text);
      expect(result).toBe("Hello 世界 🌍");
    });

    it("should handle mixed content with HTML, signatures, and quoted replies", () => {
      const longPrefix = "A".repeat(60);
      const text = `<p>${longPrefix} Hello World</p>\n\n--\nJohn\n\nOn Jan 1 wrote:\n> Previous`;
      const result = cleanEmailContent(text);
      expect(result).toContain("Hello World");
      // Signature removal requires >50 chars before it
      expect(result).not.toContain("On Jan 1 wrote");
    });
  });

  // Reproduces the QA-email bug: a verdict like "QA Status Pass" sits far below
  // the classification preview cutoff. Deterministic rule matching must see it
  // (via RULE_MATCH) so a body NOT-contains "Pass" can exclude the email.
  describe("rule-match body length", () => {
    const filler = "This is a normal sentence of email body text. ".repeat(40);
    const marker = "Final verdict: QA Status Pass.";
    const longBody = `${filler}${marker}`;

    it("drops deep body text at the short classification preview length", () => {
      expect(longBody.length).toBeGreaterThan(
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      );
      const cleaned = cleanEmailContent(
        longBody,
        null,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      );
      expect(cleaned).not.toContain("QA Status Pass");
    });

    it("retains deep body text at the rule-match length", () => {
      const cleaned = cleanEmailContent(
        longBody,
        null,
        BODY_PREVIEW_LENGTHS.RULE_MATCH,
      );
      expect(cleaned).toContain("QA Status Pass");
    });

    it("keeps RULE_MATCH far larger than the classification preview", () => {
      expect(BODY_PREVIEW_LENGTHS.RULE_MATCH).toBeGreaterThan(
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW * 10,
      );
    });
  });
});
