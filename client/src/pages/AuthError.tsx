import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavigateFunction, useNavigate, useSearchParams } from 'react-router-dom';
import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { WaitlistForm } from 'components/landing/WaitlistForm';
import {
  ERROR_TYPE_AUTH_ERROR,
  ERROR_TYPE_NOT_ON_WAITLIST,
  ERROR_TYPE_PENDING_APPROVAL,
  STRING_MESSAGE,
  STRING_NONE,
  STRING_TRANSPARENT,
  STRING_TYPE,
  STRING_WAITLIST,
  STRING_WHITE,
} from 'constants/strings';

type ErrorType = typeof ERROR_TYPE_PENDING_APPROVAL | typeof ERROR_TYPE_NOT_ON_WAITLIST | typeof ERROR_TYPE_AUTH_ERROR;

interface ErrorContent {
  title: string;
  description: string;
  showWaitlistButton: boolean;
  showLoginButton: boolean;
}

function getErrorContent(
  errorType: ErrorType,
  errorMessage: string,
  waitlistSubmitted: boolean,
  tFunc: TFunction
): ErrorContent {
  if (waitlistSubmitted) {
    return {
      title: tFunc('auth.errors.waitlistSubmitted.title', "You're on the waitlist!"),
      description: tFunc(
        'auth.errors.waitlistSubmitted.description',
        "We've received your request. You'll receive an email when your account is approved."
      ),
      showWaitlistButton: false,
      showLoginButton: true,
    };
  }

  switch (errorType) {
    case ERROR_TYPE_PENDING_APPROVAL:
      return {
        title: tFunc('auth.errors.pendingApproval.title', 'Account Pending Approval'),
        description: tFunc(
          'auth.errors.pendingApproval.description',
          "Your account is on the waitlist and pending approval. We'll notify you by email once your account is approved."
        ),
        showWaitlistButton: false,
        showLoginButton: true,
      };
    case ERROR_TYPE_NOT_ON_WAITLIST:
      return {
        title: tFunc('auth.errors.notOnWaitlist.title', 'Join the Waitlist'),
        description: tFunc(
          'auth.errors.notOnWaitlist.description',
          'You need to join our waitlist first before you can sign in. Sign up below to get early access to BearlyMail.'
        ),
        showWaitlistButton: true,
        showLoginButton: false,
      };
    default:
      if (errorMessage.includes(STRING_WAITLIST)) {
        return {
          title: tFunc('auth.errors.notOnWaitlist.title', 'Join the Waitlist'),
          description: tFunc(
            'auth.errors.notOnWaitlist.description',
            'You need to join our waitlist first before you can sign in. Sign up below to get early access to BearlyMail.'
          ),
          showWaitlistButton: true,
          showLoginButton: false,
        };
      }
      return {
        title: tFunc('auth.errors.generic.title', 'Authentication Error'),
        description: errorMessage,
        showWaitlistButton: true,
        showLoginButton: true,
      };
  }
}

interface AuthErrorContentProps {
  showWaitlistForm: boolean;
  setShowWaitlistForm: (show: boolean) => void;
  waitlistSubmitted: boolean;
  content: ErrorContent;
  navigate: NavigateFunction;
  handleWaitlistSuccess: () => void;
  t: TFunction;
}

const AuthErrorContent: React.FC<AuthErrorContentProps> = ({
  showWaitlistForm,
  setShowWaitlistForm,
  waitlistSubmitted,
  content,
  navigate,
  handleWaitlistSuccess,
  t,
}) => {
  if (showWaitlistForm) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background.default,
          padding: theme.spacing.xl,
        }}
      >
        <div style={{ maxWidth: '500px', width: '100%' }}>
          <button
            onClick={() => setShowWaitlistForm(false)}
            style={{
              marginBottom: theme.spacing.md,
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: STRING_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: STRING_NONE,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
            }}
          >
            &larr; {t('common.back', 'Back')}
          </button>
          <WaitlistForm onSuccess={handleWaitlistSuccess} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: waitlistSubmitted ? `${theme.colors.accent.success}20` : `${theme.colors.primary.main}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            marginBottom: theme.spacing.lg,
          }}
        >
          {waitlistSubmitted ? (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill={STRING_NONE}
              stroke={theme.colors.accent.success}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill={STRING_NONE}
              stroke={theme.colors.primary.main}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
          }}
        >
          {content.title}
        </h1>

        <p
          style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            lineHeight: 1.6,
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {content.description}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {content.showWaitlistButton && (
            <button
              onClick={() => setShowWaitlistForm(true)}
              style={{
                width: '100%',
                padding: theme.spacing.md,
                backgroundColor: theme.colors.primary.main,
                color: STRING_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.semibold,
                cursor: 'pointer',
              }}
            >
              {t('auth.joinWaitlist', 'Join the Waitlist')}
            </button>
          )}

          {content.showLoginButton && (
            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                padding: theme.spacing.md,
                backgroundColor: content.showWaitlistButton ? STRING_TRANSPARENT : theme.colors.primary.main,
                color: content.showWaitlistButton ? theme.colors.text.secondary : STRING_WHITE,
                border: content.showWaitlistButton ? `1px solid ${theme.colors.border.medium}` : STRING_NONE,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
                cursor: 'pointer',
              }}
            >
              {t('auth.backToLogin', 'Back to Login')}
            </button>
          )}

          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: STRING_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: STRING_NONE,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            {t('auth.goToHomepage', 'Go to Homepage')}
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthError: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const errorType = (searchParams.get(STRING_TYPE) as ErrorType) || ERROR_TYPE_AUTH_ERROR;
  const errorMessage = searchParams.get(STRING_MESSAGE) || t('auth.authenticationFailed');
  const content = getErrorContent(errorType, errorMessage, waitlistSubmitted, t);

  const handleWaitlistSuccess = () => {
    setWaitlistSubmitted(true);
    setShowWaitlistForm(false);
  };

  return (
    <AuthErrorContent
      showWaitlistForm={showWaitlistForm}
      setShowWaitlistForm={setShowWaitlistForm}
      waitlistSubmitted={waitlistSubmitted}
      content={content}
      navigate={navigate}
      handleWaitlistSuccess={handleWaitlistSuccess}
      t={t}
    />
  );
};

export default AuthError;
