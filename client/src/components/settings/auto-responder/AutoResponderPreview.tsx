import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { QueueStats } from './types';

interface AutoResponderPreviewProps {
  queueStats: QueueStats | null;
}

export const AutoResponderPreview: React.FC<AutoResponderPreviewProps> = ({
  queueStats,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<'standard' | 'highPriority' | 'lowPriority'>('standard');
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = queueStats || {
    actionCount: 37,
    triageCount: 21,
    avgResponseTime: '~4 days',
    urgentResponseTime: '12-24 hours',
  };

  const templatePreviews = {
    standard: {
      label: 'Standard Priority',
      emoji: '📬',
      subject: 'Re: Question about your project - BearlyMail Auto-Response',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail, your AI email assistant (think of me as a friendly bouncer for his inbox, but I promise I'm nicer than most bouncers).

I've reviewed your email and categorized it as medium priority, which means it'll be in the queue but not at the top. Currently:
- 📬 ${stats.actionCount > 100 ? '100+' : stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount > 100 ? '100+' : stats.triageCount} emails still to triage
- ⏱️ Average response time for similar emails: ${stats.avgResponseTime}

**Want to jump the queue?** Just reply and let me know why this is time-sensitive. I'm not a monster.

**Might I be helpful in the meantime?** Based on previous conversations, I think I might be able to help with your question:

_[AI-generated answer would appear here based on your email history]_

---
*You're receiving this because BearlyMail is being used to manage email overload.*`,
    },
    highPriority: {
      label: 'High Priority',
      emoji: '🔥',
      subject: 'Re: Urgent request - Escalated',
      body: `Hi!

Thanks for your email—this one caught my attention.

I'm BearlyMail, your AI email assistant. I've flagged your email as high priority and moved it to the top of the action queue. You should see a response within the next 24 hours.

Here's what's happening:
- ⚡ Your email has been escalated
- 📊 Current queue: ${stats.actionCount} action items, ${stats.triageCount} to triage
- 🎯 Typical response time for urgent emails: ${stats.urgentResponseTime}

---
*This email was flagged as high priority based on urgency indicators.*`,
    },
    lowPriority: {
      label: 'Low Priority',
      emoji: '📭',
      subject: 'Re: FYI - Auto-Response',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail.

I've reviewed your email and it looks like it's not super time-sensitive, so I've placed it in the general queue. Currently:
- 📬 ${stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount} emails still to triage
- ⏱️ Typical response time: ${stats.avgResponseTime}

If this is actually urgent, just reply and let me know—I'll bump it up!

---
*You're receiving this because BearlyMail is being used to manage email overload.*`,
    },
  };

  const currentPreview = templatePreviews[selectedTemplate];

  return (
    <div style={{
      marginTop: theme.spacing.lg,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: theme.spacing.md,
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <h3 style={{
            ...theme.typography.heading.h6,
            color: theme.colors.text.primary,
            margin: 0,
          }}>
            👀 Preview Auto-Responses
          </h3>
          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            margin: 0,
            marginTop: theme.spacing.xs,
          }}>
            See what your auto-responses will look like
          </p>
        </div>
        <span style={{
          fontSize: '1.25rem',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: theme.transitions.fast,
        }}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div style={{ padding: theme.spacing.md, paddingTop: 0 }}>
          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.md,
          }}>
            {(['standard', 'highPriority', 'lowPriority'] as const).map((template) => (
              <button
                key={template}
                onClick={() => setSelectedTemplate(template)}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: selectedTemplate === template
                    ? theme.colors.primary.main
                    : theme.colors.background.paper,
                  color: selectedTemplate === template
                    ? 'white'
                    : theme.colors.text.primary,
                  border: `1px solid ${selectedTemplate === template
                    ? theme.colors.primary.main
                    : theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  ...theme.typography.body.large,
                  fontWeight: theme.typography.fontWeight.medium,
                  transition: theme.transitions.fast,
                }}
              >
                {templatePreviews[template].emoji} {templatePreviews[template].label}
              </button>
            ))}
          </div>

          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: theme.spacing.md,
              borderBottom: `1px solid ${theme.colors.border.light}`,
              backgroundColor: theme.colors.greyscale[300],
            }}>
              <div style={{
                ...theme.typography.body.medium,
                color: theme.colors.text.tertiary,
              }}>
                Subject:
              </div>
              <div style={{
                ...theme.typography.body.xLarge,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.text.primary,
              }}>
                {currentPreview.subject}
              </div>
            </div>

            <div style={{
              padding: theme.spacing.md,
              whiteSpace: 'pre-wrap',
              ...theme.typography.body.large,
              color: theme.colors.text.primary,
              lineHeight: 1.6,
            }}>
              {currentPreview.body}
            </div>
          </div>

          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            marginTop: theme.spacing.md,
            marginBottom: 0,
            fontStyle: 'italic',
          }}>
            Note: The actual response will use your real queue statistics and may include
            AI-generated answers if enabled and relevant.
          </p>
        </div>
      )}
    </div>
  );
};
