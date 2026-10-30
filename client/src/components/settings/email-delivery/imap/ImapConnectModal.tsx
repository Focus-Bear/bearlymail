import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { ImapAccountSummary, ImapConnectionFailure, OAuthProviderId } from 'types/imap-account.types';

import { OPACITY_DISABLED, OPACITY_FULL, OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { KEY_ESCAPE } from 'constants/strings';

import { failureMessageKey, oauthProviderFor, shouldOfferManualSettings } from './imapConnectForm.helpers';
import { imapFieldStyle, imapHintStyle, imapInputStyle, imapLabelStyle } from './imapFormStyles';
import { ImapServerFields } from './ImapServerFields';
import { IMAP_FORM_STATUS, type ImapFormStatus, useImapConnectForm } from './useImapConnectForm';

interface ImapConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (account: ImapAccountSummary) => void;
  /** Prefills the address, e.g. when reconnecting an account whose password changed. */
  initialEmail?: string;
  /** Offered when the address turns out to be Gmail / Microsoft / Zoho mail. */
  onUseProvider?: (provider: OAuthProviderId) => void;
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: theme.colors.primary.main,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
};

const TechnicalDetails: React.FC<{ detail: string }> = ({ detail }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  if (!detail) {
return null;
}
  return (
    <div style={{ marginTop: theme.spacing.xs }}>
      <button type="button" onClick={() => setIsOpen(current => !current)} style={linkButtonStyle}>
        {t(isOpen ? 'settings.imap.hideDetails' : 'settings.imap.showDetails')}
      </button>
      {isOpen && <p style={imapHintStyle}>{detail}</p>}
    </div>
  );
};

interface FailureMessageProps {
  failure: ImapConnectionFailure;
  onUseProvider?: (provider: OAuthProviderId) => void;
}

const FailureMessage: React.FC<FailureMessageProps> = ({ failure, onUseProvider }) => {
  const { t } = useTranslation();
  const provider = oauthProviderFor(failure);
  return (
    <div role="alert" style={{ marginBottom: theme.spacing.md }}>
      <p style={{ ...imapHintStyle, color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm }}>
        {t(failureMessageKey(failure))}
      </p>
      {provider && onUseProvider && (
        <button
          type="button"
          onClick={() => onUseProvider(provider)}
          style={{ ...linkButtonStyle, fontSize: theme.typography.fontSize.sm, marginTop: theme.spacing.xs }}
        >
          {t(`settings.imap.useProvider.${provider}`)}
        </button>
      )}
      {!provider && <TechnicalDetails detail={failure.detail} />}
    </div>
  );
};

const StatusMessage: React.FC<{ status: ImapFormStatus; onUseProvider?: FailureMessageProps['onUseProvider'] }> = ({
  status,
  onUseProvider,
}) => {
  const { t } = useTranslation();
  if (status.kind === IMAP_FORM_STATUS.WORKING) {
    return (
      <p role="status" style={{ ...imapHintStyle, marginBottom: theme.spacing.md }}>
        {t('settings.imap.finding')}
      </p>
    );
  }
  if (status.kind !== IMAP_FORM_STATUS.FAILED) {
return null;
}
  return <FailureMessage failure={status.failure} onUseProvider={onUseProvider} />;
};

interface ModalButtonProps {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}

