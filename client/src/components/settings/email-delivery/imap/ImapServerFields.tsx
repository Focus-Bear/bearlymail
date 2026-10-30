import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { IMAP_PROTOCOLS, type ImapProtocol, type ImapServerSettings } from 'types/imap-account.types';

import { IMAP_PORTS, SMTP_PORTS } from 'constants/imap';

import { portForSecurity } from './imapConnectForm.helpers';
import { imapFieldStyle, imapInputStyle, imapLabelStyle } from './imapFormStyles';

const SECURITY_SSL = 'ssl';
const SECURITY_STARTTLS = 'starttls';

interface ServerRowProps {
  protocol: ImapProtocol;
  servers: ImapServerSettings;
  onChange: (servers: ImapServerSettings) => void;
}

const ServerRow: React.FC<ServerRowProps> = ({ protocol, servers, onChange }) => {
  const { t } = useTranslation();
  const isImap = protocol === IMAP_PROTOCOLS.IMAP;
  const host = isImap ? servers.imapHost : servers.smtpHost;
  const port = isImap ? servers.imapPort : servers.smtpPort;
  const secure = isImap ? servers.imapSecure : servers.smtpSecure;
  const ports = isImap ? IMAP_PORTS : SMTP_PORTS;
  const update = (patch: { host?: string; port?: number; secure?: boolean }) =>
    onChange(
      isImap
        ? {
            ...servers,
            imapHost: patch.host ?? servers.imapHost,
            imapPort: patch.port ?? servers.imapPort,
            imapSecure: patch.secure ?? servers.imapSecure,
          }
        : {
            ...servers,
            smtpHost: patch.host ?? servers.smtpHost,
            smtpPort: patch.port ?? servers.smtpPort,
            smtpSecure: patch.secure ?? servers.smtpSecure,
          }
    );
  const id = (field: string) => `imap-${protocol}-${field}`;

  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: theme.spacing.md }}>
      <legend style={{ ...imapLabelStyle, marginBottom: theme.spacing.sm }}>
        {t(isImap ? 'settings.imap.incomingServer' : 'settings.imap.outgoingServer')}
      </legend>
      {/* Host gets its own row so long hostnames stay readable on phones. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: theme.spacing.sm }}>
        <input
          id={id('host')}
          aria-label={t('settings.imap.host')}
          value={host}
          onChange={event => update({ host: event.target.value })}
          placeholder="mail.example.com"
          autoCapitalize="none"
          spellCheck={false}
          style={{ ...imapInputStyle, gridColumn: '1 / -1' }}
        />
        <input
          id={id('port')}
          aria-label={t('settings.imap.port')}
          type="number"
          value={port}
          onChange={event => update({ port: Number(event.target.value) })}
          style={imapInputStyle}
        />
        <select
          id={id('security')}
          aria-label={t('settings.imap.security')}
          value={secure ? SECURITY_SSL : SECURITY_STARTTLS}
          onChange={event => {
            const nextSecure = event.target.value === SECURITY_SSL;
            update({ secure: nextSecure, port: portForSecurity(port, nextSecure, ports) });
          }}
          style={imapInputStyle}
        >
          <option value={SECURITY_SSL}>{t('settings.imap.securitySsl')}</option>
          <option value={SECURITY_STARTTLS}>{t('settings.imap.securityStartTls')}</option>
        </select>
      </div>
    </fieldset>
  );
};

interface ImapServerFieldsProps {
  servers: ImapServerSettings;
  username: string;
  usernamePlaceholder: string;
  onServersChange: (servers: ImapServerSettings) => void;
  onUsernameChange: (username: string) => void;
}

/** The "Advanced" part of the form: servers, ports, security and login name. */
export const ImapServerFields: React.FC<ImapServerFieldsProps> = ({
  servers,
  username,
  usernamePlaceholder,
  onServersChange,
  onUsernameChange,
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <ServerRow protocol={IMAP_PROTOCOLS.IMAP} servers={servers} onChange={onServersChange} />
      <ServerRow protocol={IMAP_PROTOCOLS.SMTP} servers={servers} onChange={onServersChange} />
      <div style={imapFieldStyle}>
        <label htmlFor="imap-username" style={imapLabelStyle}>
          {t('settings.imap.username')}
        </label>
        <input
          id="imap-username"
          value={username}
          onChange={event => onUsernameChange(event.target.value)}
          placeholder={usernamePlaceholder}
          autoCapitalize="none"
          spellCheck={false}
          style={imapInputStyle}
        />
      </div>
    </div>
  );
};
