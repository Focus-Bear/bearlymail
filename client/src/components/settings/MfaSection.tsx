import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

type MfaStep = 'status' | 'setup' | 'verify-setup' | 'verify-disable';

interface SetupData {
  secret: string;
  otpauthUrl: string;
}

const TOKEN_PLACEHOLDER = '000000';
const INPUT_WIDTH = '160px';
const STEP_STATUS: MfaStep = 'status';
const STEP_SETUP: MfaStep = 'setup';
const STEP_VERIFY_DISABLE: MfaStep = 'verify-disable';

function TokenInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  hasError: boolean;
}) {
  const { t } = useTranslation();
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={6}
      value={value}
      onChange={ev => onChange(ev.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder={TOKEN_PLACEHOLDER}
      disabled={disabled}
      aria-label={t('settings.mfa.tokenLabel')}
      style={{
        width: INPUT_WIDTH,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${hasError ? theme.colors.error.main : theme.colors.border.medium}`,
        fontSize: theme.typography.fontSize.xl,
        letterSpacing: '0.3em',
        textAlign: 'center',
      }}
    />
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const style = useMemo(
    () => ({
      backgroundColor: disabled ? theme.colors.greyscale[400] : theme.colors.primary.main,
      color: COLOR_NAMED_WHITE,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.md,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.medium,
    }),
    [disabled],
  );

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

function DangerButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const style = useMemo(
    () => ({
      backgroundColor: disabled ? theme.colors.greyscale[400] : theme.colors.error.main,
      color: COLOR_NAMED_WHITE,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.md,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: theme.typography.fontSize.base,
      fontWeight: theme.typography.fontWeight.medium,
    }),
    [disabled],
  );

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: COLOR_TRANSPARENT,
        color: theme.colors.text.secondary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
      }}
    >
      {children}
    </button>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        color: theme.colors.error.main,
        fontSize: theme.typography.fontSize.sm,
        marginTop: theme.spacing.sm,
      }}
    >
      {message}
    </p>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        backgroundColor: theme.colors.success.light,
        color: theme.colors.success.main,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      {message}
    </div>
  );
}

export const MfaSection: React.FC = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<MfaStep>('status');
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/auth/mfa/status`);
      setMfaEnabled(data.enabled);
    } catch {
      setMfaEnabled(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const resetState = useCallback(() => {
    setToken('');
    setError(null);
    setSuccessMsg(null);
    setSetupData(null);
  }, []);

  const handleStartSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data } = await axios.post(`${API_URL}/auth/mfa/setup`);
      setSetupData({ secret: data.secret, otpauthUrl: data.otpauthUrl });
      setStep('setup');
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : t('settings.mfa.setupError');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleVerifySetup = useCallback(async () => {
    if (token.length !== 6) {
      setError(t('settings.mfa.tokenLengthError'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/auth/mfa/enable`, { token });
      setMfaEnabled(true);
      setSuccessMsg(t('settings.mfa.enabledSuccess'));
      setStep('status');
      resetState();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : t('settings.mfa.verifyError');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, t, resetState]);

  const handleDisable = useCallback(async () => {
    if (token.length !== 6) {
      setError(t('settings.mfa.tokenLengthError'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`${API_URL}/auth/mfa`, { data: { token } });
      setMfaEnabled(false);
      setSuccessMsg(t('settings.mfa.disabledSuccess'));
      setStep('status');
      resetState();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : t('settings.mfa.verifyError');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, t, resetState]);

  const handleCancel = useCallback(() => {
    setStep('status');
    resetState();
  }, [resetState]);

  if (mfaEnabled === null) {
    return null;
  }

  return (
    <div
      id="mfa"
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
        {t('settings.mfa.title')}
      </h2>

      {successMsg && <SuccessBanner message={successMsg} />}

      {/* ── STATUS VIEW ─────────────────────────────────────────────────── */}
      {step === STEP_STATUS && (
        <>
          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {mfaEnabled
              ? t('settings.mfa.descriptionEnabled')
              : t('settings.mfa.descriptionDisabled')}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
            <span
              style={{
                display: 'inline-block',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
                backgroundColor: mfaEnabled
                  ? theme.colors.success.light
                  : theme.colors.warning.light,
                color: mfaEnabled
                  ? theme.colors.success.main
                  : theme.colors.warning.main,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {mfaEnabled ? t('settings.mfa.statusEnabled') : t('settings.mfa.statusDisabled')}
            </span>

            {!mfaEnabled && (
              <PrimaryButton onClick={handleStartSetup} disabled={loading}>
                {loading ? t('common.loading') : t('settings.mfa.setupButton')}
              </PrimaryButton>
            )}

            {mfaEnabled && (
              <DangerButton
                onClick={() => {
                  resetState();
                  setStep('verify-disable');
                }}
              >
                {t('settings.mfa.disableButton')}
              </DangerButton>
            )}
          </div>

          {error && <ErrorMessage message={error} />}
        </>
      )}

      {/* ── SETUP VIEW — show QR code ────────────────────────────────────── */}
      {step === STEP_SETUP && setupData && (
        <div>
          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.mfa.setupInstructions')}
          </p>

          <div
            style={{
              background: theme.colors.background.default,
              borderRadius: theme.borderRadius.md,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.md,
            }}
          >
            <p
              style={{
                color: theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.xs,
                marginBottom: theme.spacing.xs,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('settings.mfa.secretKeyLabel')}
            </p>
            <code
              style={{
                fontFamily: 'monospace',
                fontSize: theme.typography.fontSize.base,
                letterSpacing: '0.15em',
                wordBreak: 'break-all',
                color: theme.colors.text.primary,
              }}
            >
              {setupData.secret}
            </code>
          </div>

          <p
            style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('settings.mfa.openAppInstructions')}{' '}
            <a
              href={setupData.otpauthUrl}
              style={{ color: theme.colors.primary.main }}
            >
              {t('settings.mfa.openInApp')}
            </a>
          </p>

          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.mfa.enterCodePrompt')}
          </p>

          <TokenInput
            value={token}
            onChange={setToken}
            disabled={loading}
            hasError={!!error}
          />

          {error && <ErrorMessage message={error} />}

          <div
            style={{
              display: 'flex',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.md,
            }}
          >
            <PrimaryButton
              onClick={handleVerifySetup}
              disabled={loading || token.length !== 6}
            >
              {loading ? t('common.saving') : t('settings.mfa.confirmButton')}
            </PrimaryButton>
            <SecondaryButton onClick={handleCancel}>{t('common.cancel')}</SecondaryButton>
          </div>
        </div>
      )}

      {/* ── VERIFY-DISABLE VIEW ─────────────────────────────────────────── */}
      {step === STEP_VERIFY_DISABLE && (
        <div>
          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.sm,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.mfa.disableConfirmPrompt')}
          </p>

          <TokenInput
            value={token}
            onChange={setToken}
            disabled={loading}
            hasError={!!error}
          />

          {error && <ErrorMessage message={error} />}

          <div
            style={{
              display: 'flex',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.md,
            }}
          >
            <DangerButton
              onClick={handleDisable}
              disabled={loading || token.length !== 6}
            >
              {loading ? t('common.saving') : t('settings.mfa.disableConfirmButton')}
            </DangerButton>
            <SecondaryButton onClick={handleCancel}>{t('common.cancel')}</SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
};
