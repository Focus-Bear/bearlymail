import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_WIDTH_600_PX, OPACITY_90_PERCENT } from 'constants/numbers';
import { STRING_AUTO, STRING_HIDDEN, STRING_WHITE } from 'constants/strings';

export interface BookingErrorStateProps {
  /** Signed-in host viewing their own `/book/:userId` — show API detail instead of guest copy */
  showHostDiagnostic?: boolean;
  /** Error text from the server (only used when showHostDiagnostic) */
  hostDiagnosticText?: string;
}

export const BookingErrorState: React.FC<BookingErrorStateProps> = ({
  showHostDiagnostic = false,
  hostDiagnosticText,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          maxWidth: `${MAX_WIDTH_600_PX}px`,
          margin: STRING_AUTO,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          overflow: STRING_HIDDEN,
        }}
      >
        <div
          style={{
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.primary.main,
            color: STRING_WHITE,
          }}
        >
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>{t('booking.title')}</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: OPACITY_90_PERCENT }}>{t('booking.subtitle')}</p>
        </div>

        <div
          style={{
            padding: theme.spacing.xl,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              marginBottom: theme.spacing.lg,
            }}
          >
            📅
          </div>
          <h2
            style={{
              color: theme.colors.accent.error,
              marginBottom: theme.spacing.md,
            }}
          >
            {showHostDiagnostic ? t('booking.error.hostHeadline') : t('booking.error.headline')}
          </h2>
          {showHostDiagnostic ? (
            <>
              <p
                style={{
                  color: theme.colors.text?.secondary ?? theme.colors.primary.main,
                  lineHeight: 1.6,
                  marginBottom: theme.spacing.md,
                }}
              >
                {t('booking.error.hostHint')}
              </p>
              <pre
                style={{
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.primary,
                  backgroundColor: theme.colors.background.subtle,
                  padding: theme.spacing.md,
                  borderRadius: theme.borderRadius.md,
                  margin: 0,
                }}
              >
                {hostDiagnosticText?.trim() ? hostDiagnosticText : t('booking.error.ownerFallback')}
              </pre>
            </>
          ) : (
            <p
              style={{
                color: theme.colors.text?.secondary ?? theme.colors.primary.main,
                lineHeight: 1.6,
              }}
            >
              {t('booking.error.detail')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
