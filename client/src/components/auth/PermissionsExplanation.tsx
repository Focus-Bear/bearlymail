import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_SHIELD } from 'constants/emojis';
import { OPACITY_DISABLED_ALT, VIEWPORT_HEIGHT_90, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { PROVIDER_GOOGLE, STRING_NONE } from 'constants/strings';

interface PermissionsExplanationProps {
  onContinue: () => void;
  onCancel: () => void;
  provider: 'google' | 'zoho';
}

interface PermissionItemProps {
  icon: string;
  title: string;
  description: string;
}

const PermissionItem: React.FC<PermissionItemProps> = ({ icon, title, description }) => (
  <div style={{ marginBottom: theme.spacing.lg }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
      <div style={{ fontSize: theme.typography.fontSize['2xl'], lineHeight: 1 }}>{icon}</div>
      <div>
        <h3
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.xs,
          }}
        >
          {title}
        </h3>
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
  </div>
);

interface PermissionsContentProps {
  t: (key: string) => string;
  provider: 'google' | 'zoho';
}

const PermissionsContent: React.FC<PermissionsContentProps> = ({ t, provider}) => (
  <>
    <div style={{ marginBottom: theme.spacing.xl }}>
      { provider === PROVIDER_GOOGLE ?
      (<>
      <PermissionItem
        icon="📧"
        title={t('auth.permissions.gmail.title')}
        description={t('auth.permissions.gmail.description')}
      />
      <div
        style={{
          backgroundColor: `${theme.colors.success.main}08`,
          border: `1px solid ${theme.colors.success.main}30`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginTop: `-${theme.spacing.sm}`,
          marginBottom: theme.spacing.lg,
          marginLeft: `calc(${theme.typography.fontSize['2xl']} + ${theme.spacing.md})`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.sm,
        }}
      >
        <span style={{ fontSize: theme.typography.fontSize.sm }}>{EMOJI_SHIELD}</span>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.xs,
            lineHeight: 1.5,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {t('auth.permissions.gmail.sendClarification')}
        </p>
      </div>
      <PermissionItem
        icon="📅"
        title={t('auth.permissions.calendar.title')}
        description={t('auth.permissions.calendar.description')}
      />
      <PermissionItem
        icon="👥"
        title={t('auth.permissions.contacts.title')}
        description={t('auth.permissions.contacts.description')}
      />
      </>) : (
        <>
        <PermissionItem
        icon="📧"
        title={t('auth.permissions.zoho.title')}
        description={t('auth.permissions.zoho.description')}
      />
      <div
        style={{
          backgroundColor: `${theme.colors.success.main}08`,
          border: `1px solid ${theme.colors.success.main}30`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginTop: `-${theme.spacing.sm}`,
          marginBottom: theme.spacing.lg,
          marginLeft: `calc(${theme.typography.fontSize['2xl']} + ${theme.spacing.md})`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: theme.spacing.sm,
        }}
      >
        <span style={{ fontSize: theme.typography.fontSize.sm }}>{EMOJI_SHIELD}</span>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.xs,
            lineHeight: 1.5,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {t('auth.permissions.zoho.sendClarification')}
        </p>
      </div>
        </>
        )}
    </div>

    <div
      style={{
        backgroundColor: `${theme.colors.primary.main}10`,
        borderLeft: `4px solid ${theme.colors.primary.main}`,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.xl,
      }}
    >
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {t('auth.permissions.security')}
      </p>
    </div>
  </>
);

interface PermissionsActionsProps {
  onCancel: () => void;
  onContinue: () => void;
  provider: 'google' | 'zoho';
  t: (key: string) => string;
}

const PermissionsActions: React.FC<PermissionsActionsProps> = ({ onCancel, onContinue, provider, t }) => (
  <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
    <button
      onClick={onCancel}
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.background.paper,
        color: theme.colors.text.secondary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.medium,
        cursor: 'pointer',
      }}
    >
      {t('common.cancel')}
    </button>
    <button
      onClick={onContinue}
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: 'pointer',
      }}
      onMouseOver={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
      }}
      onMouseOut={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.main;
      }}
    >
     {provider === PROVIDER_GOOGLE ? t('auth.permissions.continue') : t('auth.permissions.zoho.continue')}
    </button>
  </div>
);

/**
 * Permissions explanation modal
 * Shown before Google OAuth to explain why BearlyMail needs each permission
 * Only shown once per user (tracked via localStorage)
 */
export const PermissionsExplanation: React.FC<PermissionsExplanationProps> = ({ onContinue,provider, onCancel }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(0, 0, 0, ${OPACITY_DISABLED_ALT})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z_INDEX_MODAL_OVERLAY,
        padding: theme.spacing.lg,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing['2xl'],
          maxWidth: '600px',
          width: '100%',
          maxHeight: VIEWPORT_HEIGHT_90,
          overflowY: 'auto',
          boxShadow: theme.shadows.xl,
        }}
      >
        <h2
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('auth.permissions.title')}
        </h2>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.base,
            marginBottom: theme.spacing.xl,
            lineHeight: 1.6,
          }}
        >
          {t('auth.permissions.intro')}
        </p>

        <PermissionsContent provider={provider} t={t} />
        <PermissionsActions onCancel={onCancel} onContinue={onContinue} provider={provider}  t={t} />
      </div>
    </div>
  );
};
