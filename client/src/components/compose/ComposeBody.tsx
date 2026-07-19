import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ComposeBodyProps {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
}

export const ComposeBody: React.FC<ComposeBodyProps> = ({ subject, body, onSubjectChange, onBodyChange }) => {
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
          onChange={event => onSubjectChange(event.target.value)}
          placeholder={t('compose.subjectPlaceholder')}
          style={{
            flex: 1,
            border: STRING_NONE,
            outline: 'none',
            padding: '6px 0',
            fontSize: theme.typography.fontSize.base,
            fontFamily: theme.typography.fontFamily,
            backgroundColor: COLOR_TRANSPARENT,
          }}
        />
      </div>
      <RichTextEditor
        content={body}
        onChange={onBodyChange}
        placeholder={t('compose.bodyPlaceholder')}
        minHeight="300px"
      />
    </>
  );
};
