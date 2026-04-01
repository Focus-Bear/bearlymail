import { isValidEmail, parseRecipientString } from './recipientParser';

describe('isValidEmail', () => {
  it('returns true for a plain valid email', () => {
    expect(isValidEmail('john@example.com')).toBe(true);
  });

  it('returns true for an angle-bracket email', () => {
    expect(isValidEmail('<john@example.com>')).toBe(true);
  });

  it('returns false for a non-email string', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('parseRecipientString', () => {
  describe('single recipient', () => {
    it('parses a bare email address', () => {
      const result = parseRecipientString('john@example.com');
      expect(result).toEqual([{ email: 'john@example.com' }]);
    });

    it('parses RFC 5322 display-name + angle-addr', () => {
      const result = parseRecipientString('John Doe <john@example.com>');
      expect(result).toEqual([{ email: 'john@example.com', name: 'John Doe' }]);
    });

    it('parses Outlook ALLCAPS display name', () => {
      const result = parseRecipientString('JOHN DOE <john@example.com>');
      expect(result).toEqual([{ email: 'john@example.com', name: 'JOHN DOE' }]);
    });

    it('parses angle-addr with no display name', () => {
      const result = parseRecipientString('<john@example.com>');
      expect(result).toEqual([{ email: 'john@example.com' }]);
    });
  });

  describe('semicolon-separated list', () => {
    it('parses two recipients separated by semicolons', () => {
      const raw =
        'NAVJOT SINGH <navjot@email.com>; SHATHURSHAN AMARNATH <shathurshan@email.com>';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'navjot@email.com', name: 'NAVJOT SINGH' },
        { email: 'shathurshan@email.com', name: 'SHATHURSHAN AMARNATH' },
      ]);
    });

    it('parses three bare emails separated by semicolons', () => {
      const raw = 'a@x.com; b@y.com; c@z.com';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'a@x.com' },
        { email: 'b@y.com' },
        { email: 'c@z.com' },
      ]);
    });
  });

  describe('comma-separated list', () => {
    it('parses two bare emails separated by commas', () => {
      const result = parseRecipientString('a@x.com, b@y.com');
      expect(result).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
    });

    it('parses RFC 5322 addresses separated by commas', () => {
      const raw = 'Alice <alice@example.com>, Bob <bob@example.com>';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' },
      ]);
    });
  });

  describe('newline-separated list', () => {
    it('parses one recipient per line', () => {
      const raw = 'alice@example.com\nbob@example.com\ncharlie@example.com';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'alice@example.com' },
        { email: 'bob@example.com' },
        { email: 'charlie@example.com' },
      ]);
    });
  });

  describe('mixed separators', () => {
    it('handles a mix of commas, semicolons, and newlines', () => {
      const raw = 'a@x.com, b@y.com; c@z.com\nd@w.com';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'a@x.com' },
        { email: 'b@y.com' },
        { email: 'c@z.com' },
        { email: 'd@w.com' },
      ]);
    });

    it('handles trailing separators gracefully', () => {
      const raw = 'a@x.com; b@y.com;';
      const result = parseRecipientString(raw);
      expect(result).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
    });
  });

  describe('invalid / non-email input', () => {
    it('returns empty array for plain non-email text', () => {
      expect(parseRecipientString('hello world')).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseRecipientString('')).toEqual([]);
    });

    it('filters out invalid tokens and keeps valid ones', () => {
      const raw = 'good@example.com; not-an-email; also@example.com';
      const result = parseRecipientString(raw);
      expect(result).toEqual([
        { email: 'good@example.com' },
        { email: 'also@example.com' },
      ]);
    });

    it('returns empty array when angle bracket contains non-email', () => {
      expect(parseRecipientString('Display Name <not-an-email>')).toEqual([]);
    });
  });

  describe('acceptance criteria from issue #1622', () => {
    it('AC1: Outlook semicolon paste produces two chips with correct display names', () => {
      const raw =
        'NAVJOT SINGH <navjot@email.com>; SHATHURSHAN AMARNATH <shathurshan@email.com>';
      const result = parseRecipientString(raw);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ email: 'navjot@email.com', name: 'NAVJOT SINGH' });
      expect(result[1]).toEqual({ email: 'shathurshan@email.com', name: 'SHATHURSHAN AMARNATH' });
    });

    it('AC2: comma-separated bare emails produce two chips', () => {
      const result = parseRecipientString('a@x.com, b@y.com');
      expect(result).toHaveLength(2);
    });

    it('AC3: mixed separators produce correct set of chips', () => {
      const result = parseRecipientString('a@x.com, b@y.com; c@z.com');
      expect(result).toHaveLength(3);
    });

    it('AC4: bare email paste creates one chip', () => {
      const result = parseRecipientString('foo@bar.com');
      expect(result).toEqual([{ email: 'foo@bar.com' }]);
    });

    it('AC7: normal text (no emails) returns empty array (fall back to default paste)', () => {
      expect(parseRecipientString('this is just some text')).toEqual([]);
    });
  });
});
