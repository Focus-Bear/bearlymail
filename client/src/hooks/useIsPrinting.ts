import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Tracks whether the browser is currently printing, via the `beforeprint` /
 * `afterprint` window events (fired for both `window.print()` and Ctrl/Cmd+P).
 *
 * The `beforeprint` update is flushed synchronously so print-only content is in
 * the DOM before the browser lays out the printed page.
 */
export function useIsPrinting(): boolean {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const handleBeforePrint = () => flushSync(() => setIsPrinting(true));
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  return isPrinting;
}
