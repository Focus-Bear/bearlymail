import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';

export const DataExportSection: React.FC = () => {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    captureEvent('data_export_initiated');
    setIsExporting(true);
    setError(null);

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

      <button
        onClick={handleExport}
        disabled={isExporting}
        style={{
          backgroundColor: theme.colors.primary.main,
          color: 'white',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          cursor: isExporting ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
          transition: theme.transitions.default,
          opacity: isExporting ? 0.7 : 1,
        }}
        onMouseOver={(e) => {
          if (!isExporting) {
            e.currentTarget.style.backgroundColor = theme.colors.primary.dark;
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.primary.main;
        }}
      >
        {isExporting ? t('settings.dataExport.exporting') : t('settings.dataExport.exportButton')}
      </button>
    </div>
  );
};
