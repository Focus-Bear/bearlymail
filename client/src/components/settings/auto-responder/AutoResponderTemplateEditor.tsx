import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED_ALT } from 'constants/numbers';
import { AutoResponderConfig, QueueStats } from './types';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface AutoResponderTemplateEditorProps {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  userName?: string;
  onTemplateChange: (templates: Partial<AutoResponderConfig['templates']>) => Promise<void>;
}

type TemplateType = 'standard' | 'highPriority' | 'lowPriority';

const MERGE_TAGS = [
  { tag: '{{userName}}', description: 'Your name' },
  { tag: '{{senderName}}', description: 'Sender\'s name' },
  { tag: '{{actionCount}}', description: 'Emails flagged for action' },
  { tag: '{{triageCount}}', description: 'Emails pending triage' },
  { tag: '{{avgResponseTime}}', description: 'Average response time' },
  { tag: '{{urgentResponseTime}}', description: 'Urgent response time' },
  { tag: '{{#if hasAiAnswer}}...{{/if}}', description: 'Show content if AI answer available' },
  { tag: '{{#unless hasAiAnswer}}...{{/unless}}', description: 'Show content if no AI answer' },
  { tag: '{{aiAnswer}}', description: 'AI-generated answer' },
];

const TEMPLATE_LABELS: Record<TemplateType, { label: string; emoji: string; description: string }> = {
  standard: {
    label: 'Standard Priority',
    emoji: '📬',
    description: 'Sent for medium priority emails',
  },
  highPriority: {
    label: 'High Priority',
    emoji: '🔥',
    description: 'Sent for urgent/high priority emails',
  },
  lowPriority: {
    label: 'Low Priority',
    emoji: '📭',
    description: 'Sent for low priority emails',
  },
};

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

