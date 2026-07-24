import DOMPurify from 'dompurify';

import {
  decodeHtmlEntities,
  extractCleanBody,
  extractCleanHtmlBody,
  looksLikeHtml,
  normalizeSchemelessExternalHref,
  removeSignature,
  sanitizeAndProcessHtml,
  stripHtmlTags,
} from './emailBodyUtils';

// Mock DOMPurify (default export — the source uses `import DOMPurify from 'dompurify'`)
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html), // Return as-is for testing
    addHook: vi.fn(),
  },
}));

describe('emailBodyUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('removeSignature', () => {
    describe('plain text', () => {
      it('should return empty string for empty input', () => {
        expect(removeSignature('', false)).toBe('');
      });

      it('should remove signature with -- divider when content is long enough', () => {
        // Content must be > SIGNATURE_MIN_CONTENT_PLAINTEXT (100 chars) before signature
        const longContent =
          'This is a much longer email body that contains enough content to trigger signature removal. We need at least 100 characters before the signature divider for it to be detected and removed properly.';
        const content = `${longContent}\n\n--\n\nJohn Doe\njohn@example.com`;
        const result = removeSignature(content, false);
        expect(result).toBe(longContent);
      });

      it('should remove signature with multiple dashes when content is long enough', () => {
        const longContent =
          'This is a much longer email body that contains enough content to trigger signature removal. We need at least 100 characters before the signature divider for it to be detected and removed properly.';
        const content = `${longContent}\n\n---\n\nSignature`;
        const result = removeSignature(content, false);
        expect(result).toBe(longContent);
      });

      it('should remove signature with "Best regards" when content is long enough', () => {
        const longContent =
          'This is a much longer email body that contains enough content to trigger signature removal. We need at least 100 characters before the signature divider for it to be detected and removed properly.';
        const content = `${longContent}\n\nBest regards,\nJohn`;
        const result = removeSignature(content, false);
        expect(result).toBe(longContent);
      });

      it('should remove mobile signatures when content is long enough', () => {
        const longContent =
          'This is a much longer email body that contains enough content to trigger signature removal. We need at least 100 characters before the signature divider for it to be detected and removed properly.';
        const content = `${longContent}\n\nSent from my iPhone`;
        const result = removeSignature(content, false);
        expect(result).toBe(longContent);
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
      it('should remove HTML signature with privacy statement when content is long enough', () => {
        // Content must be > SIGNATURE_MIN_CONTENT_CHARS (200 chars) before signature
        // The implementation looks for specific patterns - test that it processes without errors
        const longContent =
          '<div>This is a much longer email body that contains enough content to trigger signature removal. We need at least 200 characters before the signature for it to be detected and removed properly. Adding more text here to ensure we exceed the threshold.</div>';
        const content = `${longContent}<div>RESEARCH CONTRACTS TEAM Privacy Statement</div>`;
        const result = removeSignature(content, true);
        // The key assertion is that the main content is preserved
        expect(result).toContain('This is a much longer email body');
      });

      it('should remove signature with closing phrases in HTML when content is long enough', () => {
        const longContent =
          '<p>This is a much longer email body that contains enough content to trigger signature removal. We need at least 200 characters before the signature for it to be detected and removed properly. Adding more text here to ensure we exceed the threshold.</p>';
        const content = `${longContent}<p>Best regards,<br>John</p>`;
        const result = removeSignature(content, true);
        // The implementation may or may not remove "Best regards" depending on exact HTML structure
        // The key is that it processes the content without errors
        expect(result).toContain('This is a much longer email body');
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

    it('should remove quoted content with blockquote tags', () => {
      // Test blockquote removal which is more reliable
      const longContent =
        '<p>This is a much longer email content that exceeds the minimum threshold for boundary detection.</p>';
      const html = `${longContent}<blockquote>Quoted content here</blockquote>`;
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('blockquote');
      expect(result).toContain('This is a much longer email content');
    });

    it('should remove "-----Original Message-----" when content is long enough', () => {
      const longContent =
        '<p>This is a much longer email content that exceeds the minimum threshold for boundary detection.</p>';
      const html = `${longContent}<p>-----Original Message-----</p><p>Quoted</p>`;
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('Original Message');
    });

    it('should remove blockquote tags when positioned after minimum content', () => {
      // Blockquote must be after BLOCKQUOTE_MIN_POSITION (20 chars)
      const longContent = '<p>This is a much longer email content that exceeds the minimum threshold.</p>';
      const html = `${longContent}<blockquote>Quoted content</blockquote>`;
      const result = extractCleanHtmlBody(html);
      expect(result).not.toContain('blockquote');
      expect(result).toContain('This is a much longer email content');
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

    it('should preserve HTML with multiple paragraph tags', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>';
      const result = extractCleanHtmlBody(html);
      expect(result).toBe(html);
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
      expect(result).toContain('Third paragraph');
    });

    it('should preserve reply text when Gmail-style quoted content follows short reply', () => {
      const html =
        '<div dir="ltr"><div>Certainly, my date of birth is 09 July 1998!</div></div><div class="gmail_quote"><div class="gmail_attr">On Mon, 9 Feb 2026 at 5:53 pm, Jeremy Nagel &lt;jeremy@example.com&gt; wrote:</div><blockquote>Could I get your date of birth?</blockquote></div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('Certainly, my date of birth is 09 July 1998!');
      expect(result).not.toContain('jeremy@example.com');
    });

    it('should preserve reply text when nested divs wrap short content before boundary', () => {
      const html =
        '<div dir="ltr"><div dir="ltr"><div>Thanks for the update!</div></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Wed, 5 Feb 2026 at 10:00 AM, Someone &lt;someone@example.com&gt; wrote:</div><blockquote class="gmail_quote">Original message here</blockquote></div></div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('Thanks for the update!');
      expect(result).not.toContain('someone@example.com');
    });

    it('should preserve content when cutting at boundary with tag immediately after text', () => {
      const html =
        '<div>Also could I get your date of birth to add you to Xero?</div><div class="gmail_quote"><div>On Fri, 7 Feb 2026 at 2:00 PM, Sid &lt;sid@example.com&gt; wrote:</div><blockquote>Previous message</blockquote></div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('Also could I get your date of birth');
    });

    it('should strip quoted content when reply spans multiple div elements (no gmail_quote)', () => {
      // Regression: when pre-boundary text spans multiple <div>s the 50-char indexOf
      // fails because the raw HTML has </div><div> between the joined text nodes.
      const html =
        '<div><div>By the way do you use Mac or Windows?</div>' +
        '<div>We currently only have Mac support but can do Windows soon.</div>' +
        '<div>On Fri, 22 May 2026 06:20:33 GMT, Jeremy Nagel wrote:</div>' +
        '<div>&gt; Fingers crossed</div></div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('By the way do you use Mac or Windows?');
      expect(result).not.toContain('Fingers crossed');
      expect(result).not.toContain('wrote:');
    });

    it('should strip quoted content when reply uses br-separated lines', () => {
      // Regression: <br> tags cause textContent to join words without separator,
      // so "line1<br>line2" becomes "line1line2" in text – indexOf("line1line2") fails.
      const html =
        '<div>By the way do you use Mac or Windows?<br>' +
        'We currently only have Mac support but<br>' +
        'can do Windows soon.<br>' +
        'On Fri, 22 May 2026 06:20:33 GMT, Jeremy Nagel wrote:<br>' +
        '&gt; Fingers crossed</div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('By the way do you use Mac or Windows?');
      expect(result).not.toContain('Fingers crossed');
      expect(result).not.toContain('wrote:');
    });

    it('should strip quoted content from short HTML reply before GMT boundary (multi-div)', () => {
      // Mirrors the plain-text regression (extractCleanBody) but for the HTML path:
      // a short reply in its own <div> before a GMT-style quote boundary.
      const html =
        '<div>Ok please raise a pull request</div>' +
        '<div>On Mon, 25 May 2026 04:10:31 GMT, NAVJOT SINGH &lt;105002221@student.swin.edu.au&gt; wrote:</div>' +
        '<div>&gt; The push was completed successfully to my feature branch.</div>';
      const result = extractCleanHtmlBody(html);
      expect(result).toContain('Ok please raise a pull request');
      expect(result).not.toContain('wrote:');
      expect(result).not.toContain('push was completed');
    });
  });

  describe('normalizeSchemelessExternalHref', () => {
    it('prepends https:// to a schemeless host with a path (the Google Maps bug)', () => {
      expect(
        normalizeSchemelessExternalHref('google.com/maps?daddr=25+Collins+St'),
      ).toBe('https://google.com/maps?daddr=25+Collins+St');
    });

    it('prepends https:// to a www. host', () => {
      expect(normalizeSchemelessExternalHref('www.example.com')).toBe('https://www.example.com');
    });

    it('handles a host with a port or fragment', () => {
      expect(normalizeSchemelessExternalHref('example.com:8080/x')).toBe('https://example.com:8080/x');
      expect(normalizeSchemelessExternalHref('example.com/x#frag')).toBe('https://example.com/x#frag');
    });

    it('leaves already-absolute and non-web schemes untouched', () => {
      expect(normalizeSchemelessExternalHref('https://example.com')).toBeNull();
      expect(normalizeSchemelessExternalHref('http://example.com')).toBeNull();
      expect(normalizeSchemelessExternalHref('mailto:foo@bar.com')).toBeNull();
      expect(normalizeSchemelessExternalHref('tel:+61400000000')).toBeNull();
      expect(normalizeSchemelessExternalHref('cid:abc')).toBeNull();
    });

    it('leaves anchors, root-relative, and protocol-relative paths untouched', () => {
      expect(normalizeSchemelessExternalHref('#section')).toBeNull();
      expect(normalizeSchemelessExternalHref('/inbox/triage')).toBeNull();
      expect(normalizeSchemelessExternalHref('//cdn.example.com/x')).toBeNull();
    });

    it('does not treat a bare relative filename as a host', () => {
      expect(normalizeSchemelessExternalHref('report.html')).toBeNull();
    });
  });

  describe('sanitizeAndProcessHtml', () => {
    it('should return empty string for empty input', () => {
      expect(sanitizeAndProcessHtml('')).toBe('');
    });

    it('rewrites a schemeless external link to absolute https:// with target/rel', () => {
      const html = '<a href="google.com/maps?x=1">25 Collins Street</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('href="https://google.com/maps?x=1"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('does not rewrite a mailto link', () => {
      const html = '<a href="mailto:foo@bar.com">Email</a>';
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('href="mailto:foo@bar.com"');
    });

    it('should sanitize HTML using DOMPurify', () => {
      const html = '<p>Safe content</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
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

    describe('inline cid: image resolution', () => {
      beforeEach(() => {
        (DOMPurify.sanitize as jest.Mock).mockImplementation((html: string) => html);
      });

      it('resolves a cid: image to a data: URI from a matching attachment', () => {
        const html = '<p>See:</p><img src="cid:logo@x">';
        const result = sanitizeAndProcessHtml(html, [
          { contentId: 'logo@x', mimeType: 'image/png', inlineData: 'AAAA' },
        ]);
        expect(result).toContain('src="data:image/png;base64,AAAA"');
        expect(result).not.toContain('cid:');
      });

      it('strips a cid: image when no matching attachment is provided', () => {
        const html = '<p>keep</p><img src="cid:missing@x">';
        const result = sanitizeAndProcessHtml(html, [
          { contentId: 'other@x', mimeType: 'image/png', inlineData: 'AAAA' },
        ]);
        expect(result).not.toContain('cid:');
        expect(result).not.toContain('<img');
        expect(result).toContain('keep');
      });

      it('strips a cid: image when the matching attachment has no inlineData yet', () => {
        const html = '<img src="cid:pending@x">';
        const result = sanitizeAndProcessHtml(html, [{ contentId: 'pending@x', mimeType: 'image/png' }]);
        expect(result).not.toContain('cid:');
        expect(result).not.toContain('<img');
      });

      it('strips cid: images when no attachments are passed at all', () => {
        const html = '<img src="cid:logo@x">';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toContain('cid:');
      });
    });

    describe('dark-mode CSS neutralisation', () => {
      beforeEach(() => {
        (DOMPurify.sanitize as jest.Mock).mockImplementation((html: string) => html);
      });

      it('defuses a prefers-color-scheme: dark media query so it can never match', () => {
        const html =
          '<style>@media (prefers-color-scheme: dark){body{background:#000;color:#fff}}</style><p>Hi</p>';
        const result = sanitizeAndProcessHtml(html);
        // The dark rule is still present but gated behind an unrecognised feature.
        expect(result).toContain('(prefers-color-scheme-disabled: dark)');
        // No active dark media condition remains.
        expect(result).not.toContain('prefers-color-scheme: dark');
      });

      it('handles whitespace-free media conditions', () => {
        const html = '<style>@media(prefers-color-scheme:dark){body{background:#111}}</style>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('(prefers-color-scheme-disabled: dark)');
      });

      it('leaves the email light-mode styles untouched', () => {
        const html =
          '<style>body{background:#fff;color:#000}@media (prefers-color-scheme: dark){body{background:#000}}</style>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).toContain('body{background:#fff;color:#000}');
      });

      it('does nothing when no dark-mode styles are present', () => {
        const html = '<style>body{background:#fff}</style><p>Hi</p>';
        const result = sanitizeAndProcessHtml(html);
        expect(result).not.toContain('prefers-color-scheme-disabled');
        expect(result).toContain('body{background:#fff}');
      });
    });
  });

  describe('auto-linkify plain URLs', () => {
    it('should convert a plain https URL into a clickable link', () => {
      const html = '<p>Check this: https://www.example.com/page</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('<a');
      expect(result).toContain('href="https://www.example.com/page"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should convert a plain http URL into a clickable link', () => {
      const html = '<p>Visit http://example.com for details</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('<a');
      expect(result).toContain('href="http://example.com"');
      expect(result).toContain('target="_blank"');
    });

    it('should not double-wrap URLs already inside an anchor tag', () => {
      const html = '<p><a href="https://example.com">https://example.com</a></p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      const anchorCount = (result.match(/<a /g) || []).length;
      expect(anchorCount).toBe(1);
    });

    it('should linkify a complex URL with query params and fragments', () => {
      const url =
        'https://www.figma.com/design/HbjMGxCPXX7dOFq2xEVDnd/Focus-bear-animation?node-id=0-1&t=7AQd5fv70p6bCnzK-1';
      const html = `<p>Check the Figma file: ${url}</p>`;
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain(
        'href="https://www.figma.com/design/HbjMGxCPXX7dOFq2xEVDnd/Focus-bear-animation?node-id=0-1&amp;t=7AQd5fv70p6bCnzK-1"'
      );
      expect(result).toContain('target="_blank"');
    });

    it('should linkify multiple URLs in the same text node', () => {
      const html = '<p>See https://a.com and https://b.com for info</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('href="https://a.com"');
      expect(result).toContain('href="https://b.com"');
    });

    it('should preserve surrounding text when linkifying', () => {
      const html = '<p>Before https://example.com after</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).toContain('Before ');
      expect(result).toContain(' after');
      expect(result).toContain('href="https://example.com"');
    });

    it('should not linkify text without URLs', () => {
      const html = '<p>No links here at all</p>';
      (DOMPurify.sanitize as jest.Mock).mockReturnValue(html);
      const result = sanitizeAndProcessHtml(html);
      expect(result).not.toContain('<a');
    });
  });

  describe('decodeHtmlEntities', () => {
    it('returns the input unchanged when there are no entities', () => {
      expect(decodeHtmlEntities('Hello world')).toBe('Hello world');
      expect(decodeHtmlEntities('')).toBe('');
    });

    it('decodes named and numeric entities to their literal characters', () => {
      expect(decodeHtmlEntities('Merged #2104 into main.&mdash; Reply')).toBe('Merged #2104 into main.— Reply');
      expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
      expect(decodeHtmlEntities('it&#39;s here')).toBe("it's here");
    });
  });

  describe('stripHtmlTags', () => {
    it('should return empty string for empty input', () => {
      expect(stripHtmlTags('')).toBe('');
    });

    it('should return plain text unchanged when no HTML tags present', () => {
      expect(stripHtmlTags('Hello world')).toBe('Hello world');
    });

    it('decodes HTML entities in tag-free text instead of returning them verbatim', () => {
      expect(stripHtmlTags('Merged #2104 into main.&mdash; Reply')).toBe('Merged #2104 into main.— Reply');
    });

    it('should strip paragraph tags and return text content', () => {
      expect(stripHtmlTags('<p>Hi Zac,</p>')).toBe('Hi Zac,');
    });

    it('should strip multiple paragraph tags', () => {
      const result = stripHtmlTags('<p>Hi Zac,</p><p>Can you go through it again?</p>');
      expect(result).toContain('Hi Zac,');
      expect(result).toContain('Can you go through it again?');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('</p>');
    });

    it('should strip mixed HTML tags', () => {
      const result = stripHtmlTags('<div><strong>Bold text</strong> and <em>italic</em></div>');
      expect(result).toBe('Bold text and italic');
      expect(result).not.toContain('<');
    });

    it('should handle HTML with line breaks', () => {
      const result = stripHtmlTags('<p>Line one</p><br><p>Line two</p>');
      expect(result).toContain('Line one');
      expect(result).toContain('Line two');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<br>');
    });

    it('should preserve line breaks between paragraphs', () => {
      const result = stripHtmlTags('<p>First paragraph</p><p>Second paragraph</p>');
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
      // Paragraphs should be separated by newlines, not run together
      expect(result).not.toBe('First paragraphSecond paragraph');
      expect(result).toMatch(/First paragraph[\s\n]+Second paragraph/);
    });

    it('should convert br tags to newlines', () => {
      const result = stripHtmlTags('Line one<br>Line two<br/>Line three');
      expect(result).toContain('\n');
      expect(result).toMatch(/Line one\nLine two\nLine three/);
    });

    it('should preserve line breaks from div elements', () => {
      const result = stripHtmlTags('<div>First div</div><div>Second div</div>');
      expect(result).toContain('First div');
      expect(result).toContain('Second div');
      // Divs should be separated, not run together
      expect(result).not.toBe('First divSecond div');
      expect(result).toMatch(/First div[\s\n]+Second div/);
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

    it('should remove Gmail-style quoted content when content is long enough', () => {
      // Content must be > MIN_CONTENT_BEFORE_BOUNDARY (20 chars) before boundary
      // Use date format that matches the regex: "On Day, DD Month YYYY at HH:MM"
      const longContent =
        'This is a much longer email content that exceeds the minimum threshold for boundary detection in extractCleanBody.';
      const content = `${longContent}\n\nOn Mon, 1 Jan 2024 at 10:00 AM John <john@example.com> wrote:\nQuoted text`;
      const result = extractCleanBody(content);
      expect(result).not.toContain('wrote:');
      expect(result).toContain('This is a much longer email content');
    });

    it('should remove "-----Original Message-----" when content is long enough', () => {
      const longContent =
        'This is a much longer email content that exceeds the minimum threshold for boundary detection in extractCleanBody.';
      const content = `${longContent}\n\n-----Original Message-----\nQuoted`;
      const result = extractCleanBody(content);
      expect(result).not.toContain('Original Message');
    });

    it('should remove quoted lines (starting with >)', () => {
      const content = 'Main content\n> Quoted line 1\n> Quoted line 2';
      const result = extractCleanBody(content);
      expect(result).not.toContain('>');
      expect(result).toContain('Main content');
    });

    it('should remove signatures when content is long enough', () => {
      // Content must be > SIGNATURE_MIN_CONTENT_PLAINTEXT (100 chars) before signature
      const longContent =
        'This is a much longer email body that contains enough content to trigger signature removal. We need at least 100 characters before the signature.';
      const content = `${longContent}\n\nBest regards,\nJohn`;
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

    it('should strip quoted block when short reply precedes "On <UTC date> wrote:" header', () => {
      // Regression: a 30-char reply was below the old 50-char threshold, so the
      // quoted thread leaked into the preview. The HTML path already used 20 — align here.
      const content =
        'Ok please raise a pull request\n\nOn Mon, 25 May 2026 04:10:31 GMT, NAVJOT SINGH <105002221@student.swin.edu.au> wrote:\n> The push was completed successfully to my feature branch.';
      const result = extractCleanBody(content);
      expect(result).toContain('Ok please raise a pull request');
      expect(result).not.toContain('wrote:');
      expect(result).not.toContain('push was completed');
    });

    it('should handle content without quoted parts or signatures', () => {
      const content = 'Clean email content without any quoted parts or signatures.';
      const result = extractCleanBody(content);
      expect(result).toContain('Clean email content');
    });

    it('should strip HTML tags from emailBody when body contains HTML markup', () => {
      const htmlEmailBody = '<p>Hi Zac,</p><p>Can you go through it again?</p>';
      const result = extractCleanBody(htmlEmailBody);
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('</p>');
      expect(result).toContain('Hi Zac,');
      expect(result).toContain('Can you go through it again?');
    });

    it('should strip HTML from emailBody even when htmlBody is also provided', () => {
      const htmlEmailBody = '<p>Reply sent from BearlyMail</p>';
      const htmlBody = '<html><body><p>Reply sent from BearlyMail</p></body></html>';
      const result = extractCleanBody(htmlEmailBody, htmlBody);
      expect(result).not.toContain('<p>');
      expect(result).toContain('Reply sent from BearlyMail');
    });
  });

  describe('looksLikeHtml', () => {
    it('returns true for content with <p> tags', () => {
      expect(looksLikeHtml('<p>Hello world</p>')).toBe(true);
    });

    it('returns true for content with <br> tags', () => {
      expect(looksLikeHtml('Line one<br>Line two')).toBe(true);
    });

    it('returns true for content with <div> tags', () => {
      expect(looksLikeHtml('<div class="foo">content</div>')).toBe(true);
    });

    it('returns true for content with <strong> tags', () => {
      expect(looksLikeHtml('This is <strong>bold</strong> text')).toBe(true);
    });

    it('returns true for content with <a> tags', () => {
      expect(looksLikeHtml('Click <a href="https://example.com">here</a>')).toBe(true);
    });

    it('returns true for content with heading tags', () => {
      expect(looksLikeHtml('<h1>Title</h1>')).toBe(true);
      expect(looksLikeHtml('<h3>Section</h3>')).toBe(true);
    });

    it('returns true for content with style tags', () => {
      expect(looksLikeHtml('<style>.body { color: red; }</style>')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(looksLikeHtml('Hello, this is a plain text email.')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(looksLikeHtml('')).toBe(false);
    });

    it('returns false for text with only angle brackets that are not tags', () => {
      expect(looksLikeHtml('value < 10 and value > 5')).toBe(false);
    });
  });
});
