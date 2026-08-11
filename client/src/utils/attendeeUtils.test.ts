import { deriveThreadAttendees, isValidEmail, parseAddress } from 'utils/attendeeUtils';

describe('parseAddress', () => {
  it('parses "Name <email>" into name + lowercased email', () => {
    expect(parseAddress('Jane Doe <Jane@Example.com>')).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
  });

  it('parses a bare email, using the email as the name', () => {
    expect(parseAddress('bob@example.com')).toEqual({ name: 'bob@example.com', email: 'bob@example.com' });
  });

  it('strips surrounding quotes from the display name', () => {
    expect(parseAddress('"Doe, Jane" <jane@example.com>')?.name).toBe('Doe, Jane');
  });

  it('returns null for input without a valid email', () => {
    expect(parseAddress('not an email')).toBeNull();
    expect(parseAddress('')).toBeNull();
  });
});

describe('isValidEmail', () => {
  it('accepts valid and rejects invalid addresses', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
});

describe('deriveThreadAttendees', () => {
  it('derives attendees from from + to + cc, deduped and excluding the current user', () => {
    const attendees = deriveThreadAttendees(
      {
        from: 'Sender <sender@example.com>',
        to: 'me@example.com, Colleague <colleague@example.com>',
        cc: 'cc-person@example.com, colleague@example.com',
      },
      'me@example.com',
    );

    expect(attendees.map((attendee) => attendee.email)).toEqual([
      'sender@example.com',
      'colleague@example.com',
      'cc-person@example.com',
    ]);
    // current user excluded
    expect(attendees.some((attendee) => attendee.email === 'me@example.com')).toBe(false);
  });

  it('regression: includes every thread recipient, not just the sender', () => {
    const attendees = deriveThreadAttendees(
      { from: 'sender@example.com', to: 'a@example.com, b@example.com', cc: 'c@example.com' },
      undefined,
    );
    expect(attendees).toHaveLength(4);
  });

  it('prefers fromName as the sender display name when provided', () => {
    const [sender] = deriveThreadAttendees(
      { from: 'sender@example.com', fromName: 'Real Name', to: '' },
      undefined,
    );
    expect(sender).toEqual({ email: 'sender@example.com', name: 'Real Name' });
  });

  it('handles missing to/cc gracefully', () => {
    expect(deriveThreadAttendees({ from: 'sender@example.com' }, undefined)).toEqual([
      { email: 'sender@example.com', name: 'sender@example.com' },
    ]);
  });
});
