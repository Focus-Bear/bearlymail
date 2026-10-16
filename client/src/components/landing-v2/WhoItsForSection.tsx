import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ENGINEERING_MANAGER_LANDING_PATH, PRODUCT_MANAGER_LANDING_PATH } from './constants';

const WHO_PREFIX = 'landing.v2.who';

/** Audiences in display order; roles with a dedicated landing page link to it. */
const AUDIENCES: { key: string; path?: string }[] = [
  { key: 'founders' },
  { key: 'productManagers', path: PRODUCT_MANAGER_LANDING_PATH },
  { key: 'consultants' },
  { key: 'engineeringManagers', path: ENGINEERING_MANAGER_LANDING_PATH },
];

export const WhoItsForSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section id="who">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">{t(`${WHO_PREFIX}.kicker`)}</span>
          <h2 className="section-title">
            {t(`${WHO_PREFIX}.titlePre`)}
            <em>{t(`${WHO_PREFIX}.titleEm`)}</em>
            {t(`${WHO_PREFIX}.titleAfter`)}
          </h2>
          <p className="section-sub">{t(`${WHO_PREFIX}.sub`)}</p>
        </div>
        <div className="who-grid">
          {AUDIENCES.map(audience => (
            <AudienceCard key={audience.key} audienceKey={audience.key} path={audience.path} />
          ))}
        </div>
      </div>
    </section>
  );
};

const AudienceCard: React.FC<{ audienceKey: string; path?: string }> = ({ audienceKey, path }) => {
  const { t } = useTranslation();
  return (
    <article className="who-card">
      <h3>{t(`${WHO_PREFIX}.audiences.${audienceKey}.title`)}</h3>
      <p>{t(`${WHO_PREFIX}.audiences.${audienceKey}.body`)}</p>
      {path && (
        <Link className="who-link" to={path}>
          {t(`${WHO_PREFIX}.audiences.${audienceKey}.link`)}
        </Link>
      )}
    </article>
  );
};
