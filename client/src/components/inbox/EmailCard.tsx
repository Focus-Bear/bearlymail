import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme/theme';
import { EmailCardHeader, EmailCardBody, EmailCardActions } from './email-card';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  priorityScore: number;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  receivedAt: string;
  isProcessingPriority?: boolean;
  isProcessingSummary?: boolean;
  summary?: string | null;
  isStarred?: boolean;
  starCount?: number; // Thread-level property (0-3)
  isArchived?: boolean; // Thread-level property
  labels?: string[];
  urgencyScore?: number; // Thread-level urgency score (0-100)
  urgencyExplanation?: string | null; // Thread-level urgency explanation
}

interface EmailCardProps {
  email: Email;
  mode: 'triage' | 'action' | 'follow-up';
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  onMarkAsRead: (emailId: string) => void;
  onToggleStar: (emailId: string, e: React.MouseEvent) => void;
  onArchive: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => void;
  snoozeInput: string;
  showSnoozeInput: boolean;
  onSnoozeInputChange: (value: string) => void;
  onShowSnoozeInput: (emailId: string) => void;
  onHideSnoozeInput: () => void;
}

export const EmailCard: React.FC<EmailCardProps> = ({
  email,
  mode,
  priorityLabel,
  priorityColor,
  priorityBg,
  onMarkAsRead,
  onToggleStar,
  onArchive,
  onSnooze,
  snoozeInput,
  showSnoozeInput,
  onSnoozeInputChange,
  onShowSnoozeInput,
  onHideSnoozeInput,
}) => {
  const navigate = useNavigate();

  const getBorderLeft = (): string => {
    if (email.isRead) return `1px solid ${theme.colors.border.light}`;
    return `4px solid ${theme.colors.primary.main}`;
  };

  return (
    <div
      onClick={() => {
        onMarkAsRead(email.id);
        navigate(`/email/${email.id}`);
      }}
      className="animate-fade-in"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.lg,
        border: `1px solid ${email.isRead ? theme.colors.border.light : theme.colors.primary.light}`,
        borderLeft: getBorderLeft(),
        boxShadow: email.isRead ? theme.shadows.sm : theme.shadows.md,
        cursor: 'pointer',
        transition: theme.transitions.default,
        position: 'relative',
        opacity: email.isRead ? 0.7 : 1,
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
      <EmailCardHeader
        from={email.from}
        fromName={email.fromName}
        isRead={email.isRead}
        priorityLabel={priorityLabel}
        priorityColor={priorityColor}
        priorityBg={priorityBg}
        priorityScore={email.priorityScore}
        isProcessingPriority={email.isProcessingPriority ?? false}
        urgencyScore={email.urgencyScore}
        urgencyExplanation={email.urgencyExplanation}
        labels={email.labels}
        receivedAt={email.receivedAt}
      />

      <EmailCardBody
        subject={email.subject}
        isRead={email.isRead}
        body={email.body}
        summary={email.summary}
        isProcessingSummary={email.isProcessingSummary ?? false}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }} />
        <EmailCardActions
          isStarred={email.isStarred}
          showSnoozeInput={showSnoozeInput}
          snoozeInput={snoozeInput}
          onToggleStar={(e) => onToggleStar(email.id, e)}
          onArchive={(e) => onArchive(email.id, e)}
          onShowSnoozeInput={() => onShowSnoozeInput(email.id)}
          onSnoozeInputChange={onSnoozeInputChange}
          onSnooze={() => onSnooze(email.id)}
          onHideSnoozeInput={onHideSnoozeInput}
        />
      </div>
    </div>
  );
};



