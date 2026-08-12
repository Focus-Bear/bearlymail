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
      <CompareSection />
      <FounderSection />
      <FaqSection />
      <GithubIntegrationSection />
      <FinalCta />
      <SiteFooter />
    </div>
  );
};

export default Landing;
