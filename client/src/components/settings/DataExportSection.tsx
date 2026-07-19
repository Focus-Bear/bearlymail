import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_DISABLED_ALT } from 'constants/numbers';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';

import { formatImportDetails, type ImportResult, parseImportFile } from './dataExport.helpers';

export type { ImportResult } from './dataExport.helpers';

const BUTTON_VARIANT_PRIMARY = 'primary' as const;
const MIN_EXPORT_PASSWORD_LENGTH = 8;

interface ActionButtonProps {
  onClick: () => void;
  disabled: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  label: string;
  variant: 'primary' | 'secondary';
}

const ActionButton: React.FC<ActionButtonProps> = ({
  onClick,
  disabled,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  label,
  variant,
}) => {
  const isPrimary = variant === BUTTON_VARIANT_PRIMARY;
  const isActive = isHovered && !disabled;
  let bgColor = theme.colors.button.secondary.default;
  let textColor: string = theme.colors.button.secondary.text;
  let borderStyle: string = `1px solid ${isActive ? theme.colors.button.secondary.hoverBorder : theme.colors.button.secondary.border}`;
  if (isPrimary) {
    bgColor = isActive ? theme.colors.primary.dark : theme.colors.primary.main;
    textColor = COLOR_NAMED_WHITE;
    borderStyle = STRING_NONE;
  } else if (isActive) {
    textColor = theme.colors.button.secondary.hoverText;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        border: borderStyle,
        borderRadius: theme.borderRadius.md,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.medium,
        transition: theme.transitions.default,
        opacity: disabled ? OPACITY_DISABLED_ALT : 1,
      }}
    >
      {label}
    </button>
  );
};

