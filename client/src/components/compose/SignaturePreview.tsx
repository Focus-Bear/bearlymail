import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { useEmailSignature } from 'hooks/useEmailSignature';

/**
 * Read-only, visually-distinct preview of the signature that is appended
 * automatically when the message is sent. Shown below the composer so users can
 * see the signature is already configured and don't add a duplicate by hand.
 */
export const SignaturePreview: React.FC = () => {
  const { t } = useTranslation();
  const signature = useEmailSignature();

  return (
    <div style={containerStyle} data-testid="signature-preview">
      <span style={labelStyle}>{t('compose.signature.autoAdded')}</span>
      <div style={textStyle}>{signature}</div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  marginTop: theme.spacing.md,
  paddingTop: theme.spacing.sm,
  borderTop: `1px dashed ${theme.colors.border.medium}`,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: theme.colors.text.tertiary,
};

const textStyle: React.CSSProperties = {
  whiteSpace: 'pre-line',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
  lineHeight: 1.5,
};
