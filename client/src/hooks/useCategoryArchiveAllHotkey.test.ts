import { renderHook } from '@testing-library/react';

import { INBOX_ARCHIVE_ALL_CATEGORY_EVENT } from 'constants/strings';

import { useCategoryArchiveAllHotkey } from './useCategoryArchiveAllHotkey';

/** Capture any INBOX_ARCHIVE_ALL_CATEGORY_EVENT dispatched on window during a key press. */
function withEventSpy(run: () => void): Array<{ categoryKey: string }> {
  const seen: Array<{ categoryKey: string }> = [];
  const listener = (event: Event) => {
    seen.push((event as CustomEvent<{ categoryKey: string }>).detail);
  };
  window.addEventListener(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, listener);
  try {
    run();
  } finally {
    window.removeEventListener(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, listener);
  }
  return seen;
}

function pressDelete(target?: EventTarget): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true, bubbles: true });
  if (target) {
    Object.defineProperty(event, 'target', { value: target, configurable: true });
  }
  return window.dispatchEvent(event);
}

describe('useCategoryArchiveAllHotkey', () => {
  it('dispatches an archive-all event for the active category on Delete', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: 'work', emailKeyboardActive: false }));

    const detail = withEventSpy(() => pressDelete());

    expect(detail).toEqual([{ categoryKey: 'work' }]);
  });

  it('does nothing when no category is active', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: null, emailKeyboardActive: false }));

    expect(withEventSpy(() => pressDelete())).toEqual([]);
  });

  it('defers to the email-level Delete when an email is keyboard-focused', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: 'work', emailKeyboardActive: true }));

    const cancelled = !pressDelete();
    expect(withEventSpy(() => pressDelete())).toEqual([]);
    // Must not preventDefault either — the email handler still needs the event.
    expect(cancelled).toBe(false);
  });

  it('is ignored when the key was already handled (defaultPrevented)', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: 'work', emailKeyboardActive: false }));

    const detail = withEventSpy(() => {
      const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true, bubbles: true });
      event.preventDefault();
      window.dispatchEvent(event);
    });

    expect(detail).toEqual([]);
  });

  it('is ignored while typing in an input', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: 'work', emailKeyboardActive: false }));

    const input = document.createElement('input');
    expect(withEventSpy(() => pressDelete(input))).toEqual([]);
  });

  it('is ignored in a contenteditable element', () => {
    renderHook(() => useCategoryArchiveAllHotkey({ activeCategoryKey: 'work', emailKeyboardActive: false }));

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true });
    expect(withEventSpy(() => pressDelete(editable))).toEqual([]);
  });
});
