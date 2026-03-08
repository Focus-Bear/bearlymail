import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const QUEUE_DASHBOARD_URL = import.meta.env.VITE_QUEUE_DASHBOARD_URL || '';

const QueueDashboardNotConfigured: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      <h2
        style={{ margin: 0, fontSize: theme.typography.fontSize.xl, fontWeight: theme.typography.fontWeight.semibold }}
      >
        {t('admin.queueDashboard.title')}
      </h2>
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.xl,
        }}
      >
        <p style={{ margin: `0 0 ${theme.spacing.md}`, color: theme.colors.text.secondary }}>
          {t('admin.queueDashboard.notConfigured')}
        </p>
        <div
          style={{
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.sm,
            padding: theme.spacing.md,
            fontFamily: 'monospace',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
          }}
        >
          <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}>
            # {t('admin.queueDashboard.startCommand')}
          </div>
          <div>{t('admin.queueDashboard.startLine1')}</div>
          <div>{t('admin.queueDashboard.startLine2')}</div>
          <div>{t('admin.queueDashboard.startLine3')}</div>
          <div>{t('admin.queueDashboard.startLine4')}</div>
          <div>{t('admin.queueDashboard.startLine5')}</div>
        </div>
        <p
          style={{
            margin: `0 0 ${theme.spacing.sm}`,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('admin.queueDashboard.configureEnvVar')}
        </p>
        <div
          style={{
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.sm,
            padding: theme.spacing.md,
            fontFamily: 'monospace',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
          }}
        >
          {t('admin.queueDashboard.envVarExample')}
        </div>
      </div>
    </div>
  );
};

export const QueueDashboardSection: React.FC = () => {
  const { t } = useTranslation();

  if (!QUEUE_DASHBOARD_URL) {
    return <QueueDashboardNotConfigured />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('admin.queueDashboard.title')}
        </h2>
        <a
          href={QUEUE_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: theme.colors.primary.main,
            textDecoration: 'none',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('admin.queueDashboard.openInNewTab')}
        </a>
      </div>
      <iframe
        src={QUEUE_DASHBOARD_URL}
        title={t('admin.queueDashboard.title')}
        style={{
          width: '100%',
          height: '80vh',
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}
      />
    </div>
  );
};
