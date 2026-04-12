import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import TemplateEditorToolbar from './components/TemplateEditorToolbar';
import TemplatePreview from './components/TemplatePreview';
import { AutoResponderConfig, QueueStats } from './types';
import { renderFormattedText, renderPreviewWithMergeTags } from './utils/templateUtils';

interface AutoResponderTemplateEditorProps {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  userName?: string;
  onTemplateChange: (templates: Partial<AutoResponderConfig['templates']>) => Promise<void>;
}

type TemplateType = 'standard' | 'highPriority' | 'lowPriority';

declare global {
  interface WindowEventMap {
    'insert-merge-tag': CustomEvent<string>;
  }
}

const TEMPLATE_LABELS: Record<TemplateType, { label: string; emoji: string; description: string }> = {
  standard: { label: 'Standard Priority', emoji: '📬', description: 'Sent for medium priority emails' },
  highPriority: { label: 'High Priority', emoji: '🔥', description: 'Sent for urgent/high priority emails' },
  lowPriority: { label: 'Low Priority', emoji: '📭', description: 'Sent for low priority emails' },
};

interface TemplateEditorExpandedProps {
  selectedTemplate: TemplateType;
  isEditing: boolean;
  isSaving: boolean;
  showMergeTags: boolean;
  editedTemplate: string;
  currentTemplate: string;
  previewText: string;
  config: AutoResponderConfig;
  setSelectedTemplate: (t: TemplateType) => void;
  setEditedTemplate: (v: string) => void;
  setShowMergeTags: (v: boolean) => void;
  handleEditClick: () => void;
  handleSaveTemplate: () => void;
  handleCancelEdit: () => void;
  t: (tKey: string) => string;
}

