import React, { useEffect } from 'react';

import {
  CompareSection,
  FaqSection,
  FinalCta,
  FounderSection,
  HeroSection,
  HowItWorks,
  ProblemSection,
  SiteFooter,
  SiteHeader,
  WaitlistModal,
} from 'components/landing-v2';

import { LANDING_STYLES } from './Landing.styles';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap';

function injectLink(rel: string, href: string, crossOrigin = false): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (crossOrigin) {
    link.crossOrigin = '';
  }
  document.head.appendChild(link);
  return link;
}

const Landing: React.FC = () => {
  useEffect(() => {
    const links = [
      injectLink('preconnect', 'https://fonts.googleapis.com'),
      injectLink('preconnect', 'https://fonts.gstatic.com', true),
      injectLink('stylesheet', FONTS_HREF),
    ];
    return () => {
      links.forEach(link => document.head.removeChild(link));
    };
  }, []);

  return (
    <div className="bearlymail-landing">
      <style>{LANDING_STYLES}</style>
      <SiteHeader />
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
      <CompareSection />
      <FounderSection />
      <FaqSection />
      <FinalCta />
      <SiteFooter />
      <WaitlistModal />
    </div>
  );
};

export default Landing;