const ModalButton: React.FC<ModalButtonProps> = ({ label, onClick, disabled, primary = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
      backgroundColor: primary ? theme.colors.primary.main : theme.colors.common.transparent,
      color: primary ? theme.colors.common.white : theme.colors.text.secondary,
      border: primary ? 'none' : `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.sm,
      fontSize: theme.typography.fontSize.sm,
      fontWeight: primary ? theme.typography.fontWeight.medium : undefined,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? OPACITY_DISABLED : OPACITY_FULL,
    }}
  >
    {label}
  </button>
);

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}

const TextField: React.FC<TextFieldProps> = ({ id, label, value, onChange, type, hint, autoComplete, autoFocus }) => (
  <div style={imapFieldStyle}>
    <label htmlFor={id} style={imapLabelStyle}>
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      style={imapInputStyle}
    />
    {hint && <p style={imapHintStyle}>{hint}</p>}
  </div>
);

const ImapConnectForm: React.FC<Omit<ImapConnectModalProps, 'isOpen'>> = ({
  onClose,
  onConnected,
  initialEmail,
  onUseProvider,
}) => {
  const { t } = useTranslation();
  const form = useImapConnectForm({ initialEmail, onConnected });
  const isWorking = form.status.kind === IMAP_FORM_STATUS.WORKING;
  const suggestManual = form.status.kind === IMAP_FORM_STATUS.FAILED && shouldOfferManualSettings(form.status.failure);

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (form.canSubmit) {
void form.connect();
}
      }}
    >
      <TextField
        id="imap-email"
        type="email"
        label={t('settings.imap.email')}
        value={form.values.email}
        onChange={value => form.setField('email', value)}
        autoComplete="email"
        autoFocus={!initialEmail}
      />
      <TextField
        id="imap-password"
        type="password"
        label={t('settings.imap.password')}
        hint={t('settings.imap.passwordHint')}
        value={form.values.password}
        onChange={value => form.setField('password', value)}
        autoComplete="off"
        autoFocus={!!initialEmail}
      />
      <TextField
        id="imap-name"
        label={t('settings.imap.name')}
        value={form.values.name}
        onChange={value => form.setField('name', value)}
        autoComplete="name"
      />

      {form.isManual && (
        <ImapServerFields
          servers={form.values.servers}
          username={form.values.username}
          usernamePlaceholder={form.values.email}
          onServersChange={form.setServers}
          onUsernameChange={value => form.setField('username', value)}
        />
      )}

      <StatusMessage status={form.status} onUseProvider={onUseProvider} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm }}>
        <ModalButton label={t('common.cancel')} onClick={onClose} disabled={isWorking} />
        <ModalButton
          label={isWorking ? t('settings.imap.connecting') : t('settings.imap.connect')}
          onClick={() => void form.connect()}
          disabled={!form.canSubmit}
          primary
        />
      </div>
      <div style={{ marginTop: theme.spacing.md }}>
        <button
          type="button"
          onClick={form.toggleManual}
          aria-expanded={form.isManual}
          style={{
            ...linkButtonStyle,
            fontWeight: suggestManual ? theme.typography.fontWeight.semibold : undefined,
          }}
        >
          {t(form.isManual ? 'settings.imap.useAutomatic' : 'settings.imap.enterManually')}
        </button>
      </div>
    </form>
  );
};

/**
 * Connects a mailbox with only an email address and password — for email
 * hosted with Crazy Domains, cPanel and other web hosts. The server finds the
 * mail settings; they can still be entered by hand if that fails.
 */
export const ImapConnectModal: React.FC<ImapConnectModalProps> = ({ isOpen, ...formProps }) => {
  const { t } = useTranslation();
  if (!isOpen) {
return null;
}

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="imap-connect-title"
      onClick={formProps.onClose}
      onKeyDown={event => {
        if (event.key === KEY_ESCAPE) {
formProps.onClose();
}
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: `rgba(0, 0, 0, ${OPACITY_HALF})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z_INDEX_MODAL_OVERLAY,
        padding: theme.spacing.lg,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: theme.shadows.xl,
        }}
      >
        <h3
          id="imap-connect-title"
          style={{ margin: 0, marginBottom: theme.spacing.xs, color: theme.colors.text.primary }}
        >
          {t(formProps.initialEmail ? 'settings.imap.reconnectTitle' : 'settings.imap.title')}
        </h3>
        <p style={{ ...imapHintStyle, marginBottom: theme.spacing.lg, fontSize: theme.typography.fontSize.sm }}>
          {t('settings.imap.description')}
        </p>
        <ImapConnectForm {...formProps} />
      </div>
    </div>
  );
};
