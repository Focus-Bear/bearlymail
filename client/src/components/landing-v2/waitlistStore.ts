import { useEffect, useState } from 'react';

export type WaitlistModalState = {
  open: boolean;
  prefillEmail: string;
};

const listeners = new Set<(state: WaitlistModalState) => void>();
let currentState: WaitlistModalState = { open: false, prefillEmail: '' };

function publish(): void {
  listeners.forEach(listener => listener(currentState));
}

export function openWaitlist(prefillEmail = ''): void {
  currentState = { open: true, prefillEmail };
  publish();
}

export function closeWaitlist(): void {
  currentState = { ...currentState, open: false };
  publish();
}

export function useWaitlistState(): WaitlistModalState {
  const [state, setState] = useState<WaitlistModalState>(currentState);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
