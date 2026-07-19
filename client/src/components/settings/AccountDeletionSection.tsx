import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_DISABLED_ALT, OPACITY_HALF } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const CONFIRMATION_TEXT = 'delete all my data';

// Static style constants — outside component to avoid recreation on each render
const sectionContainerStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.lg,
  boxShadow: theme.shadows.md,
  border: `1px solid ${theme.colors.error.light}`,
};

const titleStyle: React.CSSProperties = {
  color: theme.colors.error.main,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.xl,
};

const descriptionStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.sm,
};

const deleteButtonBaseStyle: React.CSSProperties = {
  backgroundColor: theme.colors.error.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.medium,
  transition: theme.transitions.default,
};

const confirmationBoxStyle: React.CSSProperties = {
  backgroundColor: theme.colors.error.light,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.lg,
};

const warningTitleStyle: React.CSSProperties = {
  color: theme.colors.error.main,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
};

const warningDescStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.sm,
};

const confirmationPromptStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.sm,
  fontSize: theme.typography.fontSize.sm,
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.spacing.md,
};

const errorTextStyle: React.CSSProperties = {
  color: theme.colors.error.main,
  fontSize: theme.typography.fontSize.sm,
  marginBottom: theme.spacing.md,
};

// Dynamic style helpers — accept state values
function getInputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${hasError ? theme.colors.error.main : theme.colors.border.medium}`,
    fontSize: theme.typography.fontSize.base,
    marginBottom: theme.spacing.md,
    boxSizing: 'border-box',
  };
}

function getCancelButtonStyle(isDeleting: boolean): React.CSSProperties {
  return {
    backgroundColor: theme.colors.background.paper,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    cursor: isDeleting ? 'not-allowed' : 'pointer',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    opacity: isDeleting ? OPACITY_HALF : 1,
  };
}

function getConfirmDeleteButtonStyle(isConfirmationValid: boolean, isDeleting: boolean): React.CSSProperties {
  return {
    backgroundColor: isConfirmationValid ? theme.colors.error.main : theme.colors.greyscale[400],
    color: COLOR_NAMED_WHITE,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.md,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    cursor: isConfirmationValid && !isDeleting ? 'pointer' : 'not-allowed',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    opacity: isDeleting ? OPACITY_DISABLED_ALT : 1,
  };
}

export const AccountDeletionSection: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteClick = () => {
    captureEvent(ANALYTICS_EVENTS.ACCOUNT_DELETION_INITIATED);
    setShowConfirmation(true);
    setConfirmationInput('');
    setError(null);
  };

  const handleCancel = () => {
    captureEvent(ANALYTICS_EVENTS.ACCOUNT_DELETION_CANCELLED);
    setShowConfirmation(false);
    setConfirmationInput('');
    setError(null);
  };

  const handleConfirmDelete = async () => {
    if (confirmationInput !== CONFIRMATION_TEXT) {
      setError(t('settings.accountDeletion.confirmationMismatch'));
      return;
    }

    captureEvent(ANALYTICS_EVENTS.ACCOUNT_DELETION_CONFIRMED);
    setIsDeleting(true);
    setError(null);

    try {
      await axios.delete(`${API_URL}/users/me`, {
        // eslint-disable-next-line id-denylist -- axios config requires the `data` property key for request body
        data: { confirmationText: confirmationInput },
      });
      logout();
    } catch (err) {
      setError(t('settings.accountDeletion.deletionError'));
      setIsDeleting(false);
    }
  };

  const isConfirmationValid = confirmationInput === CONFIRMATION_TEXT;

  return (
    <div id="account-deletion" style={sectionContainerStyle}>
      <h2 style={titleStyle}>{t('settings.accountDeletion.title')}</h2>
      <p style={descriptionStyle}>{t('settings.accountDeletion.description')}</p>

      {!showConfirmation ? (
        <button
          onClick={handleDeleteClick}
          style={deleteButtonBaseStyle}
          onMouseOver={event => {
            event.currentTarget.style.backgroundColor = theme.colors.error.dark;
          }}
          onMouseOut={event => {
            event.currentTarget.style.backgroundColor = theme.colors.error.main;
          }}
        >
          {t('settings.accountDeletion.deleteButton')}
        </button>
      ) : (
        <div style={confirmationBoxStyle}>
          <p style={warningTitleStyle}>{t('settings.accountDeletion.warningTitle')}</p>
          <p style={warningDescStyle}>{t('settings.accountDeletion.warningDescription')}</p>
          <p style={confirmationPromptStyle}>
            {t('settings.accountDeletion.confirmationPrompt', { text: CONFIRMATION_TEXT })}
          </p>
          <input
            type="text"
            value={confirmationInput}
            onChange={event => setConfirmationInput(event.target.value)}
            placeholder={CONFIRMATION_TEXT}
            style={getInputStyle(Boolean(error))}
            disabled={isDeleting}
          />
          {error && <p style={errorTextStyle}>{error}</p>}
          <div style={actionsRowStyle}>
            <button onClick={handleCancel} disabled={isDeleting} style={getCancelButtonStyle(isDeleting)}>
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={!isConfirmationValid || isDeleting}
              style={getConfirmDeleteButtonStyle(isConfirmationValid, isDeleting)}
            >
              {isDeleting ? t('settings.accountDeletion.deleting') : t('settings.accountDeletion.confirmDelete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