const renderPreviewWithMergeTags = (
  template: string,
  userName: string,
  stats: QueueStats
): string => {
  let result = template;
  
  result = result.replace(/\{\{userName\}\}/g, userName);
  result = result.replace(/\{\{senderName\}\}/g, 'John Smith');
  result = result.replace(/\{\{actionCount\}\}/g, String(stats.actionCount > 100 ? '100+' : stats.actionCount));
  result = result.replace(/\{\{triageCount\}\}/g, String(stats.triageCount > 100 ? '100+' : stats.triageCount));
  result = result.replace(/\{\{avgResponseTime\}\}/g, stats.avgResponseTime);
  result = result.replace(/\{\{urgentResponseTime\}\}/g, stats.urgentResponseTime);
  
  // Handle conditional blocks - show AI answer section for preview
  result = result.replace(
    /\{\{#if hasAiAnswer\}\}([\s\S]*?)\{\{\/if\}\}/g,
    '$1'
  );
  result = result.replace(
    /\{\{#unless hasAiAnswer\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    ''
  );
  result = result.replace(/\{\{aiAnswer\}\}/g, '[AI-generated answer would appear here based on your Q&A context]');
  
  return result;
};

export const AutoResponderTemplateEditor: React.FC<AutoResponderTemplateEditorProps> = ({
  config,
  queueStats,
  userName,
  onTemplateChange,
}) => {
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('standard');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showMergeTags, setShowMergeTags] = useState(false);

  const stats = queueStats || {
    actionCount: 37,
    triageCount: 21,
    avgResponseTime: '~4 days',
    urgentResponseTime: '12-24 hours',
  };

  const displayName = userName || 'Your Name';

  const getCurrentTemplate = useCallback(() => {
    return config.templates[selectedTemplate] || '';
  }, [config.templates, selectedTemplate]);

  const handleEditClick = () => {
    setEditedTemplate(getCurrentTemplate());
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedTemplate('');
  };

  const handleSaveTemplate = async () => {
    setIsSaving(true);
    try {
      await onTemplateChange({ [selectedTemplate]: editedTemplate });
      setIsEditing(false);
      setEditedTemplate('');
    } finally {
      setIsSaving(false);
    }
  };

  const insertMergeTag = (tag: string) => {
    const textarea = document.getElementById('template-editor') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = editedTemplate.slice(0, start) + tag + editedTemplate.slice(end);
      setEditedTemplate(newValue);
      // Restore cursor position after the inserted tag
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setEditedTemplate(editedTemplate + tag);
    }
  };

  const currentTemplate = getCurrentTemplate();
  const previewText = isEditing
    ? renderPreviewWithMergeTags(editedTemplate, displayName, stats)
    : renderPreviewWithMergeTags(currentTemplate, displayName, stats);

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
          backgroundColor: COLOR_TRANSPARENT,
          border: STRING_NONE,
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
            {t('settings.autoResponder.templates.title')}
          </h3>
          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            margin: 0,
            marginTop: theme.spacing.xs,
          }}>
            {t('settings.autoResponder.templates.description')}
          </p>
        </div>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: theme.typography.fontSize.lg }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div style={{ padding: theme.spacing.md, paddingTop: 0 }}>
          {/* Template selector tabs */}
          <div style={{
            display: 'flex',
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.md,
            flexWrap: 'wrap',
          }}>
            {(Object.keys(TEMPLATE_LABELS) as TemplateType[]).map((template) => (
              <button
                key={template}
                onClick={() => {
                  setSelectedTemplate(template);
                  if (isEditing) {
                    setEditedTemplate(config.templates[template] || '');
                  }
                }}
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
                {TEMPLATE_LABELS[template].emoji} {TEMPLATE_LABELS[template].label}
              </button>
            ))}
          </div>

          {/* Template description */}
          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
          }}>
            {TEMPLATE_LABELS[selectedTemplate].description}
          </p>

          {/* Edit/Preview toggle */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.sm,
          }}>
            <div style={{
              display: 'flex',
              gap: theme.spacing.sm,
            }}>
              {!isEditing ? (
                <button
                  onClick={handleEditClick}
                  style={{
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    backgroundColor: theme.colors.background.paper,
                    color: theme.colors.primary.main,
                    border: `1px solid ${theme.colors.primary.main}`,
                    borderRadius: theme.borderRadius.sm,
                    cursor: 'pointer',
                    ...theme.typography.body.medium,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  {t('settings.autoResponder.templates.edit')}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={isSaving}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                      backgroundColor: theme.colors.primary.main,
                      color: COLOR_NAMED_WHITE,
                      border: STRING_NONE,
                      borderRadius: theme.borderRadius.sm,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      opacity: isSaving ? OPACITY_DISABLED_ALT : 1,
                      ...theme.typography.body.medium,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}
                  >
                    {isSaving ? t('common.saving') : t('common.save')}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                      backgroundColor: COLOR_TRANSPARENT,
                      color: theme.colors.text.secondary,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      ...theme.typography.body.medium,
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              )}
            </div>
            {isEditing && (
              <button
                onClick={() => setShowMergeTags(!showMergeTags)}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: showMergeTags ? theme.colors.primary.light : 'transparent',
                  color: theme.colors.primary.main,
                  border: `1px solid ${theme.colors.primary.main}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  ...theme.typography.body.small,
                }}
              >
                {t('settings.autoResponder.templates.mergeTags')}
              </button>
            )}
          </div>

          {/* Merge tags panel */}
          {isEditing && showMergeTags && (
            <div style={{
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              padding: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
            }}>
              <p style={{
                ...theme.typography.body.small,
                color: theme.colors.text.tertiary,
                marginBottom: theme.spacing.xs,
              }}>
                {t('settings.autoResponder.templates.mergeTagsHelp')}
              </p>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
              }}>
                {MERGE_TAGS.map((item) => (
                  <button
                    key={item.tag}
                    onClick={() => insertMergeTag(item.tag)}
                    title={item.description}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.greyscale[300],
                      color: theme.colors.text.primary,
                      border: STRING_NONE,
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      ...theme.typography.body.small,
                    }}
                  >
                    {item.tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor or Preview */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
            overflow: 'hidden',
          }}>
            {/* Subject line */}
            <div style={{
              padding: theme.spacing.md,
              borderBottom: `1px solid ${theme.colors.border.light}`,
              backgroundColor: theme.colors.greyscale[300],
            }}>
              <div style={{
                ...theme.typography.body.medium,
                color: theme.colors.text.tertiary,
              }}>
                {t('settings.autoResponder.preview.subject')}
              </div>
              <div style={{
                ...theme.typography.body.xLarge,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.text.primary,
                padding: theme.spacing.xs,
              }}>
                {t('settings.autoResponder.preview.subjectPlaceholder')}
              </div>
              <div style={{
                ...theme.typography.body.small,
                color: theme.colors.text.tertiary,
                fontStyle: 'italic',
                marginTop: theme.spacing.xs,
              }}>
                {t('settings.autoResponder.preview.subjectNote')}
              </div>
            </div>

            {/* Template editor or preview */}
            {isEditing ? (
              <textarea
                id="template-editor"
                value={editedTemplate}
                onChange={(e) => setEditedTemplate(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '400px',
                  padding: theme.spacing.md,
                  border: STRING_NONE,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  ...theme.typography.body.medium,
                  lineHeight: 1.6,
                }}
                placeholder={t('settings.autoResponder.templates.placeholder')}
              />
            ) : (
              <div style={{
                padding: theme.spacing.md,
                whiteSpace: 'pre-wrap',
                ...theme.typography.body.large,
                color: theme.colors.text.primary,
                lineHeight: 1.6,
              }}>
                {currentTemplate ? renderFormattedText(previewText) : (
                  <p style={{
                    color: theme.colors.text.tertiary,
                    fontStyle: 'italic',
                  }}>
                    {t('settings.autoResponder.templates.noTemplate')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Preview section when editing */}
          {isEditing && editedTemplate && (
            <div style={{ marginTop: theme.spacing.md }}>
              <h4 style={{
                ...theme.typography.heading.h6,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.sm,
              }}>
                {t('settings.autoResponder.templates.livePreview')}
              </h4>
              <div style={{
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.light}`,
                padding: theme.spacing.md,
                whiteSpace: 'pre-wrap',
                ...theme.typography.body.large,
                color: theme.colors.text.primary,
                lineHeight: 1.6,
              }}>
                {renderFormattedText(previewText)}
              </div>
            </div>
          )}

          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            marginTop: theme.spacing.md,
            marginBottom: 0,
            fontStyle: 'italic',
          }}>
            {t('settings.autoResponder.preview.note')}
          </p>
        </div>
      )}
    </div>
  );
};
