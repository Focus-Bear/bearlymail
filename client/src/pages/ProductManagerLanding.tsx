import React from 'react';

import {
  CompareSection,
  FaqSection,
  FinalCta,
  FounderSection,
  GithubIntegrationSection,
  HeroSection,
  HowItWorks,
  ProblemSection,
  SiteFooter,
  SiteHeader,
  WaitlistModal,
} from 'components/landing-v2';

import { LANDING_STYLES } from './Landing.styles';
import { useLandingFonts } from './useLandingFonts';

/**
 * Role-specific landing page for product managers. Reuses every shared
 * landing-v2 component; the hero copy + inbox-demo content come from the
 * landing.pm.* i18n namespace. Section order matches the default landing
 * (GitHub integration kept in its default after-FAQ slot — PMs care less
 * about CI/PR signal than engineering leaders do).
 */
const ProductManagerLanding: React.FC = () => {
  useLandingFonts();

  return (
    <div className="bearlymail-landing">
      <style>{LANDING_STYLES}</style>
      <SiteHeader />
      <HeroSection heroPrefix="landing.pm.hero" demoPrefix="landing.pm.demo" />
      <ProblemSection />
      <HowItWorks />
      <CompareSection />
      <FounderSection />
      <FaqSection />
      <GithubIntegrationSection />
      <FinalCta />
      <SiteFooter />
      <WaitlistModal />
    </div>
  );
};

export default ProductManagerLanding;
