/**
 * The Delete → "Archive All" hotkey arms a category accordion via the
 * INBOX_ARCHIVE_ALL_CATEGORY_EVENT window event (see useCategoryArchiveAllHotkey). These tests cover
 * the accordion's side: it arms its existing confirmation (so a subsequent 'y' confirms) only when
 * the event targets this category AND it is expanded with emails to archive.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { Email } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { INBOX_ARCHIVE_ALL_CATEGORY_EVENT } from 'constants/strings';
import { NotificationProvider } from 'contexts/NotificationContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const emails = [{ id: '1' }, { id: '2' }] as Email[];

function dispatchArchiveAll(categoryKey: string): void {
  // act() so the accordion's state update (arming the confirmation) and the effect that registers
  // the y/Esc handler both flush before the next keypress.
  act(() => {
    window.dispatchEvent(new CustomEvent(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, { detail: { categoryKey } }));
  });
}

function pressKey(key: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

function renderAccordion(props: Partial<React.ComponentProps<typeof CategoryAccordion>> = {}) {
  const onArchiveAll = vi.fn().mockResolvedValue(undefined);
  render(
    <NotificationProvider>
    <CategoryAccordion
      category="Work"
      categoryKey="work"
      emails={emails}
      count={2}
      isExpanded
      onToggle={vi.fn()}
      onArchiveAll={onArchiveAll}
      {...props}
    >
      <div />
    </CategoryAccordion>
    </NotificationProvider>
  );
  return { onArchiveAll };
}

describe('CategoryAccordion — Delete-hotkey arming', () => {
  it('arms Archive All for the targeted category, so y confirms', () => {
    const { onArchiveAll } = renderAccordion();

    dispatchArchiveAll('work');
    pressKey('y');

    expect(onArchiveAll).toHaveBeenCalledWith('Work', ['1', '2']);
  });

  it('ignores events targeting a different category', () => {
    const { onArchiveAll } = renderAccordion();

    dispatchArchiveAll('other');
    pressKey('y');

    expect(onArchiveAll).not.toHaveBeenCalled();
  });

  it('does not arm when collapsed', () => {
    const { onArchiveAll } = renderAccordion({ isExpanded: false });

    dispatchArchiveAll('work');
    pressKey('y');

    expect(onArchiveAll).not.toHaveBeenCalled();
  });

  it('does not arm when the category is empty', () => {
    const { onArchiveAll } = renderAccordion({ emails: [], count: 0 });

    dispatchArchiveAll('work');
    pressKey('y');

    expect(onArchiveAll).not.toHaveBeenCalled();
  });
});