const TemplateEditorExpanded: React.FC<TemplateEditorExpandedProps> = ({
  selectedTemplate,
  isEditing,
  isSaving,
  showMergeTags,
  editedTemplate,
  currentTemplate,
  previewText,
  config,
  setSelectedTemplate,
  setEditedTemplate,
  setShowMergeTags,
  handleEditClick,
  handleSaveTemplate,
  handleCancelEdit,
  t,
}) => (
  <div style={{ padding: theme.spacing.md, paddingTop: 0 }}>
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: 'wrap' }}>
      {(Object.keys(TEMPLATE_LABELS) as TemplateType[]).map(tmpl => (
        <button
          key={tmpl}
          onClick={() => {
            setSelectedTemplate(tmpl);
            if (isEditing) {
              setEditedTemplate(config.templates[tmpl] || '');
            }
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: selectedTemplate === tmpl ? theme.colors.primary.main : theme.colors.background.paper,
            color: selectedTemplate === tmpl ? 'white' : theme.colors.text.primary,
            border: `1px solid ${selectedTemplate === tmpl ? theme.colors.primary.main : theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            ...theme.typography.body.large,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.fast,
          }}
        >
          {TEMPLATE_LABELS[tmpl].emoji} {TEMPLATE_LABELS[tmpl].label}
        </button>
      ))}
    </div>
    <p style={{ ...theme.typography.body.medium, color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
      {TEMPLATE_LABELS[selectedTemplate].description}
    </p>
    <TemplateEditorToolbar
      isEditing={isEditing}
      isSaving={isSaving}
      showMergeTags={showMergeTags}
      setShowMergeTags={setShowMergeTags}
      onEditClick={handleEditClick}
      onSaveClick={handleSaveTemplate}
      onCancelClick={handleCancelEdit}
      t={(tKey: string) => t(tKey)}
    />
    <TemplatePreview
      isEditing={isEditing}
      editedTemplate={editedTemplate}
      currentTemplate={currentTemplate}
      previewText={previewText}
      t={(tKey: string) => t(tKey)}
    />
    {isEditing && editedTemplate && (
      <div style={{ marginTop: theme.spacing.md }}>
        <h4
          style={{ ...theme.typography.heading.h6, color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}
        >
          {t('settings.autoResponder.templates.livePreview')}
        </h4>
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
            padding: theme.spacing.md,
            whiteSpace: 'pre-wrap',
            ...theme.typography.body.large,
            color: theme.colors.text.primary,
            lineHeight: 1.6,
          }}
        >
          {renderFormattedText(previewText)}
        </div>
      </div>
    )}
    <p
      style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.tertiary,
        marginTop: theme.spacing.md,
        marginBottom: 0,
        fontStyle: 'italic',
      }}
    >
      {t('settings.autoResponder.preview.note')}
    </p>
  </div>
);

interface UseTemplateEditorStateProps {
  config: AutoResponderConfig;
  queueStats: QueueStats | null;
  userName?: string;
  onTemplateChange: (templates: Partial<AutoResponderConfig['templates']>) => Promise<void>;
}

function useTemplateEditorState({ config, queueStats, userName, onTemplateChange }: UseTemplateEditorStateProps) {
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

  useEffect(() => {
    const handler = (event: CustomEvent<string>) => {
      const tag = event.detail;
      const textarea = document.getElementById('template-editor') as HTMLTextAreaElement | null;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = editedTemplate.slice(0, start) + tag + editedTemplate.slice(end);
        setEditedTemplate(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 0);
      } else {
        setEditedTemplate(prev => prev + tag);
      }
    };
    window.addEventListener('insert-merge-tag', handler);
    return () => window.removeEventListener('insert-merge-tag', handler);
  }, [editedTemplate]);

  const currentTemplate = getCurrentTemplate();
  const previewText = isEditing
    ? renderPreviewWithMergeTags(editedTemplate, displayName, stats)
    : renderPreviewWithMergeTags(currentTemplate, displayName, stats);

  return {
    isExpanded,
    setIsExpanded,
    selectedTemplate,
    setSelectedTemplate,
    isEditing,
    isSaving,
    showMergeTags,
    editedTemplate,
    setEditedTemplate,
    setShowMergeTags,
    currentTemplate,
    previewText,
    handleEditClick,
    handleSaveTemplate,
    handleCancelEdit,
  };
}

export const AutoResponderTemplateEditor: React.FC<AutoResponderTemplateEditorProps> = ({
  config,
  queueStats,
  userName,
  onTemplateChange,
}) => {
  const { t } = useTranslation();
  const {
    isExpanded,
    setIsExpanded,
    selectedTemplate,
    setSelectedTemplate,
    isEditing,
    isSaving,
    showMergeTags,
    editedTemplate,
    setEditedTemplate,
    setShowMergeTags,
    currentTemplate,
    previewText,
    handleEditClick,
    handleSaveTemplate,
    handleCancelEdit,
  } = useTemplateEditorState({ config, queueStats, userName, onTemplateChange });

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
      }}
    >
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
          <h3 style={{ ...theme.typography.heading.h6, color: theme.colors.text.primary, margin: 0 }}>
            {t('settings.autoResponder.templates.title')}
          </h3>
          <p
            style={{
              ...theme.typography.body.medium,
              color: theme.colors.text.tertiary,
              margin: 0,
              marginTop: theme.spacing.xs,
            }}
          >
            {t('settings.autoResponder.templates.description')}
          </p>
        </div>
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <TemplateEditorExpanded
          selectedTemplate={selectedTemplate}
          isEditing={isEditing}
          isSaving={isSaving}
          showMergeTags={showMergeTags}
          editedTemplate={editedTemplate}
          currentTemplate={currentTemplate}
          previewText={previewText}
          config={config}
          setSelectedTemplate={setSelectedTemplate}
          setEditedTemplate={setEditedTemplate}
          setShowMergeTags={setShowMergeTags}
          handleEditClick={handleEditClick}
          handleSaveTemplate={handleSaveTemplate}
          handleCancelEdit={handleCancelEdit}
          t={t}
        />
      )}
    </div>
  );
};
