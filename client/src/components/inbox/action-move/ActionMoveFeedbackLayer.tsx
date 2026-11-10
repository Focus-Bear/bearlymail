import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { Z_INDEX_POPUP } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { ActionMoveFeedback } from 'hooks/useActionMoveFeedback';

interface ActionMoveFeedbackLayerProps {
  feedback: Pick<ActionMoveFeedback, 'announcement' | 'isToastVisible' | 'dismissToast' | 'viewActionTab'>;
}

/**
 * The screen-reader announcement for every move to Action, plus the one-off toast that
 * explains what the Action tab is. The toast never takes focus: users triaging from the
 * keyboard keep their place in the list.
 */
export const ActionMoveFeedbackLayer: React.FC<ActionMoveFeedbackLayerProps> = ({ feedback }) => {
  const { t } = useTranslation();

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" style={visuallyHiddenStyle}>
        {feedback.announcement}
      </div>
      {feedback.isToastVisible && (
        <div className="action-move-toast" style={toastStyle} data-testid="action-move-toast">
          <span>{t('inbox.actionMove.toast')}</span>
          <button type="button" onClick={feedback.viewActionTab} style={viewButtonStyle}>
            {t('inbox.actionMove.view')}
          </button>
          <button
            type="button"
            onClick={feedback.dismissToast}
            style={dismissButtonStyle}
            aria-label={t('inbox.actionMove.dismiss')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </>
  );
};

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: theme.spacing.xl,
  transform: 'translateX(-50%)',
  zIndex: Z_INDEX_POPUP,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.md,
  maxWidth: `calc(100vw - 2 * ${theme.spacing.md})`,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.full,
  backgroundColor: theme.colors.brand.richBlack,
  color: theme.colors.text.inverse,
  boxShadow: theme.shadows.xl,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
};

const viewButtonStyle: React.CSSProperties = {
  border: STRING_NONE,
  borderRadius: theme.borderRadius.full,
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.text.inverse,
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.base,
  cursor: 'pointer',
};

const dismissButtonStyle: React.CSSProperties = {
  border: STRING_NONE,
  background: STRING_NONE,
  color: theme.colors.text.inverse,
  fontSize: theme.typography.fontSize.lg,
  lineHeight: 1,
  cursor: 'pointer',
  padding: theme.spacing.xs,
};
