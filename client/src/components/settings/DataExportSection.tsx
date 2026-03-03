import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED_ALT } from 'constants/numbers';
import { STRING_NONE, TYPEOF_OBJECT } from 'constants/strings';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';
import { COLOR_NAMED_WHITE } from 'constants/colors';

interface ImportResult {
  success: boolean;
  imported: {
    profile: boolean;
    batchSchedule: boolean;
    blockedSenders: number;
    blockedKeywords: number;
    contexts: number;
    toneRules: number;
    summarizationRules: number;
    autoResponderSettings: boolean;
  };
  skipped: {
    blockedSenders: number;
    blockedKeywords: number;
    contexts: number;
  };
  errors: string[];
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

  const handleExport = async () => {
    captureEvent('data_export_initiated');
    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`${API_URL}/users/me/export`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bearlymail-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      captureEvent('data_export_completed');
    } catch (err) {
      setError(t('settings.dataExport.exportError'));
      captureEvent('data_export_failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const formatImportDetails = (result: ImportResult): string => {
    const details: string[] = [];
    
    if (result.imported.profile) details.push('profile');
    if (result.imported.batchSchedule) details.push('batch schedule');
    if (result.imported.blockedSenders > 0) {
      details.push(`${result.imported.blockedSenders} blocked sender(s)`);
    }
    if (result.imported.blockedKeywords > 0) {
      details.push(`${result.imported.blockedKeywords} blocked keyword(s)`);
    }
    if (result.imported.contexts > 0) {
      details.push(`${result.imported.contexts} context(s)`);
    }
    if (result.imported.toneRules > 0) {
      details.push(`${result.imported.toneRules} tone rule(s)`);
    }
    if (result.imported.summarizationRules > 0) {
      details.push(`${result.imported.summarizationRules} summarization rule(s)`);
    }
    if (result.imported.autoResponderSettings) details.push('auto-responder settings');
    
    return details.length > 0 ? details.join(', ') : 'no new data';
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be selected again
    event.target.value = '';

    captureEvent('data_import_initiated');
    setIsImporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Read and parse the file
      const text = await file.text();
      let importData: unknown;
      
      try {
        importData = JSON.parse(text);
      } catch {
        throw new Error(t('settings.dataExport.invalidFile'));
      }

      // Validate it's a BearlyMail export
      if (!importData || typeof importData !== TYPEOF_OBJECT || !('version' in importData) || !('exportedAt' in importData)) {
        throw new Error(t('settings.dataExport.invalidFile'));
      }

      // Send to API
      const response = await fetch(`${API_URL}/users/me/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ importPayload: importData }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t('settings.dataExport.importError'));
      }

      const result: ImportResult = await response.json();

      if (result.success) {
        const details = formatImportDetails(result);
        setSuccessMessage(
          `${t('settings.dataExport.importSuccess')} ${t('settings.dataExport.importSuccessDetails', { details })}`
        );
        captureEvent('data_import_completed', { imported: result.imported });
      } else {
        throw new Error(result.errors[0] || t('settings.dataExport.importError'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.dataExport.importError');
      setError(message);
      captureEvent('data_import_failed', { error: message });
    } finally {
      setIsImporting(false);
    }
  };

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
        <button
          onClick={handleExport}
          disabled={isExporting || isImporting}
          onMouseEnter={() => setIsExportHovered(true)}
          onMouseLeave={() => setIsExportHovered(false)}
          style={{
            backgroundColor:
              isExportHovered && !isExporting && !isImporting
                ? theme.colors.primary.dark
                : theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            cursor: isExporting || isImporting ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.default,
            opacity: isExporting || isImporting ? OPACITY_DISABLED_ALT : 1,
          }}
        >
          {isExporting ? t('settings.dataExport.exporting') : t('settings.dataExport.exportButton')}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <button
          onClick={handleImportClick}
          disabled={isExporting || isImporting}
          onMouseEnter={() => setIsImportHovered(true)}
          onMouseLeave={() => setIsImportHovered(false)}
          style={{
            backgroundColor: theme.colors.button.secondary.default,
            color:
              isImportHovered && !isExporting && !isImporting
                ? theme.colors.button.secondary.hoverText
                : theme.colors.button.secondary.text,
            border: `1px solid ${
              isImportHovered && !isExporting && !isImporting
                ? theme.colors.button.secondary.hoverBorder
                : theme.colors.button.secondary.border
            }`,
            borderRadius: theme.borderRadius.md,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            cursor: isExporting || isImporting ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.default,
            opacity: isExporting || isImporting ? OPACITY_DISABLED_ALT : 1,
          }}
        >
          {isImporting ? t('settings.dataExport.importing') : t('settings.dataExport.importButton')}
        </button>
      </div>
    </div>
  );
};
