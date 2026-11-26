import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { ANCHOR_FIND_TIMEOUT_MS, ANCHOR_POLL_MS } from 'hooks/useSettingsAnchorScroll';

/**
 * Calls `open` when the URL hash names `containerRef` itself or a section inside
 * it (a deep link such as `/settings#category-rules`, or a Guide Our AI sub-nav
 * link), so a collapsed accordion or "Advanced" group opens before the page
 * scrolls to it. Sections load their own data and appear late, so it keeps
 * looking for a few seconds, like useSettingsTabs does. Keyed on the location
 * key, so following the same link again re-opens a section the user collapsed.
 *
 * `open` must be stable (e.g. wrapped in useCallback), or the lookup restarts on
 * every render.
 */
export function useOpenForLinkedSection(containerRef: React.RefObject<HTMLElement | null>, open: () => void): void {
  const { hash, key } = useLocation();

  useEffect(() => {
    const anchorId = decodeURIComponent(hash.replace(/^#/, ''));
    if (!anchorId) {
      return undefined;
    }
    const startedAt = Date.now();
    let timer: number | undefined;
    const openIfInside = () => {
      const target = document.getElementById(anchorId);
      if (target) {
        if (containerRef.current?.contains(target)) {
          open();
        }
        return;
      }
      if (Date.now() - startedAt < ANCHOR_FIND_TIMEOUT_MS) {
        timer = window.setTimeout(openIfInside, ANCHOR_POLL_MS);
      }
    };
    openIfInside();
    return () => window.clearTimeout(timer);
  }, [hash, key, containerRef, open]);
}

/**
 * For an accordion: returns a ref for its root element and expands it (via its
 * own `setIsExpanded`) whenever a `/settings#<id>` link targets that root.
 */
export function useExpandWhenLinked<T extends HTMLElement = HTMLDivElement>(
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
): React.RefObject<T | null> {
  const sectionRef = useRef<T | null>(null);
  const expand = useCallback(() => setIsExpanded(true), [setIsExpanded]);
  useOpenForLinkedSection(sectionRef, expand);
  return sectionRef;
}
