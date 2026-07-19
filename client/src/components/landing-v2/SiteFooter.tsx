import React from 'react';
import { useTranslation } from 'react-i18next';

export const SiteFooter: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="site">
      <div className="wrap row">
        <div className="brand footer-brand">
          <span className="brand-mark footer-brand-mark">
            <img src="/landing/bearlymail-mark.svg" alt="" />
          </span>
          {t('landing.v2.footer.copyright')}
        </div>
        <div className="links">
          <a href="/privacy">{t('landing.v2.footer.privacy')}</a>
          <a href="/terms">{t('landing.v2.footer.terms')}</a>
          <a href="mailto:support@focusbear.io">{t('landing.v2.footer.contact')}</a>
        </div>
      </div>
    </footer>
  );
};
