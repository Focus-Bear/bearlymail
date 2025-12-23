import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { ThreadWithFollowUp, FollowUpData } from '../../hooks/useFollowUps';

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
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState(thread.followUp?.draftFollowUp || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDraft = async () => {
    if (!thread.followUp) return;
    
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
  const isGenerating = followUp?.generationStatus === 'generating';
  const hasError = followUp?.generationStatus === 'error';

  // Calculate days since last response
  const calculateDaysSinceLastResponse = () => {
    const lastTheirReplyAt = (thread as any).lastTheirReplyAt;
    if (!lastTheirReplyAt) {
      return null; // They never replied
    }
    const days = Math.floor(
      (new Date().getTime() - new Date(lastTheirReplyAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const daysSinceLastResponse = calculateDaysSinceLastResponse();
  const otherPersonName = (thread as any).otherPersonName || thread.fromName || thread.from;
  const lastMyReplyAt = (thread as any).lastMyReplyAt;

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.light}`,
      boxShadow: theme.shadows.sm,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(thread.threadId, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          disabled={!hasDraft || isGenerating}
          style={{
            marginTop: theme.spacing.xs,
            cursor: (!hasDraft || isGenerating) ? 'not-allowed' : 'pointer',
          }}
        />
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
            <div style={{ flex: 1 }}>
              <h4 style={{
                margin: 0,
                marginBottom: theme.spacing.xs,
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
              }}>
                {thread.subject}
              </h4>
              <div style={{ marginBottom: theme.spacing.xs }}>
                <p style={{
                  margin: 0,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.xs,
                }}>
                  <strong>With:</strong> {otherPersonName}
                </p>
                {daysSinceLastResponse !== null ? (
                  <p style={{
                    margin: 0,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    marginBottom: theme.spacing.xs,
                  }}>
                    <strong>Days since their last response:</strong> {daysSinceLastResponse} day{daysSinceLastResponse !== 1 ? 's' : ''}
                  </p>
                ) : (
                  <p style={{
                    margin: 0,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    marginBottom: theme.spacing.xs,
                  }}>
                    <strong>Status:</strong> No reply received
                  </p>
                )}
                {lastMyReplyAt && (
                  <p style={{
                    margin: 0,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                  }}>
                    <strong>You sent last:</strong> {new Date(lastMyReplyAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            
            {isGenerating && (
              <span style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: theme.colors.sunray.light4,
                color: theme.colors.accent.info,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.xs,
              }}>
                {t('inbox.generating')}
              </span>
            )}
            
            {hasError && (
              <span style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: theme.colors.error.light,
                color: theme.colors.error.main,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.xs,
              }}>
                {t('inbox.error')}
              </span>
            )}
          </div>

          {hasDraft && (
            <div>
              {!isEditing ? (
                <div>
                  <div style={{
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.background.default,
                    borderRadius: theme.borderRadius.md,
                    marginBottom: theme.spacing.sm,
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    whiteSpace: 'pre-wrap',
                    maxHeight: isExpanded ? 'none' : '100px',
                    overflow: isExpanded ? 'visible' : 'hidden',
                  }}>
                    {followUp.draftFollowUp}
                  </div>
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
                        color: theme.colors.primary.main,
                        border: `1px solid ${theme.colors.primary.main}`,
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                      }}
                    >
                      {isExpanded ? t('common.collapse') : t('common.expand')}
                    </button>
                    
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
                        color: theme.colors.primary.main,
                        border: `1px solid ${theme.colors.primary.main}`,
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                      }}
                    >
                      {t('common.edit')}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    value={editedDraft}
                    onChange={(e) => setEditedDraft(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '150px',
                      padding: theme.spacing.md,
                      border: `1px solid ${theme.colors.border.light}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.sm,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  
                  <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                    <button
                      onClick={handleSaveDraft}
                      disabled={isSaving}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: theme.colors.primary.main,
                        color: theme.colors.background.paper,
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        cursor: isSaving ? 'wait' : 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                      }}
                    >
                      {isSaving ? t('common.saving') : t('common.save')}
                    </button>
                    
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
                        color: theme.colors.text.secondary,
                        border: `1px solid ${theme.colors.border.light}`,
                        borderRadius: theme.borderRadius.sm,
                        cursor: isSaving ? 'wait' : 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasError && onRetryGeneration && (
            <button
              onClick={() => onRetryGeneration(thread.threadId)}
              style={{
                marginTop: theme.spacing.sm,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                color: theme.colors.error.main,
                border: `1px solid ${theme.colors.error.main}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

