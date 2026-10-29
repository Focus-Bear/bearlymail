import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { ImapAccountSummary } from 'types/imap-account.types';

import { OPACITY_DISABLED, OPACITY_FULL, OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { KEY_ESCAPE } from 'constants/strings';

import { failureMessageKey } from './imapConnectForm.helpers';
import { imapFieldStyle, imapHintStyle, imapInputStyle, imapLabelStyle } from './imapFormStyles';
import { ImapServerFields } from './ImapServerFields';
import { IMAP_FORM_STATUS, type ImapFormStatus, useImapConnectForm } from './useImapConnectForm';

interface ImapConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: (account: ImapAccountSummary) => void;
  /** Prefills the address, e.g. when reconnecting an account whose password changed. */
  initialEmail?: string;
}

const StatusMessage: React.FC<{ status: ImapFormStatus }> = ({ status }) => {
  const { t } = useTranslation();
  if (status.kind === IMAP_FORM_STATUS.TESTED) {
    return (
      <p role="status" style={{ ...imapHintStyle, color: theme.colors.accent.success }}>
        {t('settings.imap.testSucceeded')}
      </p>
    );
  }
  if (status.kind !== IMAP_FORM_STATUS.FAILED) {
    return null;
  }
  return (
    <div role="alert" style={{ marginBottom: theme.spacing.md }}>
      <p style={{ ...imapHintStyle, color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm }}>
        {t(failureMessageKey(status.failure))}
      </p>
      <p style={imapHintStyle}>{status.failure.detail}</p>
    </div>
  );
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
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
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

const ServerSummary: React.FC<{ host: string; isExpanded: boolean; onToggle: () => void }> = ({
  host,
  isExpanded,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <p style={{ ...imapHintStyle, marginBottom: theme.spacing.sm }}>
      {t('settings.imap.serverSummary', { host: host || '—' })}{' '}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: theme.colors.primary.main,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        {t(isExpanded ? 'settings.imap.hideAdvanced' : 'settings.imap.showAdvanced')}
      </button>
    </p>
  );
};

const ImapConnectForm: React.FC<Omit<ImapConnectModalProps, 'isOpen'>> = ({ onClose, onConnected, initialEmail }) => {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const form = useImapConnectForm({ initialEmail, onConnected });
  const isWorking = form.status.kind === IMAP_FORM_STATUS.WORKING;

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (form.canSubmit) {
          void form.connect();
        }
      }}
    >
      <div style={imapFieldStyle}>
        <label htmlFor="imap-email" style={imapLabelStyle}>
          {t('settings.imap.email')}
        </label>
        <input
          id="imap-email"
          type="email"
          value={form.values.email}
          onChange={event => form.setField('email', event.target.value)}
          onBlur={() => void form.suggestServers()}
          autoComplete="email"
          autoFocus={!initialEmail}
          style={imapInputStyle}
        />
      </div>
      <div style={imapFieldStyle}>
        <label htmlFor="imap-password" style={imapLabelStyle}>
          {t('settings.imap.password')}
        </label>
        <input
          id="imap-password"
          type="password"
          value={form.values.password}
          onChange={event => form.setField('password', event.target.value)}
          autoComplete="off"
          autoFocus={!!initialEmail}
          style={imapInputStyle}
        />
        <p style={imapHintStyle}>{t('settings.imap.passwordHint')}</p>
      </div>
      <div style={imapFieldStyle}>
        <label htmlFor="imap-name" style={imapLabelStyle}>
          {t('settings.imap.name')}
        </label>
        <input
          id="imap-name"
          value={form.values.name}
          onChange={event => form.setField('name', event.target.value)}
          autoComplete="name"
          style={imapInputStyle}
        />
      </div>

      <ServerSummary
        host={form.values.servers.imapHost}
        isExpanded={showAdvanced}
        onToggle={() => setShowAdvanced(current => !current)}
      />
      {showAdvanced && (
        <ImapServerFields
          servers={form.values.servers}
          username={form.values.username}
          usernamePlaceholder={form.values.email}
          onServersChange={form.setServers}
          onUsernameChange={value => form.setField('username', value)}
        />
      )}

      <StatusMessage status={form.status} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
        <ModalButton label={t('common.cancel')} onClick={onClose} disabled={isWorking} />
        <ModalButton
          label={t('settings.imap.test')}
          onClick={() => void form.testConnection()}
          disabled={!form.canSubmit}
        />
        <ModalButton
          label={isWorking ? t('settings.imap.connecting') : t('settings.imap.connect')}
          onClick={() => void form.connect()}
          disabled={!form.canSubmit}
          primary
        />
      </div>
    </form>
  );
};

/**
 * Connects a mailbox with an email address and password over IMAP + SMTP —
 * for hosts with no "Sign in with…" option, such as Crazy Domains or cPanel.
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
          maxWidth: '520px',
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
