import React, { useEffect, useState } from 'react';
import { theme } from 'theme/theme';

import { DraftDisplay } from 'components/inbox/followup/DraftDisplay';
import { DraftEditor } from 'components/inbox/followup/DraftEditor';
import { DraftGenerationStatus } from 'components/inbox/followup/DraftGenerationStatus';
import { DRAFT_STATUS_ERROR, DRAFT_STATUS_GENERATING } from 'constants/strings';

interface FollowUpDraftProps {
  followUpData: {
    id: string;
    draftFollowUp: string | null;
    generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
    generationError: string | null;
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
    sendError: string | null;
  };
  onUpdateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onSendFollowUp?: (followUpId: string, draft: string) => Promise<void>;
}

export const FollowUpDraft: React.FC<FollowUpDraftProps> = ({ followUpData, onUpdateDraft, onSendFollowUp }) => {
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editedDraft, setEditedDraft] = useState(followUpData?.draftFollowUp || '');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSendingDraft, setIsSendingDraft] = useState(false);

  useEffect(() => {
    if (followUpData?.draftFollowUp) {
      setEditedDraft(followUpData.draftFollowUp);
    }
  }, [followUpData?.draftFollowUp]);

  const handleSaveDraft = async () => {
    if (!followUpData?.id || !onUpdateDraft) {
      return;
    }
    setIsSavingDraft(true);
    try {
      await onUpdateDraft(followUpData.id, editedDraft);
      setIsEditingDraft(false);
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedDraft(followUpData?.draftFollowUp || '');
    setIsEditingDraft(false);
  };

  const handleSend = async () => {
    if (onSendFollowUp && followUpData.id) {
      await onSendFollowUp(followUpData.id, followUpData.draftFollowUp || '');
    }
  };

  const handleSaveAndSend = async () => {
    if (!followUpData?.id || !onSendFollowUp) {
      return;
    }
    setIsSendingDraft(true);
    try {
      if (onUpdateDraft) {
        await onUpdateDraft(followUpData.id, editedDraft);
      }
      await onSendFollowUp(followUpData.id, editedDraft);
      setIsEditingDraft(false);
    } catch (error) {
      console.error('Error saving and sending draft:', error);
    } finally {
      setIsSendingDraft(false);
    }
  };

  // Only render the card when there is something to show — an active
  // generation status (generating/error) or an actual draft. Otherwise
  // (no draft, and status is null/pending/completed) the box would render
  // empty, leaving a blank grey rectangle in the follow-up card (issue: empty
  // box in follow-up mode).
  const hasVisibleStatus =
    followUpData?.generationStatus === DRAFT_STATUS_GENERATING ||
    followUpData?.generationStatus === DRAFT_STATUS_ERROR;
  if (!followUpData || (!hasVisibleStatus && !followUpData.draftFollowUp)) {
    return null;
  }

  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.sm,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <DraftGenerationStatus
        generationStatus={followUpData.generationStatus}
        generationError={followUpData.generationError}
      />
      {followUpData.draftFollowUp && (
        <div>
          {!isEditingDraft ? (
            <DraftDisplay
              draftFollowUp={followUpData.draftFollowUp}
              onEdit={() => setIsEditingDraft(true)}
              onSend={handleSend}
              sendStatus={followUpData.sendStatus}
              sendError={followUpData.sendError}
            />
          ) : (
            <DraftEditor
              editedDraft={editedDraft}
              isSavingDraft={isSavingDraft}
              isSendingDraft={isSendingDraft}
              onDraftChange={setEditedDraft}
              onSave={handleSaveDraft}
              onSaveAndSend={onSendFollowUp ? handleSaveAndSend : undefined}
              onCancel={handleCancelEdit}
            />
          )}
        </div>
      )}
    </div>
  );
};
