import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvite } from 'queries/useAcceptInvite';
import { useValidateInvite } from 'queries/useValidateInvite';
import { theme } from 'theme/theme';

import { useAuth } from 'contexts/AuthContext';

const BUTTON_PENDING_OPACITY = 0.7;

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.colors.background.default,
  padding: '24px',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: '12px',
  padding: '40px',
  maxWidth: '480px',
  width: '100%',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: theme.colors.text.primary,
  marginBottom: '16px',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '16px',
  color: theme.colors.text.secondary,
  marginBottom: '32px',
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: '8px',
  padding: '12px 32px',
  fontSize: '16px',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};

const errorStyle: React.CSSProperties = {
  color: theme.colors.error.main,
  marginTop: '16px',
  fontSize: '14px',
};

const AcceptInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: invite, isLoading, isError } = useValidateInvite(token);
  const acceptMutation = useAcceptInvite();

  const handleAccept = async () => {
    if (!token) {
      return;
    }

    if (!user) {
      navigate(`/login?redirect=/accept-invite/${token}`);
      return;
    }

    try {
      await acceptMutation.mutateAsync(token);
      navigate('/inbox');
    } catch {
      // error handled via acceptMutation.isError
    }
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={subtitleStyle}>{t('team.invite.validating')}</p>
        </div>
      </div>
    );
  }

  if (isError || !invite?.valid) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>{t('team.invite.invalidTitle')}</h1>
          <p style={subtitleStyle}>{t('team.invite.invalidBody')}</p>
          <button style={buttonStyle} onClick={() => navigate('/login')}>
            {t('team.invite.goToLogin')}
          </button>
        </div>
      </div>
    );
  }

  const acceptButtonLabel = acceptMutation.isPending
    ? t('team.invite.accepting')
    : t(user ? 'team.invite.accept' : 'team.invite.loginToAccept');

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>{t('team.invite.title')}</h1>
        <p style={subtitleStyle}>
          {t('team.invite.body', {
            inviter: invite.inviterName ?? t('team.invite.someone'),
            org: invite.orgName,
            role: invite.role,
          })}
        </p>

        {!user && <p style={{ ...subtitleStyle, marginBottom: '16px' }}>{t('team.invite.loginRequired')}</p>}

        <button
          style={{
            ...buttonStyle,
            opacity: acceptMutation.isPending ? BUTTON_PENDING_OPACITY : 1,
          }}
          onClick={handleAccept}
          disabled={acceptMutation.isPending}
        >
          {acceptButtonLabel}
        </button>

        {acceptMutation.isError && <p style={errorStyle}>{t('team.invite.acceptError')}</p>}
      </div>
    </div>
  );
};

export default AcceptInvite;
