import React from 'react';
import { theme } from '../../theme/theme';
import { Email, InboxMode, TriageSuggestion } from '../../types/email';
import { TriageSuggestionBanner } from './TriageSuggestionBanner';
import { captureEvent } from '../../utils/posthog';

interface EmailActionsRowProps {
  email: Email;
  mode: InboxMode;
  suggestion?: TriageSuggestion | null;
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
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
}

export const EmailActionsRow: React.FC<EmailActionsRowProps> = ({
  email,
  mode,
  suggestion,
  keyboardHint,
  snoozeInput,
  onSetStarCount,
  onArchive,
  onBlockSender,
  onSnooze,
}) => {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Actions Card - Groups all actions together */}
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xs,
      }}>
        {/* Prioritise more deeply section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: theme.spacing.md,
        }}>
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            fontWeight: theme.typography.fontWeight.medium,
            whiteSpace: 'nowrap',
          }}>
            Prioritise more deeply:
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: theme.spacing.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.background.subtle,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
          }}>
            {[1, 2, 3].map(count => (
              <button
                key={count}
                onClick={(e) => {
                  e.stopPropagation();
                  const currentCount = email.starCount || 0;
                  const newCount = currentCount === count ? 0 : count;
                  onSetStarCount(email.id, newCount, e);
                  if (e.type === 'click' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                    keyboardHint.showHint(email.id, `Press ${count} to set ${count} star${count > 1 ? 's' : ''}`);
                    setTimeout(() => keyboardHint.hideHint(), 3000);
                  }
                }}
                title={(email.starCount || 0) === count ? `Remove stars (or press ${count})` : `Set ${count} star${count > 1 ? 's' : ''} (or press ${count})`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.4rem',
                  padding: '2px 4px',
                  color: (email.starCount || 0) >= count ? theme.colors.accent.warning : theme.colors.text.tertiary,
                  opacity: (email.starCount || 0) >= count ? 1 : 0.5,
                  transition: theme.transitions.fast,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = (email.starCount || 0) >= count ? '1' : '0.5';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ⭐
              </button>
            ))}
          </div>
        </div>

        {/* Other actions section */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: theme.spacing.xs,
        }}>
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.error.main,
            fontWeight: theme.typography.fontWeight.medium,
            marginBottom: theme.spacing.xs,
          }}>
            Other actions:
          </div>
          <div style={{ 
            display: 'flex', 
            gap: theme.spacing.sm, 
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive(email.id, e);
                if (e.type === 'click' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                  keyboardHint.showHint(email.id, 'Press Delete to archive');
                  setTimeout(() => keyboardHint.hideHint(), 3000);
                }
              }}
              title="Archive (or press Delete)"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '0 4px',
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <span>📥</span>
              <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>Archive</span>
            </button>

            {/* Snooze (hidden in triage mode) */}
            {mode !== 'triage' && (
              <>
                {snoozeInput.showSnoozeInput === email.id ? (
                  <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="2h, tomorrow..."
                      autoFocus
                      value={snoozeInput.getSnoozeValue(email.id)}
                      onChange={(e) => snoozeInput.setSnoozeValue(email.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (snoozeInput.getSnoozeValue(email.id)?.trim()) {
                            onSnooze(email.id);
                          }
                        }
                        if (e.key === 'Escape') {
                          snoozeInput.clearSnooze(email.id);
                        }
                      }}
                      style={{
                        padding: theme.spacing.xs,
                        borderRadius: theme.borderRadius.sm,
                        border: `1px solid ${theme.colors.primary.main}`,
                        fontSize: theme.typography.fontSize.sm,
                        width: '100px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => {
                        if (snoozeInput.getSnoozeValue(email.id)?.trim()) {
                          onSnooze(email.id);
                        }
                      }}
                      disabled={!snoozeInput.getSnoozeValue(email.id)?.trim()}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        borderRadius: theme.borderRadius.sm,
                        backgroundColor: snoozeInput.getSnoozeValue(email.id)?.trim() ? theme.colors.primary.main : theme.colors.background.subtle,
                        color: snoozeInput.getSnoozeValue(email.id)?.trim() ? 'white' : theme.colors.text.tertiary,
                        border: 'none',
                        cursor: snoozeInput.getSnoozeValue(email.id)?.trim() ? 'pointer' : 'not-allowed',
                        fontSize: theme.typography.fontSize.xs,
                        fontWeight: theme.typography.fontWeight.medium,
                        opacity: snoozeInput.getSnoozeValue(email.id)?.trim() ? 1 : 0.6,
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        captureEvent('email_snooze_cancelled', { email_id: email.id });
                        snoozeInput.clearSnooze(email.id);
                      }}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        borderRadius: theme.borderRadius.sm,
                        backgroundColor: 'transparent',
                        color: theme.colors.text.secondary,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.xs,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      captureEvent('email_snooze_clicked', { email_id: email.id });
                      snoozeInput.showSnooze(email.id);
                    }}
                    title="Snooze"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      padding: '0 4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      color: theme.colors.text.tertiary,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                  >
                    <span>⏰</span>
                    <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>Snooze</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={(e) => onBlockSender(email.id, e)}
              title="Block sender"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: '0 4px',
                opacity: 0.6,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <span>🚫</span>
              <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>Block sender</span>
            </button>
          </div>
        </div>
      </div>

      {/* Suggested Prioritization - Outside the card, not full width */}
      {suggestion && mode === 'triage' && suggestion.suggestedStarCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <TriageSuggestionBanner
            suggestion={suggestion}
            emailId={email.id}
            onApply={onSetStarCount}
          />
        </div>
      )}
    </div>
  );
};

