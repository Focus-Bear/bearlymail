import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { QueueStats } from './types';

type TemplateKey = 'standard' | 'highPriority' | 'lowPriority';

interface TemplatePreview {
  label: string;
  emoji: string;
  body: string;
}

const DEFAULT_STATS: QueueStats = {
  actionCount: 37,
  triageCount: 21,
  avgResponseTime: '~4 days',
  urgentResponseTime: '12-24 hours',
};

function buildTemplatePreviews(firstName: string, stats: QueueStats): Record<TemplateKey, TemplatePreview> {
  return {
    standard: {
      label: 'Standard Priority',
      emoji: '📬',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail, ${firstName}'s AI email assistant (think of me as an email bouncer, but I promise I'm nicer than most bouncers).

I've reviewed your email and categorized it as medium priority, which means it'll be in the queue but not at the top. ${firstName} has quite a few other emails to deal with:
- 📬 ${stats.actionCount > 100 ? '100+' : stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount > 100 ? '100+' : stats.triageCount} emails still to triage
- ⏱️ Average response time for similar emails: ${stats.avgResponseTime}

**Want to jump the queue?** Just reply and let me know why this is time-sensitive. I'm not a monster.

**Might I be helpful in the meantime?** Based on the Q&A in your context, I think I might be able to help with your question:

_[AI-generated answer would appear here based on your Q&A context]_

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
    highPriority: {
      label: 'High Priority',
      emoji: '🔥',
      body: `Hi!

Thanks for your email—this one caught my attention.

I'm BearlyMail, ${firstName}'s AI email assistant. I've flagged your email as high priority and moved it to the top of the action queue. You should see a response within the next 24 hours.

Here's what's happening:
- ⚡ Your email has been escalated
- 📊 Current queue: ${stats.actionCount} action items, ${stats.triageCount} to triage
- 🎯 Typical response time for urgent emails: ${stats.urgentResponseTime}

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
    lowPriority: {
      label: 'Low Priority',
      emoji: '📭',
      body: `Hey there!

Thanks for reaching out.

This is an automated response from BearlyMail.

I've reviewed your email and it looks like it's not super time-sensitive, so I've placed it in the general queue. ${firstName} has quite a few other emails to deal with:
- 📬 ${stats.actionCount} emails flagged for action
- 📋 ${stats.triageCount} emails still to triage
- ⏱️ Typical response time: ${stats.avgResponseTime}

If this is actually urgent, just reply and let me know—I'll bump it up!

---
*If you'd like help prioritising your inbox, check out [BearlyMail](https://bearlymail.com)*`,
    },
  };
}

const renderFormattedText = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.slice(currentIndex, match.index));
    }

    if (match[1]) {
      parts.push(<strong key={match.index}>{renderFormattedText(match[2])}</strong>);
    } else if (match[3]) {
      parts.push(
        <a
          key={match.index}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: theme.colors.primary.main }}
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      parts.push(<em key={match.index}>{renderFormattedText(match[7])}</em>);
    } else if (match[8]) {
      parts.push(<em key={match.index}>{renderFormattedText(match[9])}</em>);
    }

    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex));
  }

  return parts.length > 0 ? parts : text;
};

const getFirstName = (fullName: string | undefined): string => {
  if (!fullName) return 'the user';
  const firstName = fullName.split(' ')[0];
  return firstName || fullName;
};

// Static style constants — outside component to avoid recreation on each render
const outerContainerStyle: React.CSSProperties = {
  marginTop: theme.spacing.lg,
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.md,
  overflow: 'hidden',
};

const toggleButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing.md,
  backgroundColor: COLOR_TRANSPARENT,
  border: STRING_NONE,
  cursor: 'pointer',
  textAlign: 'left',
};

const toggleHeadingStyle: React.CSSProperties = {
  ...theme.typography.heading.h6,
  color: theme.colors.text.primary,
  margin: 0,
};

