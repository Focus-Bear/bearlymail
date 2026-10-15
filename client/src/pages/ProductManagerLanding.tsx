import React from 'react';

import {
  CompareSection,
  FaqSection,
  FinalCta,
  FounderSection,
  HeroSection,
  HowItWorks,
  ProblemSection,
  SecuritySection,
  SiteFooter,
  SiteHeader,
  WhoItsForSection,
} from 'components/landing-v2';

import { LANDING_STYLES } from './Landing.styles';
import { useLandingFonts } from './useLandingFonts';

/**
 * Role-specific landing page for product managers. Reuses every shared
 * landing-v2 component; the hero copy + inbox-demo content come from the
 * landing.pm.* i18n namespace. Section order matches the default landing; the
 * GitHub integration section stays on the engineering-manager page only.
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
      <WhoItsForSection />
      <CompareSection />
      <SecuritySection />
      <FounderSection />
      <FaqSection />
      <FinalCta />
      <SiteFooter />
    </div>
  );
};

export default ProductManagerLanding;
