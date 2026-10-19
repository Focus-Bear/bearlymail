/**
 * Closing a reply with unsent text asks "Discard this draft?" first.
 * Child components unrelated to closing are stubbed so the test exercises only
 * the composer's close paths (✕, Esc) and the confirmation dialog.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ReplyComposer } from './ReplyComposer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ user: { isAdmin: false } }) }));

const { stub } = vi.hoisted(() => ({ stub: () => null }));
vi.mock('components/compose/SignaturePreview', () => ({ SignaturePreview: stub }));
vi.mock('components/email-detail-inline/AttachmentReminderBanner', () => ({ AttachmentReminderBanner: stub }));
vi.mock('components/email-detail-inline/CalendarConflictBanner', () => ({ CalendarConflictBanner: stub }));
vi.mock('components/email-detail-inline/RecipientMismatchBanner', () => ({ RecipientMismatchBanner: stub }));
vi.mock('components/email-detail-inline/ReplyComposerAttachments', () => ({ ReplyComposerAttachments: stub }));
vi.mock('components/email-detail-inline/ReplyComposerDebugPanel', () => ({ ReplyComposerDebugPanel: stub }));
vi.mock('components/email-detail-inline/ReplyComposerFooter', () => ({ ReplyComposerFooter: stub }));
vi.mock('components/email-detail-inline/ReplyForwardedAttachments', () => ({ ForwardedAttachmentsList: stub }));
vi.mock('components/email-detail-inline/ReplyOptionsSelector', () => ({ ReplyOptionsSelector: stub }));
vi.mock('components/email-detail-inline/ReplyRecipientsInput', () => ({ ReplyRecipientsInput: stub }));
vi.mock('components/email-detail-inline/ToneCheckResult', () => ({ ToneCheckResult: stub }));
vi.mock('components/email-detail-inline/ReplyDraftTextarea', () => ({
  ReplyDraftTextarea: () => <div data-testid="reply-body" tabIndex={0} />,
}));

const DIALOG_TITLE = 'emailDetail.discardReplyTitle';

type ComposerProps = React.ComponentProps<typeof ReplyComposer>;

const buildProps = (overrides: Partial<ComposerProps>): ComposerProps => ({
  showReplyComposer: true,
  replyMode: 'replyAll',
  replyRecipients: 'leah@example.com',
  replyCc: '',
  replyBcc: '',
  replySubject: 'Re: Intro',
  showCc: false,
  showBcc: false,
  draft: '',
  replyOptions: null,
  selectedReplyOption: -1,
  loadingReplies: false,
  checkingTone: false,
  toneCheckResult: null,
  sending: false,
  onReplyRecipientsChange: vi.fn(),
  onCcChange: vi.fn(),
  onBccChange: vi.fn(),
  onSubjectChange: vi.fn(),
  onShowCc: vi.fn(),
  onShowBcc: vi.fn(),
  onDraftChange: vi.fn(),
  onReplyOptionSelect: vi.fn(),
  onSend: vi.fn(),
  onUseRevisedText: vi.fn(),
  onClose: vi.fn(),
  onSaveDraft: vi.fn().mockResolvedValue(undefined),
  onDiscardDraft: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/**
 * Opens the composer with `openedWith` as its body (empty for a new reply,
 * saved text for a restored draft), then simulates the user's edits by
 * re-rendering with `draft`.
 */
const renderComposer = (overrides: Partial<ComposerProps> = {}, openedWith = '') => {
  const props = buildProps(overrides);
  const { rerender } = render(
    <MemoryRouter>
      <ReplyComposer {...props} draft={openedWith} />
    </MemoryRouter>
  );
  rerender(
    <MemoryRouter>
      <ReplyComposer {...props} />
    </MemoryRouter>
  );
  return props;
};

const clickClose = () => fireEvent.click(screen.getByTitle('common.close'));

describe('ReplyComposer — confirm before discarding', () => {
  it('closes an empty reply without asking', () => {
    const { onClose } = renderComposer();
    clickClose();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
  });

  it('asks before closing a reply with typed text, with "Keep editing" as the default', () => {
    const { onClose } = renderComposer({ draft: '<p>Great thanks for the intro.</p>' });
    clickClose();
    expect(screen.getByText(DIALOG_TITLE)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'emailDetail.discardReplyKeepEditing' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Keep editing" leaves the reply open', () => {
    const { onClose } = renderComposer({ draft: '<p>Typed</p>' });
    clickClose();
    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.discardReplyKeepEditing' }));
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Save draft" saves the draft and closes', async () => {
    const { onClose, onSaveDraft, onDiscardDraft } = renderComposer({ draft: '<p>Typed</p>' });
    clickClose();
    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.discardReplySaveDraft' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onDiscardDraft).not.toHaveBeenCalled();
  });

  it('"Discard" deletes the draft and closes', async () => {
    const { onClose, onSaveDraft, onDiscardDraft } = renderComposer({ draft: '<p>Typed</p>' });
    clickClose();
    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.discardReplyDiscard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDiscardDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('Esc in the reply body asks the same question', () => {
    const { onClose } = renderComposer({ draft: '<p>Typed</p>' });
    fireEvent.keyDown(screen.getByTestId('reply-body'), { key: 'Escape' });
    expect(screen.getByText(DIALOG_TITLE)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc closes an empty reply without asking', () => {
    const { onClose } = renderComposer();
    fireEvent.keyDown(screen.getByTestId('reply-body'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a restored draft the user has not changed without asking', () => {
    const saved = '<p>Saved earlier</p>';
    const { onClose } = renderComposer({ draft: saved }, saved);
    clickClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides "Save draft" when the host cannot save drafts', () => {
    renderComposer({ draft: '<p>Typed</p>', onSaveDraft: undefined });
    clickClose();
    expect(screen.queryByRole('button', { name: 'emailDetail.discardReplySaveDraft' })).toBeNull();
  });
});