async function performExport(): Promise<Blob> {
  // credentials: 'include' sends the HttpOnly JWT cookie automatically (OWASP ASVS GAP-4)
  const response = await fetch(`${API_URL}/users/me/export`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Export failed');
  }
  return response.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Email export is built asynchronously in a background worker (it used to 504 at
// the ALB timeout for large mailboxes). The POST returns an id to poll, and the
// finished ZIP is fetched from a short-lived presigned S3 URL.
const EMAIL_EXPORT_POLL_INTERVAL_MS = 2000;
const EMAIL_EXPORT_MAX_POLLS = 150; // 150 × 2s = 5 minutes

const EMAIL_EXPORT_STATUS_COMPLETED = 'completed';
const EMAIL_EXPORT_STATUS_FAILED = 'failed';
const EMAIL_EXPORT_STATUS_CHECK_FAILED_MESSAGE = 'Email export status check failed';

type EmailExportStatus = 'pending' | 'running' | 'completed' | 'failed';

interface EmailExportStatusResponse {
  id: string;
  status: EmailExportStatus;
  downloadUrl?: string;
  error?: string | null;
}

async function requestEmailExport(password: string): Promise<string> {
  const response = await fetch(`${API_URL}/emails/export`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    throw new Error('Email export request failed');
  }
  const payload = (await response.json()) as { exportId: string };
  return payload.exportId;
}

async function fetchEmailExportStatus(exportId: string): Promise<EmailExportStatusResponse> {
  const response = await fetch(`${API_URL}/emails/export/${exportId}`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(EMAIL_EXPORT_STATUS_CHECK_FAILED_MESSAGE);
  }
  return (await response.json()) as EmailExportStatusResponse;
}

function triggerUrlDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  // The presigned URL already sets Content-Disposition, so the filename is fixed
  // server-side; this attribute is a best-effort hint for same-origin cases.
  link.download = 'bearlymail-emails.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function submitImport(importData: unknown): Promise<ImportResult> {
  // credentials: 'include' sends the HttpOnly JWT cookie automatically (OWASP ASVS GAP-4)
  const response = await fetch(`${API_URL}/users/me/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ importPayload: importData }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || 'Import failed');
  }
  return response.json();
}

export const DataExportSection: React.FC = () => {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isExportHovered, setIsExportHovered] = useState(false);
  const [isImportHovered, setIsImportHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email export state
  const [isEmailExportFormOpen, setIsEmailExportFormOpen] = useState(false);
  const [emailExportPassword, setEmailExportPassword] = useState('');
  const [isEmailExporting, setIsEmailExporting] = useState(false);
  const [isEmailExportHovered, setIsEmailExportHovered] = useState(false);
  const [isEmailDownloadHovered, setIsEmailDownloadHovered] = useState(false);
  const [isEmailCancelHovered, setIsEmailCancelHovered] = useState(false);

  const handleExport = async () => {
    captureEvent(ANALYTICS_EVENTS.DATA_EXPORT_INITIATED);
    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const blob = await performExport();
      downloadBlob(blob, `bearlymail-export-${new Date().toISOString().split('T')[0]}.json`);
      captureEvent(ANALYTICS_EVENTS.DATA_EXPORT_COMPLETED);
    } catch {
      setError(t('settings.dataExport.exportError'));
      captureEvent(ANALYTICS_EVENTS.DATA_EXPORT_FAILED);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = '';
    captureEvent(ANALYTICS_EVENTS.DATA_IMPORT_INITIATED);
    setIsImporting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const importData = parseImportFile(await file.text(), t);
      const result = await submitImport(importData);
      if (result.success) {
        const details = formatImportDetails(result);
        setSuccessMessage(
          `${t('settings.dataExport.importSuccess')} ${t('settings.dataExport.importSuccessDetails', { details })}`
        );
        captureEvent(ANALYTICS_EVENTS.DATA_IMPORT_COMPLETED, { imported: result.imported });
      } else {
        throw new Error(result.errors[0] || t('settings.dataExport.importError'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.dataExport.importError');
      setError(message);
      captureEvent(ANALYTICS_EVENTS.DATA_IMPORT_FAILED, { error: message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleEmailExportToggle = () => {
    setIsEmailExportFormOpen((prev) => !prev);
    setEmailExportPassword('');
    setError(null);
  };

  const handleEmailExport = async () => {
    if (isEmailExporting || emailExportPassword.length < MIN_EXPORT_PASSWORD_LENGTH) {
      return;
    }
    setIsEmailExporting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const exportId = await requestEmailExport(emailExportPassword);

      // Poll until the worker finishes building the ZIP, then download it.
      // Transient status-check failures (e.g. brief network blip) are swallowed
      // so a single hiccup doesn't abort an export the worker is still building.
      let downloadUrl: string | undefined;
      for (let i = 0; i < EMAIL_EXPORT_MAX_POLLS; i++) {
        await delay(EMAIL_EXPORT_POLL_INTERVAL_MS);
        try {
          const status = await fetchEmailExportStatus(exportId);
          if (status.status === EMAIL_EXPORT_STATUS_COMPLETED && status.downloadUrl) {
            downloadUrl = status.downloadUrl;
            break;
          }
          if (status.status === EMAIL_EXPORT_STATUS_FAILED) {
            throw new Error(status.error || 'Email export failed');
          }
        } catch (err) {
          if (err instanceof Error && err.message === EMAIL_EXPORT_STATUS_CHECK_FAILED_MESSAGE) {
            continue;
          }
          throw err;
        }
      }

      if (!downloadUrl) {
        throw new Error('Email export timed out');
      }

      triggerUrlDownload(downloadUrl);
      setSuccessMessage(t('settings.dataExport.emailExportReady'));
      setIsEmailExportFormOpen(false);
      setEmailExportPassword('');
    } catch {
      setError(t('settings.dataExport.emailExportError'));
    } finally {
      setIsEmailExporting(false);
    }
  };

  const isBusy = isExporting || isImporting || isEmailExporting;

  return (
    <div
      id="data-export"
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
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.xl,
        }}
      >
        {t('settings.dataExport.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.dataExport.description')}
      </p>

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

      {successMessage && (
        <p
          style={{
            color: theme.colors.success.main,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.md,
          }}
        >
          {successMessage}
        </p>
      )}

      <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <ActionButton
          onClick={handleExport}
          disabled={isBusy}
          isHovered={isExportHovered}
          onMouseEnter={() => setIsExportHovered(true)}
          onMouseLeave={() => setIsExportHovered(false)}
          label={isExporting ? t('settings.dataExport.exporting') : t('settings.dataExport.exportButton')}
          variant="primary"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <ActionButton
          onClick={handleImportClick}
          disabled={isBusy}
          isHovered={isImportHovered}
          onMouseEnter={() => setIsImportHovered(true)}
          onMouseLeave={() => setIsImportHovered(false)}
          label={isImporting ? t('settings.dataExport.importing') : t('settings.dataExport.importButton')}
          variant="secondary"
        />

        <ActionButton
          onClick={handleEmailExportToggle}
          disabled={isBusy}
          isHovered={isEmailExportHovered}
          onMouseEnter={() => setIsEmailExportHovered(true)}
          onMouseLeave={() => setIsEmailExportHovered(false)}
          label={t('settings.dataExport.emailExportButton')}
          variant="primary"
        />
      </div>

      {isEmailExportFormOpen && (
        <div
          style={{
            marginTop: theme.spacing.lg,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <p
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('settings.dataExport.emailExportDescription')}
          </p>
          <label
            htmlFor="email-export-password"
            style={{
              display: 'block',
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.xs,
            }}
          >
            {t('settings.dataExport.emailExportPasswordLabel')}
          </label>
          <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              id="email-export-password"
              type="password"
              value={emailExportPassword}
              onChange={(event) => setEmailExportPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === KEY_ENTER) {
                  handleEmailExport();
                }
              }}
              placeholder={t('settings.dataExport.emailExportPasswordPlaceholder')}
              disabled={isEmailExporting}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                minWidth: '220px',
              }}
            />
            <ActionButton
              onClick={handleEmailExport}
              disabled={isEmailExporting || emailExportPassword.length < MIN_EXPORT_PASSWORD_LENGTH}
              isHovered={isEmailDownloadHovered}
              onMouseEnter={() => setIsEmailDownloadHovered(true)}
              onMouseLeave={() => setIsEmailDownloadHovered(false)}
              label={isEmailExporting ? t('settings.dataExport.emailExporting') : t('settings.dataExport.emailExportDownload')}
              variant="primary"
            />
            <ActionButton
              onClick={handleEmailExportToggle}
              disabled={isEmailExporting}
              isHovered={isEmailCancelHovered}
              onMouseEnter={() => setIsEmailCancelHovered(true)}
              onMouseLeave={() => setIsEmailCancelHovered(false)}
              label={t('settings.dataExport.emailExportCancel')}
              variant="secondary"
            />
          </div>
        </div>
      )}
    </div>
  );
};
