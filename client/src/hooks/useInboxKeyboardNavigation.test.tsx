import React, { useRef } from 'react';
import { fireEvent, render } from '@testing-library/react';

import { KEY_ESCAPE } from 'constants/strings';

import { useInboxKeyboardNavigation } from './useInboxKeyboardNavigation';

/**
 * A split view with an email open; the email body stands in for the reply
 * composer, whose own Esc handling (asking before discarding a reply) calls
 * preventDefault when `handlesEscape` is set.
 */
const SplitViewHarness: React.FC<{ closeEmail: () => void; handlesEscape: boolean }> = ({
  closeEmail,
  handlesEscape,
}) => {
  const emailListRef = useRef<HTMLDivElement>(null);
  const emailDetailRef = useRef<HTMLDivElement>(null);
  useInboxKeyboardNavigation({
    emails: [],
    selectedEmailIndex: -1,
    setSelectedEmailIndex: vi.fn(),
    splitView: { isMobile: false, selectedEmailId: 'email-1', closeEmail } as never,
    onEmailSelect: vi.fn(),
    emailListRef,
    emailDetailRef,
  });
  return (
    <div
      ref={emailDetailRef}
      onKeyDown={event => {
        if (handlesEscape && event.key === KEY_ESCAPE) {
          event.preventDefault();
        }
      }}
    >
      <div data-testid="email-body" tabIndex={0} />
    </div>
  );
};

describe('useInboxKeyboardNavigation — Escape in the split view', () => {
  it('closes the open email', () => {
    const closeEmail = vi.fn();
    const { getByTestId } = render(<SplitViewHarness closeEmail={closeEmail} handlesEscape={false} />);

    fireEvent.keyDown(getByTestId('email-body'), { key: KEY_ESCAPE });

    expect(closeEmail).toHaveBeenCalledTimes(1);
  });

  it('leaves the email open when something inside it already handled Escape', () => {
    const closeEmail = vi.fn();
    const { getByTestId } = render(<SplitViewHarness closeEmail={closeEmail} handlesEscape />);

    fireEvent.keyDown(getByTestId('email-body'), { key: KEY_ESCAPE });

    expect(closeEmail).not.toHaveBeenCalled();
  });
});
