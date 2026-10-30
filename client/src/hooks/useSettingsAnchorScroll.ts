import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { theme } from 'theme/theme';

import { SETTINGS_CATEGORY_QUERY_PARAM } from 'constants/settingsAnchors';

/** How often to look for the target section and check whether it has moved. */
export const ANCHOR_POLL_MS = 150;
/** Give up looking for a section that never renders (e.g. an admin-only one). */
export const ANCHOR_FIND_TIMEOUT_MS = 5000;
/**
 * Settings sections load their own data and grow after the first scroll, which
 * pushed the target off screen. Keep it aligned for this long after it appears.
 */
export const ANCHOR_TRACK_MS = 4000;
export const ANCHOR_HIGHLIGHT_MS = 2000;
/** Room left above the section so its heading and highlight aren't flush with the top edge. */
const ANCHOR_SCROLL_GAP_PX = 24;
/** Movement smaller than this is sub-pixel rounding, not a layout shift. */
const LAYOUT_SHIFT_THRESHOLD_PX = 2;
const HIGHLIGHT_FADE_MS = 600;
const HIGHLIGHT_OUTLINE_OFFSET_PX = 4;

/** Any of these means the user is scrolling or working, so stop moving the page under them. */
const USER_INTERACTION_EVENTS = ['wheel', 'touchmove', 'keydown', 'mousedown'] as const;

/**
 * Params whose own section scrolls to something more specific than the anchor
 * (the categories list scrolls to one category's row), so the page must not
 * pull it back to the section top.
 */
const PARAMS_THAT_OWN_SCROLLING = [SETTINGS_CATEGORY_QUERY_PARAM];

const SCROLLABLE_OVERFLOW_VALUES: readonly string[] = ['auto', 'scroll'];

function findScrollContainer(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (SCROLLABLE_OVERFLOW_VALUES.includes(window.getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Position of the element inside its scroll container: unaffected by scrolling, changed by layout shifts. */
function contentOffset(element: HTMLElement, container: HTMLElement): number {
  return element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

/** Outlines the element, fades it out, and returns a function that removes it straight away. */
function flashHighlight(element: HTMLElement): () => void {
  const { outline, outlineOffset, transition } = element.style;
  const restore = () => {
    element.style.outline = outline;
    element.style.outlineOffset = outlineOffset;
    element.style.transition = transition;
  };
  element.style.transition = `outline-color ${HIGHLIGHT_FADE_MS}ms ease`;
  element.style.outline = `2px solid ${theme.colors.primary.main}`;
  element.style.outlineOffset = `${HIGHLIGHT_OUTLINE_OFFSET_PX}px`;
  const fadeTimer = window.setTimeout(() => {
    element.style.outlineColor = 'transparent';
  }, ANCHOR_HIGHLIGHT_MS);
  const restoreTimer = window.setTimeout(restore, ANCHOR_HIGHLIGHT_MS + HIGHLIGHT_FADE_MS);
  return () => {
    window.clearTimeout(fadeTimer);
    window.clearTimeout(restoreTimer);
    restore();
  };
}

/**
 * Scrolls the Settings page to the section named by the URL hash once it
 * exists, keeps it aligned while the sections above it finish loading, and
 * flashes a highlight so the user can see where they landed. Re-runs on every
 * navigation (sidebar clicks included), and stops the moment the user scrolls.
 */
export function useSettingsAnchorScroll(isReady: boolean): void {
  const { hash, search, key } = useLocation();

  useEffect(() => {
    const anchorId = decodeURIComponent(hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(search);
    const isScrollOwnedElsewhere = PARAMS_THAT_OWN_SCROLLING.some(param => searchParams.has(param));
    if (!isReady || !anchorId || isScrollOwnedElsewhere) {
      return undefined;
    }

    const startedAt = Date.now();
    let foundAt: number | null = null;
    let lastAlignedOffset: number | null = null;
    let clearHighlight: (() => void) | null = null;
    let hasUserInteracted = false;

    const markUserInteraction = () => {
      hasUserInteracted = true;
    };
    USER_INTERACTION_EVENTS.forEach(eventName =>
      window.addEventListener(eventName, markUserInteraction, { capture: true, passive: true })
    );

    const alignToAnchor = () => {
      const element = document.getElementById(anchorId);
      if (!element) {
        return Date.now() - startedAt < ANCHOR_FIND_TIMEOUT_MS;
      }
      if (foundAt === null) {
        foundAt = Date.now();
        clearHighlight = flashHighlight(element);
      }
      const container = findScrollContainer(element);
      const offset = contentOffset(element, container);
      const hasMoved = lastAlignedOffset === null || Math.abs(offset - lastAlignedOffset) > LAYOUT_SHIFT_THRESHOLD_PX;
      if (hasMoved && !hasUserInteracted) {
        container.scrollTo({ top: Math.max(0, offset - ANCHOR_SCROLL_GAP_PX), behavior: 'smooth' });
        lastAlignedOffset = offset;
      }
      return !hasUserInteracted && Date.now() - foundAt < ANCHOR_TRACK_MS;
    };

    let pollTimer: number | undefined;
    const poll = () => {
      if (alignToAnchor()) {
        pollTimer = window.setTimeout(poll, ANCHOR_POLL_MS);
      }
    };
    poll();

    return () => {
      window.clearTimeout(pollTimer);
      clearHighlight?.();
      USER_INTERACTION_EVENTS.forEach(eventName =>
        window.removeEventListener(eventName, markUserInteraction, { capture: true })
      );
    };
  }, [isReady, hash, search, key]);
}
