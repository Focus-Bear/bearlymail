import { TYPEOF_UNDEFINED } from 'constants/strings';

import { normalizeAiReplyPlaintext, plainTextToHtml, removeSignature, sanitizeAndProcessHtml } from './emailUtils';

// Mock DOMPurify for testing
vi.mock('dompurify', async (importOriginal) => {
  const actualDomPurify = await importOriginal<typeof import('dompurify')>();
  return {
    __esModule: true,
    default: actualDomPurify.default,
  };
});

describe('emailUtils', () => {
  describe('removeSignature', () => {
    it('should return empty string for empty input', () => {
      expect(removeSignature('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(removeSignature(null as unknown as string)).toBe('');
      expect(removeSignature(undefined as unknown as string)).toBe('');
    });

    it('should remove signature starting with --', () => {
      const text = 'Hello World\n\n--\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "Best regards" signature', () => {
      const text = 'Hello World\n\nBest regards,\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "Best regards," (with comma)', () => {
      const text = 'Hello World\n\nBest regards,\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "Sent from ..." signature', () => {
      const text = 'Hello World\n\nSent from my iPhone';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "On ... wrote:" signature', () => {
      const text = 'Hello World\n\nOn Jan 1, 2024, John wrote:';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove triple dashes (---)', () => {
      const text = 'Hello World\n\n---\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "RMIT University" signature', () => {
      const text = 'Hello World\n\nRMIT University';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove "getoutline.org" signature', () => {
      const text = 'Hello World\n\ngetoutline.org';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should remove signature at earliest match position', () => {
      const text = 'Hello World\n\nBest regards,\n--\nJohn Doe';
      const result = removeSignature(text);
      // Should remove from "Best regards," position
      expect(result).toBe('Hello World');
    });

    it('should trim result after removing signature', () => {
      const text = 'Hello World  \n\n--\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });

    it('should not remove content if no signature patterns match', () => {
      const text = 'Hello World\n\nNo signature here';
      const result = removeSignature(text);
      expect(result).toBe('Hello World\n\nNo signature here');
    });

    it('should handle case-insensitive matching for "Best regards"', () => {
      const text = 'Hello World\n\nBEST REGARDS\nJohn Doe';
      const result = removeSignature(text);
      expect(result).toBe('Hello World');
    });
  });

  describe('sanitizeAndProcessHtml', () => {
    beforeEach(() => {
      // Ensure we're in a browser-like environment
      if (typeof document === TYPEOF_UNDEFINED) {
        const mockElement = {
          innerHTML: '',
          querySelectorAll: vi.fn(() => []),
        };
        global.document = {
          createElement: vi.fn(() => mockElement),
        } as unknown as Document;
      }
    });

    it('should return empty string for empty input', () => {
      const result = sanitizeAndProcessHtml('');
      expect(result).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(sanitizeAndProcessHtml(null as unknown as string)).toBe('');
      expect(sanitizeAndProcessHtml(undefined as unknown as string)).toBe('');
    });

    it('should sanitize basic HTML', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should remove iframe tags', () => {
      const html = '<p>Hello</p><iframe src="evil.com"></iframe>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('<iframe>');
    });

    it('should remove event handler attributes', () => {
      const html = '<p onclick="alert(\'xss\')">Hello</p>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('onclick');
    });

    it('should preserve allowed tags', () => {
      const html = '<p>Paragraph</p><strong>Bold</strong><em>Italic</em>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });

    it('should add target="_blank" to external links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('target="_blank"');
    });

    it('should add rel="noopener noreferrer" to external links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should not modify internal links (mailto:, tel:, etc.)', () => {
      const html = '<a href="mailto:test@example.com">Email</a>';
      const result = sanitizeAndProcessHtml(html);
      // Should not have target="_blank" for mailto links
      expect(result).not.toContain('target="_blank"');
    });

    it('should handle http:// links', () => {
      const html = '<a href="http://example.com">Link</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should preserve link href attribute', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('href="https://example.com"');
    });

    it('should handle XSS attempts in attributes', () => {
      const html = '<img src="x" onerror="alert(\'xss\')" alt="test">';
      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('onerror');
    });

    it('should preserve allowed attributes', () => {
      const html = '<img src="image.jpg" alt="Test Image" class="img-class">';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('src=');
      expect(result).toContain('alt=');
      expect(result).toContain('class=');
    });

    it('should handle nested HTML structures', () => {
      const html = '<div><p>Hello <strong>World</strong></p></div>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should handle empty HTML', () => {
      const result = sanitizeAndProcessHtml('<p></p>');
      expect(result).toBeTruthy();
    });

    it('should sanitize malicious JavaScript in href', () => {
      const html = '<a href="javascript:alert(\'xss\')">Click</a>';
      const result = sanitizeAndProcessHtml(html);
      // DOMPurify should sanitize javascript: URLs
      expect(result).not.toContain('javascript:');
    });

    describe('SVG sanitization (GAP-11)', () => {
      it('should strip <use> tags that reference external SVG resources', () => {
        const html =
          '<p>before</p><svg><use href="https://evil.example.com/payload.svg#x"/></svg><p>after</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toMatch(/<use\b/i);
        expect(result).not.toContain('evil.example.com');
        expect(result).toContain('before');
        expect(result).toContain('after');
      });

      it('should strip xlink:href on SVG-embedded elements', () => {
        const html = '<svg><a xlink:href="https://evil.example.com/x">click</a></svg>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toContain('xlink:href');
        expect(result).not.toContain('evil.example.com');
      });

      it('should strip external href on the <svg> element itself via afterSanitizeAttributes hook', () => {
        const html = '<svg href="https://evil.example.com/x" xlink:href="https://evil.example.com/y"></svg>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toContain('evil.example.com');
        expect(result).not.toContain('xlink:href');
      });
    });

    describe('auto-linkify plain URLs', () => {
      it('should convert a plain https URL into a clickable link', () => {
        const html = '<p>Check this: https://www.example.com/page</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('<a');
        expect(result).toContain('href="https://www.example.com/page"');
        expect(result).toContain('target="_blank"');
        expect(result).toContain('rel="noopener noreferrer"');
      });

      it('should convert a plain http URL into a clickable link', () => {
        const html = '<p>Visit http://example.com for details</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('<a');
        expect(result).toContain('href="http://example.com"');
        expect(result).toContain('target="_blank"');
      });

      it('should not double-wrap URLs already inside an anchor tag', () => {
        const html = '<p><a href="https://example.com">https://example.com</a></p>';
        const result = sanitizeAndProcessHtml(html);
        const anchorCount = (result.match(/<a /g) || []).length;
        expect(anchorCount).toBe(1);
      });

      it('should linkify a complex URL with query params', () => {
        const url =
          'https://www.figma.com/design/HbjMGxCPXX7dOFq2xEVDnd/Focus-bear-animation?node-id=0-1&t=7AQd5fv70p6bCnzK-1';
        const html = `<p>Check the Figma file: ${url}</p>`;
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain(
          'href="https://www.figma.com/design/HbjMGxCPXX7dOFq2xEVDnd/Focus-bear-animation?node-id=0-1&amp;t=7AQd5fv70p6bCnzK-1"'
        );
        expect(result).toContain('target="_blank"');
      });

      it('should linkify multiple URLs in the same text node', () => {
        const html = '<p>See https://a.com and https://b.com for info</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('href="https://a.com"');
        expect(result).toContain('href="https://b.com"');
      });

      it('should preserve surrounding text when linkifying', () => {
        const html = '<p>Before https://example.com after</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('Before ');
        expect(result).toContain(' after');
        expect(result).toContain('href="https://example.com"');
      });

      it('should not linkify text without URLs', () => {
        const html = '<p>No links here at all</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toContain('<a');
      });
    });
  });

  describe('normalizeAiReplyPlaintext', () => {
    it('strips trailing encryption artifact and splits greeting for run-on text', () => {
      const blob = '9518edda947ebbee1b345d5cbadb359d:84924624b945510b940a7101dc715a5a:63b4ca486f70';
      const raw = `Hi Kurt, Thanks for the update. cheers, ${blob}`;
      const normalized = normalizeAiReplyPlaintext(raw);
      expect(normalized).toContain('Hi Kurt,\n\n');
      expect(normalized).toContain('update.\n\ncheers,');
      expect(normalized).not.toContain('9518edda');
    });
  });

  describe('plainTextToHtml', () => {
    it('should return empty string for empty input', () => {
      expect(plainTextToHtml('')).toBe('');
    });

    it('should convert real newlines to <br> within a paragraph', () => {
      const result = plainTextToHtml('Hello,\nHow are you?');
      expect(result).toContain('<br>');
    });

    it('should split on double newlines to create separate paragraphs', () => {
      const result = plainTextToHtml('Paragraph one.\n\nParagraph two.');
      expect(result).toContain('<p>Paragraph one.</p>');
      expect(result).toContain('<p>Paragraph two.</p>');
    });

    it('should normalize escaped \\n sequences from LLM JSON output', () => {
      // LLM sometimes returns literal \n (two chars) instead of real newlines
      const result = plainTextToHtml('Hi there,\\n\\nThanks for reaching out.');
      expect(result).toContain('<p>Hi there,</p>');
      expect(result).toContain('<p>Thanks for reaching out.</p>');
    });

    it('should handle mixed escaped and real newlines', () => {
      const result = plainTextToHtml('Line one\\nLine two\n\nParagraph two');
      expect(result).toContain('<br>');
      expect(result).toContain('<p>Paragraph two</p>');
    });

    it('should normalize escaped \\r\\n sequences without producing double newlines', () => {
      // \\r\\n must be matched before its parts, otherwise \\n is replaced first
      // leaving \\r + real newline → two newlines → extra paragraph break
      const result = plainTextToHtml('Hello,\\r\\n\\r\\nHow are you?');
      expect(result).toContain('<p>Hello,</p>');
      expect(result).toContain('<p>How are you?</p>');
      // Should be exactly two paragraphs, not three (no empty paragraph from double newline)
      expect(result).toBe('<p>Hello,</p><p>How are you?</p>');
    });

    it('should pass through existing HTML unchanged', () => {
      const html = '<p>Already HTML</p>';
      expect(plainTextToHtml(html)).toBe(html);
    });
  });
});
