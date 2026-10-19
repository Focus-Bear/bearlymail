import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { ReplyComposer } from './ReplyComposer';

vi.mock('hooks/useIsEmailTrackingIncluded', () => ({ useIsEmailTrackingIncluded: () => true }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@example.com', trackEmailOpens: true } }),
}));
vi.mock('components/compose/SignaturePreview', () => ({ SignaturePreview: () => null }));

const noop = () => undefined;

const renderComposer = (onSend = vi.fn()) => {
  // The composer guards in-app navigation while a reply is unsent, so it needs a router.
  render(
    <MemoryRouter>
      <ReplyComposer
        showReplyComposer
        replyMode="reply"
        replyRecipients="them@example.com"
        replyCc=""
        replyBcc=""
        replySubject="Re: hi"
        showCc={false}
        showBcc={false}
        draft="Thanks!"
        replyOptions={[]}
        selectedReplyOption={-1}
        loadingReplies={false}
        checkingTone={false}
        toneCheckResult={null}
        sending={false}
        onReplyRecipientsChange={noop}
        onCcChange={noop}
        onBccChange={noop}
        onSubjectChange={noop}
        onShowCc={noop}
        onShowBcc={noop}
        onDraftChange={noop}
        onReplyOptionSelect={noop}
        onClose={noop}
        onSend={onSend}
        onUseRevisedText={noop}
      />
    </MemoryRouter>
  );
  return onSend;
};

describe('ReplyComposer – per-message open tracking', () => {
  it('starts from the account setting and sends the choice with the reply', () => {
    const onSend = renderComposer();

    fireEvent.click(screen.getByText('emailDetail.send'));

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ trackOpens: true, keepInAction: false }));
  });

  it('turning it off sends trackOpens: false', () => {
    const onSend = renderComposer();

    fireEvent.click(screen.getByTestId('track-opens-checkbox'));
    fireEvent.click(screen.getByText('emailDetail.send'));

    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ trackOpens: false }));
  });
});
