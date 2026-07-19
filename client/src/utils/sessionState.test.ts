import {
  consumeSessionExpired,
  getLastLoginMethod,
  markSessionExpired,
  setLastLoginMethod,
} from './sessionState';

describe('sessionState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('last login method', () => {
    it('returns null when nothing stored', () => {
      expect(getLastLoginMethod()).toBeNull();
    });

    it.each(['google', 'microsoft', 'zoho', 'email'] as const)(
      'round-trips the %s method',
      method => {
        setLastLoginMethod(method);
        expect(getLastLoginMethod()).toBe(method);
      },
    );

    it('ignores an unrecognised stored value', () => {
      localStorage.setItem('bearlymail_last_login_method', 'facebook');
      expect(getLastLoginMethod()).toBeNull();
    });
  });

  describe('session-expired flag', () => {
    it('is false by default', () => {
      expect(consumeSessionExpired()).toBe(false);
    });

    it('is true once after markSessionExpired, then clears (one-shot)', () => {
      markSessionExpired();
      expect(consumeSessionExpired()).toBe(true);
      // Second read must be false so a manual refresh does not re-show the banner.
      expect(consumeSessionExpired()).toBe(false);
    });

    it('does not disturb the remembered login method', () => {
      setLastLoginMethod('google');
      markSessionExpired();
      consumeSessionExpired();
      expect(getLastLoginMethod()).toBe('google');
    });
  });
});
