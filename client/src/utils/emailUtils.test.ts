import { removeSignature, sanitizeAndProcessHtml } from './emailUtils';
import { TYPEOF_UNDEFINED } from 'constants/strings';

// Mock DOMPurify for testing
jest.mock('dompurify', () => {
  const actualDomPurify = jest.requireActual('dompurify');
  return {
    __esModule: true,
    default: actualDomPurify,
  };
});

describe('emailUtils', () => {
  describe('removeSignature', () => {
    it('should return empty string for empty input', () => {
      expect(removeSignature('')).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(removeSignature(null as any)).toBe('');
      expect(removeSignature(undefined as any)).toBe('');
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
      // eslint-disable-next-line no-restricted-syntax -- 'undefined' is needed for TypeScript type narrowing in test environment
      if (typeof document === TYPEOF_UNDEFINED) {
        const mockElement = {
          innerHTML: '',
          querySelectorAll: jest.fn(() => []),
        };
        global.document = {
          createElement: jest.fn(() => mockElement),
        } as any;
      }
    });

    it('should return empty string for empty input', () => {
      const result = sanitizeAndProcessHtml('');
      expect(result).toBe('');
    });

    it('should return empty string for null/undefined input', () => {
      expect(sanitizeAndProcessHtml(null as any)).toBe('');
      expect(sanitizeAndProcessHtml(undefined as any)).toBe('');
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
      // eslint-disable-next-line no-script-url -- Test requires checking that javascript: URLs are sanitized
      const html = '<a href="javascript:alert(\'xss\')">Click</a>';
      const result = sanitizeAndProcessHtml(html);
      // DOMPurify should sanitize javascript: URLs
      // eslint-disable-next-line no-script-url -- Test assertion checking that javascript: URLs are sanitized
      expect(result).not.toContain('javascript:');
    });
  });
});