const toggleSubtitleStyle: React.CSSProperties = {
  ...theme.typography.body.medium,
  color: theme.colors.text.tertiary,
  margin: 0,
  marginTop: theme.spacing.xs,
};

const expandedPanelStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  paddingTop: 0,
};

const templateTabsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.spacing.sm,
  marginBottom: theme.spacing.md,
};

const emailCardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.md,
  border: `1px solid ${theme.colors.border.light}`,
  overflow: 'hidden',
};

const emailHeaderStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  borderBottom: `1px solid ${theme.colors.border.light}`,
  backgroundColor: theme.colors.greyscale[300],
};

const emailSubjectLabelStyle: React.CSSProperties = {
  ...theme.typography.body.medium,
  color: theme.colors.text.tertiary,
};

const emailSubjectValueStyle: React.CSSProperties = {
  ...theme.typography.body.xLarge,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.text.primary,
  padding: theme.spacing.xs,
};

const emailSubjectNoteStyle: React.CSSProperties = {
  ...theme.typography.body.small,
  color: theme.colors.text.tertiary,
  fontStyle: 'italic',
  marginTop: theme.spacing.xs,
};

const emailBodyStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  whiteSpace: 'pre-wrap',
  ...theme.typography.body.large,
  color: theme.colors.text.primary,
  lineHeight: 1.6,
};

const previewNoteStyle: React.CSSProperties = {
  ...theme.typography.body.medium,
  color: theme.colors.text.tertiary,
  marginTop: theme.spacing.md,
  marginBottom: 0,
  fontStyle: 'italic',
};

const chevronStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.lg,
};

// Dynamic style helpers — accept state values
function getTemplateTabStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: isActive ? theme.colors.primary.main : theme.colors.background.paper,
    color: isActive ? 'white' : theme.colors.text.primary,
    border: `1px solid ${isActive ? theme.colors.primary.main : theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    ...theme.typography.body.large,
    fontWeight: theme.typography.fontWeight.medium,
    transition: theme.transitions.fast,
  };
}

interface AutoResponderPreviewProps {
  queueStats: QueueStats | null;
  userName?: string;
}

export const AutoResponderPreview: React.FC<AutoResponderPreviewProps> = ({
  queueStats,
  userName,
}) => {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<'standard' | 'highPriority' | 'lowPriority'>('standard');
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = queueStats ?? DEFAULT_STATS;
  const firstName = getFirstName(userName);
  const templatePreviews = buildTemplatePreviews(firstName, stats);
  const currentPreview = templatePreviews[selectedTemplate];

  return (
    <div style={outerContainerStyle}>
      <button onClick={() => setIsExpanded(!isExpanded)} style={toggleButtonStyle}>
        <div>
          <h3 style={toggleHeadingStyle}>{t('settings.autoResponder.preview.title')}</h3>
          <p style={toggleSubtitleStyle}>{t('settings.autoResponder.preview.description')}</p>
        </div>
        <span style={chevronStyle}>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div style={expandedPanelStyle}>
          <div style={templateTabsRowStyle}>
            {(['standard', 'highPriority', 'lowPriority'] as const).map((template) => (
              <button
                key={template}
                onClick={() => setSelectedTemplate(template)}
                style={getTemplateTabStyle(selectedTemplate === template)}
              >
                {templatePreviews[template].emoji} {templatePreviews[template].label}
              </button>
            ))}
          </div>

          <div style={emailCardStyle}>
            <div style={emailHeaderStyle}>
              <div style={emailSubjectLabelStyle}>
                {t('settings.autoResponder.preview.subject')}
              </div>
              <div style={emailSubjectValueStyle}>
                {t('settings.autoResponder.preview.subjectPlaceholder')}
              </div>
              <div style={emailSubjectNoteStyle}>
                {t('settings.autoResponder.preview.subjectNote')}
              </div>
            </div>
            <div style={emailBodyStyle}>{renderFormattedText(currentPreview.body)}</div>
          </div>

          <p style={previewNoteStyle}>{t('settings.autoResponder.preview.note')}</p>
        </div>
      )}
    </div>
  );
};
