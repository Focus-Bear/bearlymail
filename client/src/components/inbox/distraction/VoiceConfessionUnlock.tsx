import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { verifyDistractionPhrase } from 'api/verifyDistractionPhrase';
import { theme } from 'theme/theme';

import {
  DISTRACTION_CONFESSION_PHRASE,
  VERIFY_STATUS,
  type VerifyStatus,
} from 'constants/distractionFriction';
import { useSpeechRecognition } from 'hooks/useSpeechRecognition';

interface VoiceConfessionUnlockProps {
  /** Called once the spoken transcript is verified by the backend. */
  onUnlocked: () => void;
  /** Called when speech is unsupported/errors, so the parent can nudge the tap option. */
  onNeedsFallback?: () => void;
}

/**
 * The "voice confession" unlock: the user records themselves saying the
 * confession phrase, which is transcribed client-side (Web Speech API) and
 * semantically verified by the backend. Falls back gracefully when speech
 * recognition is unavailable.
 */
export const VoiceConfessionUnlock: React.FC<VoiceConfessionUnlockProps> = ({ onUnlocked, onNeedsFallback }) => {
  const { t } = useTranslation();
  const { isSupported, isListening, transcript, error, start, stop, reset } = useSpeechRecognition();
  const [status, setStatus] = useState<VerifyStatus>(VERIFY_STATUS.IDLE);

  const handleVerify = async () => {
    if (!transcript.trim()) {
      return;
    }
    stop();
    setStatus(VERIFY_STATUS.VERIFYING);
    try {
      const verified = await verifyDistractionPhrase(transcript);
      if (verified) {
        onUnlocked();
        return;
      }
      setStatus(VERIFY_STATUS.REJECTED);
    } catch {
      setStatus(VERIFY_STATUS.ERROR);
    }
  };

  const handleRetry = () => {
    reset();
    setStatus(VERIFY_STATUS.IDLE);
    start();
  };

  if (!isSupported) {
    return (
      <div style={{ textAlign: 'center' }} data-testid="distraction-voice-unsupported">
        <div style={{ fontSize: '2rem', marginBottom: theme.spacing.xs }} aria-hidden="true">
          🙉
        </div>
        <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('inbox.distractionTax.voice.unsupported')}
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, marginBottom: theme.spacing.sm, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {t('inbox.distractionTax.voice.instructions')}
      </p>
      <blockquote
        style={{
          margin: `0 0 ${theme.spacing.md} 0`,
          padding: theme.spacing.sm,
          background: theme.colors.background.default,
          borderRadius: theme.borderRadius.md,
          borderLeft: `3px solid ${theme.colors.primary.main}`,
          fontStyle: 'italic',
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.sm,
          textAlign: 'left',
        }}
      >
        “{DISTRACTION_CONFESSION_PHRASE}”
      </blockquote>

      {transcript && (
        <p
          data-testid="distraction-voice-transcript"
          style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}
        >
          {t('inbox.distractionTax.voice.heard', { transcript })}
        </p>
      )}

      {status === VERIFY_STATUS.REJECTED && (
        <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.warning.main, fontSize: theme.typography.fontSize.sm }}>
          {t('inbox.distractionTax.voice.rejected')}
        </p>
      )}
      {status === VERIFY_STATUS.ERROR && (
        <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.error.main, fontSize: theme.typography.fontSize.sm }}>
          {t('inbox.distractionTax.voice.error')}
        </p>
      )}
      {error && !isListening && !transcript && (
        <p style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
          {t('inbox.distractionTax.voice.micError')}{' '}
          <button
            type="button"
            onClick={onNeedsFallback}
            style={{ background: 'none', border: 'none', padding: 0, color: theme.colors.primary.main, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            {t('inbox.distractionTax.voice.useTapInstead')}
          </button>
        </p>
      )}

      <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'center' }}>
        {!isListening && status !== VERIFY_STATUS.VERIFYING && !transcript && (
          <button
            type="button"
            onClick={start}
            data-testid="distraction-voice-record"
            style={primaryButtonStyle}
          >
            {t('inbox.distractionTax.voice.record')}
          </button>
        )}
        {isListening && (
          <button type="button" onClick={stop} data-testid="distraction-voice-stop" style={primaryButtonStyle}>
            {t('inbox.distractionTax.voice.stop')}
          </button>
        )}
        {!isListening && transcript && status !== VERIFY_STATUS.VERIFYING && (
          <>
            <button type="button" onClick={handleRetry} style={secondaryButtonStyle}>
              {t('inbox.distractionTax.voice.retry')}
            </button>
            <button
              type="button"
              onClick={handleVerify}
              data-testid="distraction-voice-verify"
              style={primaryButtonStyle}
            >
              {t('inbox.distractionTax.voice.verify')}
            </button>
          </>
        )}
        {status === VERIFY_STATUS.VERIFYING && (
          <button type="button" disabled style={{ ...primaryButtonStyle, opacity: 0.6, cursor: 'wait' }}>
            {t('inbox.distractionTax.voice.verifying')}
          </button>
        )}
      </div>
    </div>
  );
};

const primaryButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  borderRadius: theme.borderRadius.md,
  border: 'none',
  background: theme.colors.primary.main,
  color: theme.colors.text.inverse,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  borderRadius: theme.borderRadius.md,
  border: `1px solid ${theme.colors.border.default}`,
  background: theme.colors.background.paper,
  color: theme.colors.text.secondary,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
};
