import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

interface WelcomeStepProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

const VARIANT_DONE = 'done';
const VARIANT_GREEN = 'green';
const VARIANT_BLUE = 'blue';
type PropVariant = typeof VARIANT_DONE | typeof VARIANT_GREEN | typeof VARIANT_BLUE;

const FONT_WEIGHT_REGULAR = 400;
const FONT_WEIGHT_SEMIBOLD = 600;
const FONT_WEIGHT_BOLD = 700;

function pickIconColor(variant: PropVariant): string {
  if (variant === VARIANT_DONE) {
    return '#fff';
  }
  if (variant === VARIANT_GREEN) {
    return TOK.green;
  }
  if (variant === VARIANT_BLUE) {
    return TOK.blue;
  }
  return TOK.sunDark;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onComplete, refreshUser }) => {
  const { t } = useTranslation();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Tailor the "your inbox is connected" copy to the actual provider — a local
  // Mac install runs on Apple Mail, not Gmail/Outlook.
  const [isAppleMail, setIsAppleMail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_URL}/apple-mail-accounts`)
      .then((res) => {
        if (!cancelled) {
          setIsAppleMail(Array.isArray(res.data) && res.data.length > 0);
        }
      })
      .catch(() => {
        // Not an Apple Mail user (or endpoint unavailable) — keep default copy.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canContinue = consentAccepted && !isLoading;

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/users/accept-consent`, { termsAccepted: true, privacyAccepted: true });
      await refreshUser();
      onComplete();
    } catch (error) {
      console.error('Failed to save consent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="onboarding-pane" style={paneStyle}>
      <h1 className="onboarding-h1" style={h1Style}>
        {t('setupWizard.welcome.title')}{' '}
        <em style={h1EmStyle}>{t('setupWizard.welcome.titleEmphasis')}</em>
      </h1>
      <p className="onboarding-lede" style={ledeStyle}>
        {t('setupWizard.welcome.lede')}
      </p>

      <div style={propsGridStyle}>
        <PropCard
          variant={VARIANT_DONE}
          icon={<CheckIconLarge />}
          title={t('setupWizard.welcome.prop1Title')}
          body={t(
            isAppleMail
              ? 'setupWizard.welcome.prop1BodyAppleMail'
              : 'setupWizard.welcome.prop1Body',
          )}
          doneLabel={t('setupWizard.welcome.doneTag')}
        />
        <PropCard
          variant={VARIANT_GREEN}
          icon={<ClockIcon />}
          title={t('setupWizard.welcome.prop2Title')}
          body={t('setupWizard.welcome.prop2Body')}
        />
        <PropCard
          variant={VARIANT_BLUE}
          icon={<StarIcon />}
          title={t('setupWizard.welcome.prop3Title')}
          body={t('setupWizard.welcome.prop3Body')}
        />
      </div>

      <div style={actionsRowStyle}>
        <label style={termsLabelStyle}>
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={event => setConsentAccepted(event.target.checked)}
            style={termsCheckboxStyle}
          />
          <span>
            {t('setupWizard.welcome.iAcceptThe')}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={termsLinkStyle}>
              {t('setupWizard.welcome.termsOfUse')}
            </a>{' '}
            {t('setupWizard.welcome.and')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={termsLinkStyle}>
              {t('setupWizard.welcome.privacyPolicy')}
            </a>
          </span>
        </label>
        <button onClick={handleContinue} disabled={!canContinue} style={primaryButtonStyle(canContinue)}>
          {isLoading ? t('common.loading') : t('setupWizard.welcome.getStarted')}
          {!isLoading && <ArrowRight />}
        </button>
      </div>
    </section>
  );
};

interface PropCardProps {
  variant: PropVariant;
  icon: React.ReactNode;
  title: string;
  body: string;
  doneLabel?: string;
}

const PropCard: React.FC<PropCardProps> = ({ variant, icon, title, body, doneLabel }) => {
  const isDone = variant === VARIANT_DONE;
  const iconColor = pickIconColor(variant);
  return (
    <div className="onboarding-prop" style={propStyle()}>
      <div style={propIconWrap(isDone, iconColor)}>{icon}</div>
      <div>
        <h3 style={propTitleStyle}>{title}</h3>
        <p style={propBodyStyle}>{body}</p>
      </div>
      {doneLabel && (
        <span className="done-tag" style={doneTagStyle}>
          <CheckIconSmall /> {doneLabel}
        </span>
      )}
    </div>
  );
};

const CheckIconLarge: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
  >
    <path d="M5 12l4 4L19 7" />
  </svg>
);

const CheckIconSmall: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="12" height="12">
    <path d="M5 12l4 4L19 7" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const StarIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
  >
    <path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6L12 14.8 7.1 17.4 8 11.8 4 7.8 9.6 7z" />
  </svg>
);

const ArrowRight: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="16" height="16">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const paneStyle: React.CSSProperties = { display: 'block' };

const h1Style: React.CSSProperties = {
  fontSize: '32px',
  lineHeight: 1.1,
  letterSpacing: '-0.025em',
  fontWeight: FONT_WEIGHT_BOLD,
  margin: '0 0 12px',
  textWrap: 'balance' as React.CSSProperties['textWrap'],
};

const h1EmStyle: React.CSSProperties = {
  fontStyle: 'normal',
  fontFamily: TOK.fontSerif,
  fontWeight: FONT_WEIGHT_REGULAR,
  color: TOK.sunDark,
  fontSize: '1.08em',
};

const ledeStyle: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: 1.55,
  color: TOK.ink2,
  margin: '0 0 28px',
};

const propsGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: '1fr',
  marginBottom: '28px',
};

const propStyle = (): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '40px 1fr auto',
  gap: '14px',
  padding: '14px 16px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '12px',
  alignItems: 'center',
});

const propIconWrap = (isDone: boolean, iconColor: string): React.CSSProperties => ({
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  background: isDone ? TOK.green : '#fff',
  border: `1px solid ${isDone ? TOK.green : TOK.line2}`,
  display: 'grid',
  placeItems: 'center',
  color: iconColor,
});

const propTitleStyle: React.CSSProperties = {
  margin: '2px 0 4px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  letterSpacing: '-0.005em',
  color: TOK.ink,
};

const propBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13.5px',
  color: TOK.ink3,
  lineHeight: 1.5,
};

const doneTagStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '999px',
  background: TOK.greenPale,
  color: TOK.green,
  fontSize: '11.5px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
};

const actionsRowStyle: React.CSSProperties = {
  marginTop: '28px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const termsLabelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '13px',
  color: TOK.ink2,
  cursor: 'pointer',
};

const termsCheckboxStyle: React.CSSProperties = {
  width: '16px',
  height: '16px',
  accentColor: TOK.sun,
  cursor: 'pointer',
  flexShrink: 0,
};

const termsLinkStyle: React.CSSProperties = {
  color: TOK.ink,
  textDecoration: 'underline',
  textDecorationColor: TOK.line,
  textUnderlineOffset: '2px',
};

const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '48px',
  padding: '0 22px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  border: `1.5px solid ${enabled ? TOK.sun : TOK.sunPale2}`,
  background: enabled ? TOK.sun : TOK.sunPale2,
  color: '#fff',
  cursor: enabled ? 'pointer' : 'not-allowed',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.12)',
  transition: 'background .12s, border-color .12s, color .12s',
});
