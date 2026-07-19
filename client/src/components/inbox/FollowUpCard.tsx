import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { DraftEditor } from 'components/inbox/followup/DraftEditor';
import { FollowUpCardHeader } from 'components/inbox/followup/FollowUpCardHeader';
import { RetryButton } from 'components/inbox/followup/RetryButton';
import { SimpleDraftDisplay } from 'components/inbox/followup/SimpleDraftDisplay';
import { DRAFT_STATUS_ERROR, DRAFT_STATUS_GENERATING } from 'constants/strings';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface FollowUpCardProps {
  thread: ThreadWithFollowUp;
  isSelected: boolean;
  onSelect: (threadId: string, selected: boolean) => void;
  onUpdateDraft: (followUpId: string, draft: string) => Promise<void>;
  onRetryGeneration?: (threadId: string) => void;
}

export const FollowUpCard: React.FC<FollowUpCardProps> = ({
  thread,
  isSelected,
  onSelect,
  onUpdateDraft,
  onRetryGeneration,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState(thread.followUp?.draftFollowUp || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDraft = async () => {
    if (!thread.followUp) {
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateDraft(thread.followUp.id, editedDraft);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedDraft(thread.followUp?.draftFollowUp || '');
    setIsEditing(false);
  };

  const followUp = thread.followUp;
  const hasDraft = followUp?.draftFollowUp;
  const isGenerating = followUp?.generationStatus === DRAFT_STATUS_GENERATING;
  const hasError = followUp?.generationStatus === DRAFT_STATUS_ERROR;

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.light}`,
        boxShadow: theme.shadows.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={event => onSelect(thread.threadId, event.target.checked)}
          onClick={event => event.stopPropagation()}
          disabled={!hasDraft || isGenerating}
          style={{
            marginTop: theme.spacing.xs,
            cursor: !hasDraft || isGenerating ? 'not-allowed' : 'pointer',
          }}
        />

        <div style={{ flex: 1 }}>
          <FollowUpCardHeader thread={thread} isGenerating={isGenerating} hasError={hasError} />

          {hasDraft && (
            <div>
              {!isEditing ? (
                <SimpleDraftDisplay
                  draft={followUp.draftFollowUp!}
                  isExpanded={isExpanded}
                  onToggleExpand={() => setIsExpanded(!isExpanded)}
                  onEdit={() => setIsEditing(true)}
                />
              ) : (
                <DraftEditor
                  editedDraft={editedDraft}
                  isSavingDraft={isSaving}
                  onDraftChange={setEditedDraft}
                  onSave={handleSaveDraft}
                  onCancel={handleCancelEdit}
                />
              )}
            </div>
          )}

          {hasError && onRetryGeneration && <RetryButton onRetry={() => onRetryGeneration(thread.threadId)} />}
        </div>
      </div>
    </div>
  );
};
