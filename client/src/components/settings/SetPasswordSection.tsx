import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  showPassword: boolean;
  onToggleShow?: () => void;
  hasError: boolean;
  disabled: boolean;
  hint?: string;
  showToggle?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  showPassword,
  onToggleShow,
  hasError,
  disabled,
  hint,
  showToggle = false,
}) => {
  const { t } = useTranslation();
  const borderColor = hasError ? theme.colors.error.main : theme.colors.border.medium;

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <label
        style={{
          display: 'block',
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            paddingRight: showToggle ? '40px' : theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${borderColor}`,
            fontSize: theme.typography.fontSize.base,
            boxSizing: 'border-box',
          }}
          disabled={disabled}
        />
        {showToggle && onToggleShow && (
          <button
            type="button"
            onClick={onToggleShow}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: STRING_NONE,
              border: STRING_NONE,
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {showPassword ? t('settings.hide') : t('settings.show')}
          </button>
        )}
      </div>
      {hint && (
        <p
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

const getSubmitButtonText = (isSaving: boolean, hasPassword: boolean, tFunc: (key: string) => string): string => {
  if (isSaving) {
    return tFunc('common.saving');
  }
  return hasPassword ? tFunc('settings.setPassword.updateButton') : tFunc('settings.setPassword.setButton');
};

interface PasswordFormProps {
  hasPassword: boolean;
  onSuccess: () => void;
}

const PasswordForm: React.FC<PasswordFormProps> = ({ hasPassword, onSuccess }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const validatePassword = useCallback((): string | null => {
    if (password.length < 8) {
      return t('settings.setPassword.passwordTooShort');
    }
    if (password !== confirmPassword) {
      return t('settings.setPassword.passwordsDoNotMatch');
    }
    return null;
  }, [password, confirmPassword, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await axios.put(`${API_URL}/auth/set-password`, { password, confirmPassword });
      setPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (err: unknown) {
      const errorMessage =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : t('settings.setPassword.error');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormDisabled = isSaving || !password || !confirmPassword;
  const passwordLabel = hasPassword
    ? t('settings.setPassword.newPasswordLabel')
    : t('settings.setPassword.passwordLabel');

  const buttonStyle = useMemo(
    () => ({
      backgroundColor: isFormDisabled ? theme.colors.greyscale[400] : theme.colors.primary.main,
      color: COLOR_NAMED_WHITE,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.md,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: isFormDisabled ? 'not-allowed' : 'pointer',
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.medium,
      transition: theme.transitions.default,
    }),
    [isFormDisabled]
  );

  return (
    <form onSubmit={handleSubmit}>
      <PasswordInput
        label={passwordLabel}
        value={password}
        onChange={setPassword}
        placeholder={t('settings.setPassword.passwordPlaceholder')}
        showPassword={showPassword}
        onToggleShow={() => setShowPassword(!showPassword)}
        hasError={!!error}
        disabled={isSaving}
        hint={t('settings.setPassword.passwordHint')}
        showToggle
      />
      <PasswordInput
        label={t('settings.setPassword.confirmPasswordLabel')}
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder={t('settings.setPassword.confirmPasswordPlaceholder')}
        showPassword={showPassword}
        hasError={!!error}
        disabled={isSaving}
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
      <button type="submit" disabled={isFormDisabled} style={buttonStyle}>
        {getSubmitButtonText(isSaving, hasPassword, t)}
      </button>
    </form>
  );
};

export const SetPasswordSection: React.FC = () => {
  const { t } = useTranslation();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const checkHasPassword = async () => {
      try {
        const response = await axios.get(`${API_URL}/auth/has-password`);
        setHasPassword(response.data.hasPassword);
      } catch (err) {
        console.error('Failed to check password status:', err);
        setHasPassword(null);
      }
    };
    checkHasPassword();
  }, []);

  const handleSuccess = useCallback(() => {
    setSuccess(true);
    setHasPassword(true);
  }, []);

  const description = hasPassword
    ? t('settings.setPassword.descriptionHasPassword')
    : t('settings.setPassword.description');

  if (hasPassword === null) {
    return null;
  }

  return (
    <div
      id="set-password"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <h2
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontSize: theme.typography.fontSize.xl,
        }}
      >
        {t('settings.setPassword.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {description}
      </p>
      {success && (
        <div
          style={{
            backgroundColor: theme.colors.success.light,
            color: theme.colors.success.main,
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.setPassword.success')}
        </div>
      )}
      <PasswordForm hasPassword={hasPassword} onSuccess={handleSuccess} />
    </div>
  );
};
