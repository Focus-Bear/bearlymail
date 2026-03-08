import React from 'react';
import { theme } from 'theme/theme';

import { renderFormattedText } from 'components/settings/auto-responder/utils/templateUtils';

interface Props {
  isEditing: boolean;
  editedTemplate: string;
  currentTemplate: string;
  previewText: string;
  t: (k: string) => string;
}

const TemplatePreview: React.FC<Props> = ({ isEditing, editedTemplate, currentTemplate, previewText, t }) => {
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: theme.spacing.md,
          borderBottom: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.greyscale[300],
        }}
      >
        <div style={{ ...theme.typography.body.medium, color: theme.colors.text.tertiary }}>
          {t('settings.autoResponder.preview.subject')}
        </div>
        <div
          style={{
            ...theme.typography.body.xLarge,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            padding: theme.spacing.xs,
          }}
        >
          {t('settings.autoResponder.preview.subjectPlaceholder')}
        </div>
        <div
          style={{
            ...theme.typography.body.small,
            color: theme.colors.text.tertiary,
            fontStyle: 'italic',
            marginTop: theme.spacing.xs,
          }}
        >
          {t('settings.autoResponder.preview.subjectNote')}
        </div>
      </div>

      {isEditing ? (
        <textarea
          id="template-editor"
          value={editedTemplate}
          readOnly={false}
          style={{
            width: '100%',
            minHeight: '400px',
            padding: theme.spacing.md,
            border: 'none',
            resize: 'vertical',
            fontFamily: 'monospace',
            ...theme.typography.body.medium,
            lineHeight: 1.6,
          }}
          placeholder={t('settings.autoResponder.templates.placeholder')}
        />
      ) : (
        <div
          style={{
            padding: theme.spacing.md,
            whiteSpace: 'pre-wrap',
            ...theme.typography.body.large,
            color: theme.colors.text.primary,
            lineHeight: 1.6,
          }}
        >
          {currentTemplate ? (
            renderFormattedText(previewText)
          ) : (
            <p style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
              {t('settings.autoResponder.templates.noTemplate')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplatePreview;
