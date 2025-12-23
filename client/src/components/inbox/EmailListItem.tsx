import React from 'react';
import { theme } from '../../theme/theme';
import { Email, InboxMode, TriageSuggestion } from '../../types/email';
import { TriageSuggestionBanner } from './TriageSuggestionBanner';
import { EmailCardHeader } from './EmailCardHeader';
import { EmailPreview } from './EmailPreview';
import { EmailActionsRow } from './EmailActionsRow';

interface EmailListItemProps {
  email: Email;
  index: number;
  mode: InboxMode;
  isSelected: boolean;
  suggestion: TriageSuggestion | null;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: any;
    loadingPriorityExplanation: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
  };
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onEmailClick: (emailId: string, index: number, e: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
  onOverrideUrgency?: () => void;
  followUpData?: {
    id: string;
    draftFollowUp: string | null;
    generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
    generationError: string | null;
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
    sendError: string | null;
  } | null;
  onUpdateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onSendFollowUp?: (followUpId: string) => Promise<void>;
}

export const EmailListItem: React.FC<EmailListItemProps> = ({
  email,
  index,
  mode,
  isSelected,
  suggestion,
  priorityTooltip,
  keyboardHint,
  snoozeInput,
  onEmailClick,
  onEmailSelect,
  onSetStarCount,
  onArchive,
  onBlockSender,
  onSnooze,
  onOverrideUrgency,
  followUpData,
  onUpdateDraft,
  onSendFollowUp,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      {/* Email Card */}
      <div
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-priority-badge]') || target.closest('[data-priority-tooltip]')) {
            return;
          }
          
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            onEmailClick(email.id, index, e);
          } else {
            onEmailSelect(email.id, e);
          }
        }}
        className="animate-fade-in"
        style={{
          backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.lg,
          border: `2px solid ${isSelected ? theme.colors.primary.main : (email.isRead ? theme.colors.border.light : theme.colors.primary.light)}`,
          borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${theme.colors.primary.main}`,
          boxShadow: theme.shadows.sm,
          cursor: 'pointer',
          transition: theme.transitions.default,
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = theme.shadows.md;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = theme.shadows.sm;
        }}
      >
        {/* Header */}
        <EmailCardHeader 
          email={email} 
          priorityTooltip={priorityTooltip}
          onOverrideUrgency={onOverrideUrgency}
        />

        {/* Subject */}
        <div style={{
          color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.sm,
        }}>
          {email.subject}
        </div>

        {/* Preview */}
        <EmailPreview email={email} />

        {/* Follow-up metadata (only in follow-up mode) */}
        {mode === 'follow-up' && ((email as any).lastTheirReplyAt || (email as any).lastMyReplyAt) && (
          <div style={{
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.sm,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}>
            {(email as any).otherPersonName && (
              <div style={{ marginBottom: theme.spacing.xs }}>
                <strong>With:</strong> {(email as any).otherPersonName}
              </div>
            )}
            {(email as any).lastTheirReplyAt ? (
              <div style={{ marginBottom: theme.spacing.xs }}>
                <strong>Days since their last response:</strong> {Math.floor(
                  (new Date().getTime() - new Date((email as any).lastTheirReplyAt).getTime()) / (1000 * 60 * 60 * 24)
                )} day{Math.floor(
                  (new Date().getTime() - new Date((email as any).lastTheirReplyAt).getTime()) / (1000 * 60 * 60 * 24)
                ) !== 1 ? 's' : ''}
              </div>
            ) : (
              <div style={{ marginBottom: theme.spacing.xs }}>
                <strong>Status:</strong> No reply received
              </div>
            )}
            {(email as any).lastMyReplyAt && (
              <div>
                <strong>You sent last:</strong> {new Date((email as any).lastMyReplyAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {/* Follow-up Draft (only in follow-up mode) */}
        {mode === 'follow-up' && followUpData && (
          <div style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.light}`,
          }}>
            {followUpData.generationStatus === 'generating' && (
              <div style={{
                padding: theme.spacing.sm,
                textAlign: 'center',
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
              }}>
                Generating draft...
              </div>
            )}
            {followUpData.generationStatus === 'error' && (
              <div style={{
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.error.light,
                color: theme.colors.error.main,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.sm,
                marginBottom: theme.spacing.sm,
              }}>
                Error: {followUpData.generationError || 'Failed to generate draft'}
              </div>
            )}
            {followUpData.draftFollowUp && (
              <div>
                <div style={{
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.background.paper,
                  borderRadius: theme.borderRadius.sm,
                  marginBottom: theme.spacing.sm,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  whiteSpace: 'pre-wrap',
                }}>
                  {followUpData.draftFollowUp}
                </div>
                <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (onSendFollowUp && followUpData.id) {
                        await onSendFollowUp(followUpData.id);
                      }
                    }}
                    disabled={followUpData.sendStatus === 'sending' || followUpData.sendStatus === 'sent'}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                      backgroundColor: followUpData.sendStatus === 'sent' 
                        ? theme.colors.success.main 
                        : theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      cursor: (followUpData.sendStatus === 'sending' || followUpData.sendStatus === 'sent') 
                        ? 'not-allowed' 
                        : 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      fontWeight: theme.typography.fontWeight.medium,
                      opacity: (followUpData.sendStatus === 'sending' || followUpData.sendStatus === 'sent') ? 0.6 : 1,
                    }}
                  >
                    {followUpData.sendStatus === 'sending' 
                      ? 'Sending...' 
                      : followUpData.sendStatus === 'sent' 
                      ? 'Sent' 
                      : 'Send'}
                  </button>
                  {followUpData.sendStatus === 'failed' && followUpData.sendError && (
                    <span style={{
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.error.main,
                    }}>
                      Send failed: {followUpData.sendError}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions Row */}
        <EmailActionsRow
          email={email}
          mode={mode}
          suggestion={suggestion}
          keyboardHint={keyboardHint}
          snoozeInput={snoozeInput}
          onSetStarCount={onSetStarCount}
          onArchive={onArchive}
          onBlockSender={onBlockSender}
          onSnooze={onSnooze}
        />
      </div>
    </div>
  );
};

