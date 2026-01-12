import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ComposeBodyProps {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
}

export const ComposeBody: React.FC<ComposeBodyProps> = ({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 0',
          borderBottom: `1px solid ${theme.colors.border.light}`,
          marginBottom: '16px',
        }}
      >
        <label
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            minWidth: '50px',
          }}
        >
          {t('compose.subject')}
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder={t('compose.subjectPlaceholder')}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '6px 0',
            fontSize: theme.typography.fontSize.base,
            fontFamily: theme.typography.fontFamily,
            backgroundColor: 'transparent',
          }}
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={t('compose.bodyPlaceholder')}
        style={{
          width: '100%',
          minHeight: '300px',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          fontSize: theme.typography.fontSize.base,
          fontFamily: theme.typography.fontFamily,
          lineHeight: theme.typography.lineHeight.relaxed,
          padding: '8px 0',
          backgroundColor: 'transparent',
        }}
      />
    </>
  );
};





