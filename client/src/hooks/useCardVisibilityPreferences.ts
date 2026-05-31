import { useCallback, useState } from 'react';

export type CardType = 'summary' | 'actionItems' | 'github' | 'crm' | 'senderContext' | 'privateNotes';

const STORAGE_KEY = 'bearlymail_hidden_cards';

function loadHiddenCards(): Set<CardType> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CardType[];
      return new Set(parsed);
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveHiddenCards(hidden: Set<CardType>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

export function useCardVisibilityPreferences() {
  const [hiddenCards, setHiddenCards] = useState<Set<CardType>>(loadHiddenCards);

  const hideCard = useCallback((card: CardType) => {
    setHiddenCards(prev => {
      const next = new Set(prev);
      next.add(card);
      saveHiddenCards(next);
      return next;
    });
  }, []);

  const showCard = useCallback((card: CardType) => {
    setHiddenCards(prev => {
      const next = new Set(prev);
      next.delete(card);
      saveHiddenCards(next);
      return next;
    });
  }, []);

  const isCardHidden = useCallback((card: CardType) => hiddenCards.has(card), [hiddenCards]);

  return { hiddenCards, hideCard, showCard, isCardHidden };
}
