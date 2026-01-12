import React, { useState } from 'react';
import { theme } from 'theme/theme';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import {
  LandingHeader,
  HeroSection,
  IntroSection,
  HowItWorksSection,
  ComparisonSection,
  ClosingStatement,
  FounderStory,
  WaitlistForm,
  WaitlistSuccess,
} from 'components/landing';

/**
 * Landing page component
 * 
 * This is the main entry point for the landing page. It orchestrates
 * all sub-components following clean code principles:
 * 
 * - Single Responsibility: Main component only handles state and layout
 * - Composition: Uses smaller, focused components
 * - Separation of Concerns: Business logic in hooks, UI in components
 * 
 * Component Structure:
 * - LandingHeader: Navigation and branding
 * - HeroSection: Main headline and value proposition
 * - IntroSection: Origin story
 * - HowItWorksSection: Feature explanations
 * - ComparisonSection: Competitive differentiation
 * - ClosingStatement: Final CTA
 * - WaitlistForm: User signup form
 */
const Landing: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const { isMobile, isTablet } = useResponsiveBreakpoints();

  // Show success screen after form submission
  if (submitted) {
    return <WaitlistSuccess />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        width: '100%',
      }}
    >
      <LandingHeader />

      {/* Main Content - Two Columns */}
      <main
        style={{
          flex: 1,
          maxWidth: '1400px',
          margin: '0 auto',
          width: '100%',
          padding: (() => {
            if (isMobile) return theme.spacing.md;
            if (isTablet) return theme.spacing.lg;
            return theme.spacing.xl;
          })(),
          boxSizing: 'border-box',
          overflowX: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: (() => {
              if (isMobile) return '1fr';
              if (isTablet) return '1fr minmax(400px, 500px)';
              return '1fr minmax(400px, 450px)';
            })(),
            gap: (() => {
              if (isMobile) return theme.spacing.lg;
              return theme.spacing.xl;
            })(),
            alignItems: 'flex-start',
            minWidth: 0,
          }}
        >
          {/* Left Column: Content */}
          <div
            style={{
              minWidth: 0,
              maxWidth: '100%',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            <HeroSection />
            <IntroSection />
            <HowItWorksSection />
            <ComparisonSection />
            <ClosingStatement />
            <FounderStory />
          </div>

          {/* Right Column: Waitlist Form */}
          <WaitlistForm onSuccess={() => setSubmitted(true)} />
        </div>
      </main>
    </div>
  );
};

export default Landing;
