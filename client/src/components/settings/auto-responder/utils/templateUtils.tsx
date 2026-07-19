import React from 'react';
import { theme } from 'theme/theme';

export const MERGE_TAGS = [
  { tag: '{{userName}}', description: 'Your name' },
  { tag: '{{senderName}}', description: "Sender's name" },
  { tag: '{{actionCount}}', description: 'Emails flagged for action' },
  { tag: '{{triageCount}}', description: 'Emails pending triage' },
  { tag: '{{avgResponseTime}}', description: 'Average response time' },
  { tag: '{{urgentResponseTime}}', description: 'Urgent response time' },
  { tag: '{{#if hasAiAnswer}}...{{/if}}', description: 'Show content if AI answer available' },
  { tag: '{{#unless hasAiAnswer}}...{{/unless}}', description: 'Show content if no AI answer' },
  { tag: '{{aiAnswer}}', description: 'AI-generated answer' },
];

export const renderFormattedText = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let match: RegExpExecArray | null;

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

interface TemplateStats {
  actionCount: number;
  triageCount: number;
  avgResponseTime: string;
  urgentResponseTime: string;
}

export const renderPreviewWithMergeTags = (template: string, userName: string, stats: TemplateStats): string => {
  let result = template;

  result = result.replace(/\{\{userName\}\}/g, userName);
  result = result.replace(/\{\{senderName\}\}/g, 'John Smith');
  result = result.replace(/\{\{actionCount\}\}/g, String(stats.actionCount > 100 ? '100+' : stats.actionCount));
  result = result.replace(/\{\{triageCount\}\}/g, String(stats.triageCount > 100 ? '100+' : stats.triageCount));
  result = result.replace(/\{\{avgResponseTime\}\}/g, stats.avgResponseTime);
  result = result.replace(/\{\{urgentResponseTime\}\}/g, stats.urgentResponseTime);

  // Handle conditional blocks - show AI answer section for preview
  result = result.replace(/\{\{#if hasAiAnswer\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  result = result.replace(/\{\{#unless hasAiAnswer\}\}([\s\S]*?)\{\{\/unless\}\}/g, '');
  result = result.replace(/\{\{aiAnswer\}\}/g, '[AI-generated answer would appear here based on your Q&A context]');

  return result;
};

const templateUtils = { MERGE_TAGS, renderFormattedText, renderPreviewWithMergeTags };
export default templateUtils;
