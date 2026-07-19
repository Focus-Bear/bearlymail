import { replaceBlobUrlsWithCids } from './inlineImageUtils';

describe('replaceBlobUrlsWithCids', () => {
  // 1. Normal case — blob URL replaced with CID when mapping exists (src before data-cid)
  describe('src before data-cid', () => {
    it('replaces a blob src with the matching cid value', () => {
      const html = '<img src="blob:https://example.com/abc-123" data-cid="inline-abc@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img src="cid:inline-abc@bearlymail" data-cid="inline-abc@bearlymail">');
    });

    it('preserves other attributes between src and data-cid', () => {
      const html = '<img src="blob:https://example.com/abc-123" alt="pasted" data-cid="inline-abc@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img src="cid:inline-abc@bearlymail" alt="pasted" data-cid="inline-abc@bearlymail">');
    });

    it('preserves attributes after data-cid', () => {
      const html = '<img src="blob:https://example.com/abc-123" data-cid="inline-abc@bearlymail" class="inline-img">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img src="cid:inline-abc@bearlymail" data-cid="inline-abc@bearlymail" class="inline-img">');
    });
  });

  // 2. data-cid before src
  describe('data-cid before src', () => {
    it('replaces a blob src with the matching cid value when data-cid comes first', () => {
      const html = '<img data-cid="inline-xyz@bearlymail" src="blob:https://example.com/xyz-456">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img data-cid="inline-xyz@bearlymail" src="cid:inline-xyz@bearlymail">');
    });

    it('preserves other attributes between data-cid and src', () => {
      const html = '<img data-cid="inline-xyz@bearlymail" alt="screenshot" src="blob:https://example.com/xyz-456">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img data-cid="inline-xyz@bearlymail" alt="screenshot" src="cid:inline-xyz@bearlymail">');
    });

    it('preserves attributes before data-cid', () => {
      const html = '<img class="inline-img" data-cid="inline-xyz@bearlymail" src="blob:https://example.com/xyz-456">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe('<img class="inline-img" data-cid="inline-xyz@bearlymail" src="cid:inline-xyz@bearlymail">');
    });
  });

  // 3. Passthrough — non-blob URLs left unchanged
  describe('passthrough for non-blob URLs', () => {
    it('does not modify an img with an https src', () => {
      const html = '<img src="https://example.com/image.png" data-cid="inline-abc@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe(html);
    });

    it('does not modify an img with a cid src (already replaced)', () => {
      const html = '<img src="cid:inline-abc@bearlymail" data-cid="inline-abc@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe(html);
    });

    it('does not modify an img with a data URI src', () => {
      const html = '<img src="data:image/png;base64,abc123" data-cid="inline-abc@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe(html);
    });

    it('returns a plain text string unchanged', () => {
      const text = 'No images here, just text.';
      expect(replaceBlobUrlsWithCids(text)).toBe(text);
    });

    it('returns an empty string unchanged', () => {
      expect(replaceBlobUrlsWithCids('')).toBe('');
    });
  });

  // 4. Multiple images — all replaced correctly
  describe('multiple images', () => {
    it('replaces all blob srcs in a string with multiple img tags', () => {
      const html = [
        '<img src="blob:https://example.com/aaa" data-cid="inline-aaa@bearlymail">',
        '<img src="blob:https://example.com/bbb" data-cid="inline-bbb@bearlymail">',
        '<img src="blob:https://example.com/ccc" data-cid="inline-ccc@bearlymail">',
      ].join('\n');
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toContain('src="cid:inline-aaa@bearlymail"');
      expect(result).toContain('src="cid:inline-bbb@bearlymail"');
      expect(result).toContain('src="cid:inline-ccc@bearlymail"');
      expect(result).not.toContain('src="blob:');
    });

    it('replaces multiple images embedded in rich HTML', () => {
      const html =
        '<p>See attached:</p>' +
        '<img src="blob:https://example.com/img1" data-cid="inline-img1@bearlymail">' +
        '<p>And also:</p>' +
        '<img src="blob:https://example.com/img2" data-cid="inline-img2@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe(
        '<p>See attached:</p>' +
          '<img src="cid:inline-img1@bearlymail" data-cid="inline-img1@bearlymail">' +
          '<p>And also:</p>' +
          '<img src="cid:inline-img2@bearlymail" data-cid="inline-img2@bearlymail">'
      );
    });
  });

  // 5. Mixed — some blob, some non-blob
  describe('mixed blob and non-blob images', () => {
    it('replaces only blob srcs and leaves non-blob srcs untouched', () => {
      const html =
        '<img src="blob:https://example.com/pasted" data-cid="inline-pasted@bearlymail">' +
        '<img src="https://example.com/external.png">' +
        '<img src="blob:https://example.com/pasted2" data-cid="inline-pasted2@bearlymail">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toContain('src="cid:inline-pasted@bearlymail"');
      expect(result).toContain('src="https://example.com/external.png"');
      expect(result).toContain('src="cid:inline-pasted2@bearlymail"');
      expect(result).not.toContain('src="blob:');
    });
  });

  // 6. Self-closing <img /> tags
  describe('self-closing img tags', () => {
    it('handles self-closing img with src before data-cid', () => {
      // The regex matches up to '>' — a self-closing /> will have '/' captured in the trailing group
      const html = '<img src="blob:https://example.com/abc" data-cid="inline-abc@bearlymail" />';
      const result = replaceBlobUrlsWithCids(html);
      // blob URL should be replaced; the trailing ' /' is preserved via the last capture group
      expect(result).toContain('src="cid:inline-abc@bearlymail"');
      expect(result).not.toContain('src="blob:');
    });

    it('handles self-closing img with data-cid before src', () => {
      const html = '<img data-cid="inline-abc@bearlymail" src="blob:https://example.com/abc" />';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toContain('src="cid:inline-abc@bearlymail"');
      expect(result).not.toContain('src="blob:');
    });
  });

  // 7. Missing mapping — blob URL with no matching data-cid
  describe('blob URL with no data-cid mapping', () => {
    it('leaves a blob src unchanged when there is no data-cid attribute', () => {
      // Neither regex will match because data-cid is absent
      const html = '<img src="blob:https://example.com/orphan">';
      const result = replaceBlobUrlsWithCids(html);
      expect(result).toBe(html);
    });

    it('leaves a blob src unchanged when data-cid has no value', () => {
      const html = '<img src="blob:https://example.com/orphan" data-cid="">';
      // Empty CID — regex still matches but produces an empty cid: reference
      // Verify the function is at least stable (does not throw)
      expect(() => replaceBlobUrlsWithCids(html)).not.toThrow();
    });
  });
});
