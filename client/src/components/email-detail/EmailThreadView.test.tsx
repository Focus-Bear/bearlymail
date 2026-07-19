/**
 * Unit tests for EmailThreadView per-message reply/forward actions.
 *
 * Verifies that the user can reply/reply-all/forward from ANY message in the thread,
 * not just the newest one (the original limitation):
 * 1. Reply / Reply All / Forward buttons render inside each *expanded* thread message.
 * 2. Clicking a button calls onReplyToMessage with that message's id and the chosen mode.
 * 3. Collapsed messages do not expose the buttons (kept clean until expanded).
 * 4. When onReplyToMessage is omitted, no per-message buttons are rendered.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Email } from 'types/email';

import { REPLY_MODE_FORWARD, REPLY_MODE_REPLY, REPLY_MODE_REPLY_ALL } from 'constants/strings';

import { EmailThreadView } from './EmailThreadView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Heavy children (iframe/DOMParser/attachment fetching) are irrelevant to this test.
vi.mock('./ResolvedEmailBody', () => ({
  ResolvedEmailBody: () => <div data-testid="ResolvedEmailBody" />,
}));
vi.mock('./EmailAttachments', () => ({
  EmailAttachments: () => <div data-testid="EmailAttachments" />,
}));
vi.mock('./ExpandCollapseButton', () => ({
  ExpandCollapseButton: () => <div data-testid="ExpandCollapseButton" />,
}));

function makeEmail(id: string, overrides: Partial<Email> = {}): Email {
  return {
    id,
    from: `sender-${id}@example.com`,
    fromName: `Sender ${id}`,
    to: 'me@example.com',
    subject: `Subject ${id}`,
    body: `Body of message ${id}. Some content here.`,
    receivedAt: '2026-07-01T10:00:00.000Z',
    attachments: [],
    ...overrides,
  } as Email;
}

const noopBodyHelpers = {
  extractCleanBody: (body: string) => body,
  removeSignature: (html: string) => html,
  extractCleanHtmlBody: (html: string) => html,
  sanitizeAndProcessHtml: (html: string) => html,
  extractCleanHtmlBodyWithMeta: (html: string) => ({ html, wasTruncated: false }),
  extractCleanBodyWithMeta: (body: string) => ({ text: body, wasTruncated: false }),
};

describe('EmailThreadView per-message reply actions', () => {
  const olderEmail = makeEmail('older');
  const newerEmail = makeEmail('newer', { receivedAt: '2026-07-02T10:00:00.000Z' });
  const threadEmails = [olderEmail, newerEmail];

  it('renders reply/reply-all/forward buttons only on expanded messages and fires with that message id', async () => {
    const onReplyToMessage = vi.fn();
    render(
      <EmailThreadView
        email={newerEmail}
        threadEmails={threadEmails}
        expandedThreadItems={new Set([olderEmail.id])}
        onToggleThreadItem={() => {}}
        onReplyToMessage={onReplyToMessage}
        {...noopBodyHelpers}
      />
    );

    // Only the expanded (older) message shows the actions → exactly one of each label.
    expect(screen.getByText('emailDetail.reply')).toBeInTheDocument();
    expect(screen.getByText('emailDetail.replyAll')).toBeInTheDocument();
    expect(screen.getByText('emailDetail.forward')).toBeInTheDocument();

    await userEvent.click(screen.getByText('emailDetail.reply'));
    expect(onReplyToMessage).toHaveBeenCalledWith(olderEmail.id, REPLY_MODE_REPLY);

    await userEvent.click(screen.getByText('emailDetail.replyAll'));
    expect(onReplyToMessage).toHaveBeenCalledWith(olderEmail.id, REPLY_MODE_REPLY_ALL);

    await userEvent.click(screen.getByText('emailDetail.forward'));
    expect(onReplyToMessage).toHaveBeenCalledWith(olderEmail.id, REPLY_MODE_FORWARD);
  });

  it('does not render per-message actions when onReplyToMessage is not provided', () => {
    render(
      <EmailThreadView
        email={newerEmail}
        threadEmails={threadEmails}
        expandedThreadItems={new Set([olderEmail.id])}
        onToggleThreadItem={() => {}}
        {...noopBodyHelpers}
      />
    );

    expect(screen.queryByText('emailDetail.reply')).not.toBeInTheDocument();
    expect(screen.queryByText('emailDetail.forward')).not.toBeInTheDocument();
  });
});
