import React from 'react';
import { theme } from 'theme/theme';
import { ReplyOptionsSelector } from 'components/email-detail-inline/ReplyOptionsSelector';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { ReplyComposerHeader } from 'components/email-detail-inline/ReplyComposerHeader';
import { ReplyRecipientsInput } from 'components/email-detail-inline/ReplyRecipientsInput';
import { ReplyDraftTextarea } from 'components/email-detail-inline/ReplyDraftTextarea';
import { ReplyComposerFooter } from 'components/email-detail-inline/ReplyComposerFooter';

const REPLY_OPTION_LABEL_CUSTOM = 'Custom';

interface ReplyOption {
  label: string;
  text: string;
}

interface ToneCheckResultData {
  isOk: boolean;
  suggestions: string[];
  revisedText?: string;
}

interface ReplyComposerProps {
  showReplyComposer: boolean;
  replyMode: 'reply' | 'replyAll';
  replyRecipients: string;
  draft: string | null;
  replyOptions: ReplyOption[] | null;
  selectedReplyOption: number;
  loadingReplies: boolean;
  checkingTone: boolean;
  toneCheckResult: ToneCheckResultData | null;
  sending: boolean;
  onReplyRecipientsChange: (recipients: string) => void;
  onDraftChange: (draft: string) => void;
  onReplyOptionSelect: (index: number, text: string) => void;
  onClose: () => void;
  onSend: () => void;
  onUseRevisedText: (text: string) => void;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  showReplyComposer,
  replyMode,
  replyRecipients,
  draft,
  replyOptions,
  selectedReplyOption,
  loadingReplies,
  checkingTone,
  toneCheckResult,
  sending,
  onReplyRecipientsChange,
  onDraftChange,
  onReplyOptionSelect,
  onClose,
  onSend,
  onUseRevisedText,
}) => {
  if (!showReplyComposer) {
    return null;
  }

  const handleDraftChange = (newDraft: string) => {
    onDraftChange(newDraft);
    if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
      const customIdx = replyOptions.findIndex(opt => opt.label === REPLY_OPTION_LABEL_CUSTOM);
      if (customIdx >= 0) {
        // This will be handled by parent
      }
    }
  };

  return (
    <div className="animate-fade-in" style={{
      marginBottom: theme.spacing.xl,
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.primary.light}`,
      boxShadow: theme.shadows.md,
    }}>
      <ReplyComposerHeader replyMode={replyMode} onClose={onClose} />
      <ReplyRecipientsInput
        replyRecipients={replyRecipients}
        onRecipientsChange={onReplyRecipientsChange}
      />
      <ReplyOptionsSelector
        loadingReplies={loadingReplies}
        replyOptions={replyOptions}
        selectedReplyOption={selectedReplyOption}
        onSelect={onReplyOptionSelect}
      />
      <ReplyDraftTextarea
        draft={draft}
        loadingReplies={loadingReplies}
        hasToneError={!!(toneCheckResult && !toneCheckResult.isOk)}
        onDraftChange={handleDraftChange}
      />
      <ToneCheckResult
        toneCheckResult={toneCheckResult}
        onUseRevisedText={onUseRevisedText}
      />
      <ReplyComposerFooter
        sending={sending}
        checkingTone={checkingTone}
        draft={draft}
        onClose={onClose}
        onSend={onSend}
      />
    </div>
  );
};

