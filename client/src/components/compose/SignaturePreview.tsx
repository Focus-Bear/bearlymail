import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEdit2 } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { useEmailSignature } from 'hooks/useEmailSignature';

/**
 * Visually-distinct preview of the signature that is appended automatically when
 * the message is sent — shown below the composer so users can see it's already
 * configured and don't add a duplicate by hand. An inline "Edit" turns it into a
 * textarea so the signature can be changed without leaving the draft (#192); the
 * change is saved to the profile and applies to every email sent afterwards.
 */
export const SignaturePreview: React.FC = () => {
  const { t } = useTranslation();
  const { signature, saveSignature } = useEmailSignature();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(signature);
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSignature(draft);
      setIsEditing(false);
    } catch {
      setError(t('compose.signature.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={containerStyle} data-testid="signature-preview">
      <div style={headerRowStyle}>
        <span style={labelStyle}>{t('compose.signature.autoAdded')}</span>
        {!isEditing && (
          <button type="button" onClick={startEditing} style={editButtonStyle} aria-label={t('compose.signature.edit')}>
            <FiEdit2 size={12} />
            {t('compose.signature.edit')}
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={editColumnStyle}>
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            style={textareaStyle}
            aria-label={t('compose.signature.autoAdded')}
            rows={3}
            autoFocus
          />
          <span style={hintStyle}>{t('compose.signature.applyHint')}</span>
          {error && <span style={errorStyle}>{error}</span>}
          <div style={actionsRowStyle}>
            <button type="button" onClick={cancelEditing} disabled={saving} style={cancelButtonStyle}>
              {t('compose.signature.cancel')}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={saveButtonStyle}>
              {saving ? t('compose.signature.saving') : t('compose.signature.save')}
            </button>
          </div>
        </div>
      ) : (
        <div style={textStyle}>{signature}</div>
      )}
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  marginTop: theme.spacing.md,
  paddingTop: theme.spacing.sm,
  borderTop: `1px dashed ${theme.colors.border.medium}`,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
};

const labelStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: theme.colors.text.tertiary,
};

const editButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  padding: `2px ${theme.spacing.xs}`,
  backgroundColor: COLOR_TRANSPARENT,
  border: STRING_NONE,
  color: theme.colors.primary.main,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
  flexShrink: 0,
};

const textStyle: React.CSSProperties = {
  whiteSpace: 'pre-line',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
  lineHeight: 1.5,
};

const editColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  fontSize: theme.typography.fontSize.sm,
  fontFamily: 'inherit',
  color: theme.colors.text.primary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  resize: 'vertical',
};

const hintStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
};

const errorStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.error.main,
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.spacing.sm,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  cursor: 'pointer',
};

const saveButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
};
