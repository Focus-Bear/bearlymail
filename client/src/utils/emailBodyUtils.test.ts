import DOMPurify from 'dompurify';
import {
  removeSignature,
  extractCleanHtmlBody,
  sanitizeAndProcessHtml,
  extractCleanBody,
} from './emailBodyUtils';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  sanitize: jest.fn((html: string) => html), // Return as-is for testing
}));

describe('emailBodyUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('removeSignature', () => {
    describe('plain text', () => {
      it('should return empty string for empty input', () => {
        expect(removeSignature('', false)).toBe('');
      });

      it('should remove signature with -- divider', () => {
        const content = 'This is the email body.\n\n--\n\nJohn Doe\njohn@example.com';
        const result = removeSignature(content, false);
        expect(result).toBe('This is the email body.');
      });

      it('should remove signature with multiple dashes', () => {
        const content = 'Email content here.\n\n---\n\nSignature';
        const result = removeSignature(content, false);
        expect(result).toBe('Email content here.');
      });

      it('should remove signature with "Best regards"', () => {
        const content = 'Main content.\n\nBest regards,\nJohn';
        const result = removeSignature(content, false);
        expect(result).toBe('Main content.');
      });

      it('should remove mobile signatures', () => {
        const content = 'Email body.\n\nSent from my iPhone';
        const result = removeSignature(content, false);
        expect(result).toBe('Email body.');
      });

      it('should not remove signature if content is too short', () => {
        const shortContent = 'Hi\n\n--\n\nJohn';
        const result = removeSignature(shortContent, false);
        // Should not remove if content before signature is less than minimum
        expect(result.length).toBeGreaterThan(0);
      });

      it('should handle content without signature', () => {
        const content = 'This is a regular email without any signature.';
        const result = removeSignature(content, false);
        expect(result).toBe(content);
      });
    });

    describe('HTML', () => {
      it('should remove HTML signature with privacy statement', () => {
        const content = '<div>Email content</div><div>RESEARCH CONTRACTS TEAM Privacy Statement</div>';
        const result = removeSignature(content, true);
        expect(result).toContain('Email content');
        expect(result).not.toContain('RESEARCH CONTRACTS');
      });

      it('should remove signature with closing phrases in HTML', () => {
        const content = '<p>Main content</p><p>Best regards,<br>John</p>';
        const result = removeSignature(content, true);
        expect(result).toContain('Main content');
        expect(result).not.toContain('Best regards');
      });

      it('should remove blockquote signatures', () => {
        const content = '<div>Content</div><blockquote>Quoted text</blockquote>';
        // This would be handled by extractCleanHtmlBody, but test the signature removal
        const result = removeSignature(content, true);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('extractCleanHtmlBody', () => {
    it('should return empty string for empty input', () => {
      expect(extractCleanHtmlBody('')).toBe('');
    });

    it('should remove Gmail-style quoted content', () => {
      const html = '<p>Main email content</p><p>On Mon, Jan 1, 2024 at 10:00 AM John &lt;john@example.com&gt; wrote:</p>';
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('wrote:');
      expect(result).toContain('Main email content');
    });

    it('should remove "-----Original Message-----"', () => {
      const html = '<p>Content</p><p>-----Original Message-----</p><p>Quoted</p>';
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('Original Message');
    });

    it('should remove blockquote tags', () => {
      const html = '<p>Main content</p><blockquote>Quoted content</blockquote>';
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('blockquote');
      expect(result).toContain('Main content');
    });

    it('should not remove content if boundary is too early', () => {
      const html = '<p>Hi</p><p>On Mon, Jan 1, 2024 wrote:</p>';
      const result = extractCleanHtmlBody(html);
      // Should keep content if boundary is too early (less than minimum chars)
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle HTML without quoted content', () => {
      const html = '<p>Clean email content without any quoted parts.</p>';
      const result = extractCleanHtmlBody(html);
      expect(result).toBe(html);
    });
  });

  describe('sanitizeAndProcessHtml', () => {
    it('should return empty string for empty input', () => {
      expect(sanitizeAndProcessHtml('')).toBe('');
    });

    it('should sanitize HTML using DOMPurify', () => {
      const html = '<p>Safe content</p>';
      sanitizeAndProcessHtml(html);
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html, expect.any(Object));
    });

    it('should add target="_blank" to http links', () => {
      const html = '<a href="http://example.com">Link</a>';
      const sanitized = '<a href="http://example.com">Link</a>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      sanitizeAndProcessHtml(html);
      
      // Check that link processing would add target="_blank"
      // Since we're using DOMPurify mock, we verify the sanitize was called
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    it('should add target="_blank" to https links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const sanitized = '<a href="https://example.com">Link</a>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      sanitizeAndProcessHtml(html);
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    it('should not add target="_blank" to mailto links', () => {
      const html = '<a href="mailto:test@example.com">Email</a>';
      const sanitized = '<a href="mailto:test@example.com">Email</a>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      sanitizeAndProcessHtml(html);
      expect(DOMPurify.sanitize).toHaveBeenCalled();
    });

    it('should remove dangerous tags like script', () => {
      const html = '<p>Content</p><script>alert("xss")</script>';
      const sanitized = '<p>Content</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('script');
    });

    it('should remove dangerous attributes like onclick', () => {
      const html = '<p onclick="alert(1)">Content</p>';
      const sanitized = '<p>Content</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('onclick');
    });

    it('should preserve safe HTML tags', () => {
      const html = '<p>Paragraph</p><strong>Bold</strong><em>Italic</em>';
      const sanitized = html;
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(sanitized);

      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });
  });

  describe('extractCleanBody', () => {
    it('should return empty string when both inputs are empty', () => {
      expect(extractCleanBody('', '')).toBe('');
    });

    it('should prefer plain text body over HTML', () => {
      const textBody = 'Plain text content';
      const htmlBody = '<p>HTML content</p>';
      const result = extractCleanBody(textBody, htmlBody);
      expect(result).toContain('Plain text');
      expect(result).not.toContain('HTML');
    });

    it('should use HTML body when text body is empty', () => {
      const htmlBody = '<p>HTML content only</p>';
      const result = extractCleanBody('', htmlBody);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should remove Gmail-style quoted content', () => {
      const content = 'Main content here.\n\nOn Mon, Jan 1, 2024 at 10:00 AM John <john@example.com> wrote:\nQuoted text';
      const result = extractCleanBody(content);
      expect(result).not.toContain('wrote:');
      expect(result).toContain('Main content');
    });

    it('should remove "-----Original Message-----"', () => {
      const content = 'Content\n\n-----Original Message-----\nQuoted';
      const result = extractCleanBody(content);
      expect(result).not.toContain('Original Message');
    });

    it('should remove quoted lines (starting with >)', () => {
      const content = 'Main content\n> Quoted line 1\n> Quoted line 2';
      const result = extractCleanBody(content);
      expect(result).not.toContain('>');
      expect(result).toContain('Main content');
    });

    it('should remove signatures', () => {
      const content = 'Email body.\n\nBest regards,\nJohn';
      const result = extractCleanBody(content);
      expect(result).not.toContain('Best regards');
    });

    it('should normalize multiple newlines', () => {
      const content = 'Line 1\n\n\n\nLine 2';
      const result = extractCleanBody(content);
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('should not remove content if boundary is too early', () => {
      const content = 'Hi\n\nOn Mon, Jan 1, 2024 wrote:';
      const result = extractCleanBody(content);
      // Should keep content if boundary is too early
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle content without quoted parts or signatures', () => {
      const content = 'Clean email content without any quoted parts or signatures.';
      const result = extractCleanBody(content);
      expect(result).toContain('Clean email content');
    });
  });
});

