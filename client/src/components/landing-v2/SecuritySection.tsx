import React from 'react';
import { useTranslation } from 'react-i18next';

const SECURITY_PREFIX = 'landing.v2.security';
const SECURITY_POINTS = ['encrypted', 'transit', 'neverSold', 'noTraining', 'control'] as const;

export const SecuritySection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="security" className="section-band">
      <div className="wrap">
        <div className="security">
          <div className="security-intro">
            <span className="kicker">{t(`${SECURITY_PREFIX}.kicker`)}</span>
            <h2 className="section-title">
              {t(`${SECURITY_PREFIX}.titlePre`)}
              <em>{t(`${SECURITY_PREFIX}.titleEm`)}</em>
            </h2>
            <p className="section-sub">{t(`${SECURITY_PREFIX}.sub`)}</p>
            <div className="security-audit">
              <b>{t(`${SECURITY_PREFIX}.audit.title`)}</b>
              <p>{t(`${SECURITY_PREFIX}.audit.body`)}</p>
            </div>
          </div>
          <ul className="security-points">
            {SECURITY_POINTS.map(pointKey => (
              <li key={pointKey}>
                <h3>{t(`${SECURITY_PREFIX}.points.${pointKey}.title`)}</h3>
                <p>{t(`${SECURITY_PREFIX}.points.${pointKey}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
