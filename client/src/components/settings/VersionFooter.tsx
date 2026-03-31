import React from 'react';
import { useTranslation } from 'react-i18next';

// __COMMIT_HASH__ and __BUILD_TIME__ are injected by vite.config.ts at build time.
// Commit: COMMIT_HASH, GITHUB_SHA, or `git rev-parse --short HEAD`; else "dev".
declare const __COMMIT_HASH__: string;
declare const __BUILD_TIME__: string;

const styles: React.CSSProperties = {
  marginTop: '2rem',
  paddingTop: '1rem',
  borderTop: '1px solid #EFEFEF',
  textAlign: 'center',
  fontSize: '0.75rem',
  color: '#666666',
  fontFamily: 'monospace',
  userSelect: 'text',
};

/**
 * VersionFooter — shows the deployed commit SHA and build timestamp at the bottom
 * of the Settings page so developers and support staff can quickly identify
 * which version is running without opening the browser console.
 */
export const VersionFooter: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer style={styles} aria-label={t('settings.versionFooterLabel')}>
      {t('settings.version')} {__COMMIT_HASH__} · {t('settings.builtAt')} {__BUILD_TIME__}
    </footer>
  );
};
