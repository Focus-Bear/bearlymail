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
 * Role-specific landing page for engineering managers. Reuses every shared
 * landing-v2 component; the hero copy + the inbox-demo content come from the
 * landing.em.* i18n namespace, and the GitHub integration section is moved up
 * (before the comparison) to emphasise the bit engineering leaders care about
 * most.
 */
const EngineeringManagerLanding: React.FC = () => {
  useLandingFonts();

  return (
    <div className="bearlymail-landing">
      <style>{LANDING_STYLES}</style>
      <SiteHeader />
      <HeroSection heroPrefix="landing.em.hero" demoPrefix="landing.em.demo" />
      <GithubIntegrationSection />
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

export default EngineeringManagerLanding;
