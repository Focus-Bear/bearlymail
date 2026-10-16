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
  WhyNotClaudeSection,
} from 'components/landing-v2';

import { LANDING_STYLES } from './Landing.styles';
import { useLandingFonts } from './useLandingFonts';

const Landing: React.FC = () => {
  useLandingFonts();

  return (
    <div className="bearlymail-landing">
      <style>{LANDING_STYLES}</style>
      <SiteHeader />
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
      <WhoItsForSection />
      <CompareSection />
      <WhyNotClaudeSection />
      <SecuritySection />
      <FounderSection />
      <FaqSection />
      <FinalCta />
      <SiteFooter />
    </div>
  );
};

export default Landing;
