import React from 'react';
import { useTranslation } from 'react-i18next';

const CONNECT_PREFIX = 'landing.v2.steps.visuals.connect';
const PROVIDER_KEYS = ['google', 'office365', 'zoho'] as const;

export const StepConnect: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="visual-head">
        <b>{t(`${CONNECT_PREFIX}.heading`)}</b>
        <span className="visual-tag">{t(`${CONNECT_PREFIX}.tag`)}</span>
      </div>
      <ul className="connect-list">
        {PROVIDER_KEYS.map(providerKey => (
          <li key={providerKey} className="connect-row">
            <span className="connect-name">{t(`${CONNECT_PREFIX}.providers.${providerKey}`)}</span>
            <span className="connect-status">{t(`${CONNECT_PREFIX}.connected`)}</span>
          </li>
        ))}
      </ul>
      <div className="connect-result">
        <b>{t(`${CONNECT_PREFIX}.resultBold`)}</b>
        {t(`${CONNECT_PREFIX}.resultRest`)}
      </div>
      <div className="visual-footer">
        <b className="visual-footer-bold">{t(`${CONNECT_PREFIX}.footerBold`)}</b>
        {t(`${CONNECT_PREFIX}.footerRest`)}
      </div>
    </>
  );
};
