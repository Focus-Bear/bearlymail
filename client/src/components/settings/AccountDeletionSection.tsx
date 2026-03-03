import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { OPACITY_HALF, OPACITY_DISABLED_ALT } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const CONFIRMATION_TEXT = 'delete all my data';

export const AccountDeletionSection: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteClick = () => {
    captureEvent('account_deletion_initiated');
    setShowConfirmation(true);
    setConfirmationInput('');
    setError(null);
  };

  const handleCancel = () => {
    captureEvent('account_deletion_cancelled');
    setShowConfirmation(false);
    setConfirmationInput('');
    setError(null);
  };

  const handleConfirmDelete = async () => {
    if (confirmationInput !== CONFIRMATION_TEXT) {
      setError(t('settings.accountDeletion.confirmationMismatch'));
      return;
    }

    captureEvent('account_deletion_confirmed');
    setIsDeleting(true);
    setError(null);

    try {
      await axios.delete(`${API_URL}/users/me`, {
        // eslint-disable-next-line id-denylist
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
    <div
      id="account-deletion"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
        border: `1px solid ${theme.colors.error.light}`,
      }}
    >
      <h2
        style={{
          color: theme.colors.error.main,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.xl,
        }}
      >
        {t('settings.accountDeletion.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.accountDeletion.description')}
      </p>

      {!showConfirmation ? (
        <button
          onClick={handleDeleteClick}
          style={{
            backgroundColor: theme.colors.error.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.default,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = theme.colors.error.dark;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = theme.colors.error.main;
          }}
        >
          {t('settings.accountDeletion.deleteButton')}
        </button>
      ) : (
        <div
          style={{
            backgroundColor: theme.colors.error.light,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.lg,
          }}
        >
          <p
            style={{
              color: theme.colors.error.main,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {t('settings.accountDeletion.warningTitle')}
          </p>
          <p
            style={{
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.accountDeletion.warningDescription')}
          </p>
          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.accountDeletion.confirmationPrompt', { text: CONFIRMATION_TEXT })}
          </p>
          <input
            type="text"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            placeholder={CONFIRMATION_TEXT}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${error ? theme.colors.error.main : theme.colors.border.medium}`,
              fontSize: theme.typography.fontSize.base,
              marginBottom: theme.spacing.md,
              boxSizing: 'border-box',
            }}
            disabled={isDeleting}
          />
          {error && (
            <p
              style={{
                color: theme.colors.error.main,
                fontSize: theme.typography.fontSize.sm,
                marginBottom: theme.spacing.md,
              }}
            >
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button
              onClick={handleCancel}
              disabled={isDeleting}
              style={{
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
                opacity: isDeleting ? OPACITY_HALF : 1,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={!isConfirmationValid || isDeleting}
              style={{
                backgroundColor: isConfirmationValid ? theme.colors.error.main : theme.colors.greyscale[400],
                color: COLOR_NAMED_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                cursor: isConfirmationValid && !isDeleting ? 'pointer' : 'not-allowed',
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
                opacity: isDeleting ? OPACITY_DISABLED_ALT : 1,
              }}
            >
              {isDeleting
                ? t('settings.accountDeletion.deleting')
                : t('settings.accountDeletion.confirmDelete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
