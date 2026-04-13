import { act, renderHook } from '@testing-library/react';

import { CardType, useCardVisibilityPreferences } from './useCardVisibilityPreferences';

const STORAGE_KEY = 'bearlymail_hidden_cards';

describe('useCardVisibilityPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with no hidden cards when localStorage is empty', () => {
    const { result } = renderHook(() => useCardVisibilityPreferences());
    expect(result.current.hiddenCards.size).toBe(0);
  });

  it('loads hidden cards from localStorage on mount', () => {
    const stored: CardType[] = ['summary', 'github'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useCardVisibilityPreferences());
    expect(result.current.hiddenCards.has('summary')).toBe(true);
    expect(result.current.hiddenCards.has('github')).toBe(true);
    expect(result.current.hiddenCards.has('actionItems')).toBe(false);
  });

  it('starts with empty set when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    const { result } = renderHook(() => useCardVisibilityPreferences());
    expect(result.current.hiddenCards.size).toBe(0);
  });

  describe('hideCard', () => {
    it('adds a card to the hidden set', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.hideCard('summary');
      });

      expect(result.current.hiddenCards.has('summary')).toBe(true);
    });

    it('persists the hidden card to localStorage', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.hideCard('actionItems');
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CardType[];
      expect(stored).toContain('actionItems');
    });

    it('can hide multiple cards', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.hideCard('summary');
      });
      act(() => {
        result.current.hideCard('github');
      });

      expect(result.current.hiddenCards.has('summary')).toBe(true);
      expect(result.current.hiddenCards.has('github')).toBe(true);
    });

    it('does not duplicate cards already in the hidden set', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.hideCard('crm');
      });
      act(() => {
        result.current.hideCard('crm');
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CardType[];
      expect(stored.filter(card => card === 'crm').length).toBe(1);
    });
  });

  describe('showCard', () => {
    it('removes a card from the hidden set', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['summary', 'github']));
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.showCard('summary');
      });

      expect(result.current.hiddenCards.has('summary')).toBe(false);
      expect(result.current.hiddenCards.has('github')).toBe(true);
    });

    it('persists removal to localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['privateNotes']));
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.showCard('privateNotes');
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CardType[];
      expect(stored).not.toContain('privateNotes');
    });

    it('does nothing if the card is not hidden', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      act(() => {
        result.current.showCard('crm');
      });

      expect(result.current.hiddenCards.size).toBe(0);
    });
  });

  describe('isCardHidden', () => {
    it('returns true for a hidden card', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['actionItems']));
      const { result } = renderHook(() => useCardVisibilityPreferences());

      expect(result.current.isCardHidden('actionItems')).toBe(true);
    });

    it('returns false for a visible card', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      expect(result.current.isCardHidden('summary')).toBe(false);
    });

    it('updates after hiding a card', () => {
      const { result } = renderHook(() => useCardVisibilityPreferences());

      expect(result.current.isCardHidden('github')).toBe(false);
      act(() => {
        result.current.hideCard('github');
      });
      expect(result.current.isCardHidden('github')).toBe(true);
    });
  });
});
