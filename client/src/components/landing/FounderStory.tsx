import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import {
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
} from './utils';

/**
 * Founder's story section component
 * Personal story from the founder about why BearlyMail was created
 */
export const FounderStory: React.FC = () => {
  const breakpoints = useResponsiveBreakpoints();

  const sectionMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xl,
    tablet: theme.spacing['2xl'],
    desktop: theme.spacing['3xl'],
  });

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const paragraphMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const quotePadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing['2xl'],
  });

  const photoSize = breakpoints.isMobile ? '80px' : breakpoints.isTablet ? '100px' : '120px';
  const photoMarginRight = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.xl,
  });

  const signatureFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const signatureMarginTop = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <section
      style={{
        marginBottom: sectionMarginBottom,
      }}
    >
      <h2
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
        }}
      >
        Founder's Note
      </h2>
      
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: quotePadding,
          borderLeft: `4px solid ${theme.colors.primary.main}`,
          position: 'relative',
        }}
      >
        {/* Photo at the top */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            flexDirection: breakpoints.isMobile ? 'column' : 'row',
          }}
        >
          <div
            style={{
              width: photoSize,
              height: photoSize,
              borderRadius: '50%',
              border: `3px solid ${theme.colors.primary.main}`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.primary.subtle,
              color: theme.colors.primary.main,
              fontSize: breakpoints.isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
            }}
          >
            JN
          </div>
          <div>
            <p
              style={{
                fontSize: signatureFontSize,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.xs,
                marginTop: 0,
              }}
            >
              Jeremy Nagel
            </p>
            <p
              style={{
                fontSize: bodyFontSize,
                color: theme.colors.text.secondary,
                marginBottom: 0,
              }}
            >
              Chief Bear Obeyer (CBO)
            </p>
          </div>
        </div>

        {/* Story content */}
        <div
          style={{
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            maxWidth: '100%',
          }}
        >
          {breakpoints.isMobile ? (
            // Short mobile version
            <>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  fontStyle: 'italic',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I felt like a prisoner to my emails.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I get 100 emails every day from collaborators, teammates, and automated systems. Email felt like a full-time job, but I knew if I stayed in my inbox, I'd get nothing else done.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I found it exciting to star emails but less interesting to act on them. When I looked at my starred list, I felt overwhelmed and couldn't figure out where to start.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: 0,
                  fontWeight: theme.typography.fontWeight.medium,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                So I built BearlyMail to prioritize my emails and hide distractions when I need to focus. Now I'm in control instead of drowning. 🐻
              </p>
            </>
          ) : (
            // Full desktop version
            <>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  fontStyle: 'italic',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I felt like a prisoner to my emails.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I get 100 emails every day—not spam newsletters, but actual emails from collaborators, teammates, and automated systems that all seem quite important. Email was feeling like a full-time job, but I knew if I stayed in my inbox, I'd get nothing else done.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I found it really exciting to go and look at new emails and star them, but less interesting to take action on them. When I looked at the list of starred emails, I felt overwhelmed. I couldn't figure out which one to start with.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                I wanted something that would prioritize my emails so I knew which ones I needed to reply to first. I wanted to actively hide new emails so I wouldn't get distracted—particularly on weekends when I want to focus on time with my family.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: paragraphMarginBottom,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                So I built BearlyMail. Now instead of email being a crushing burden, I'm actually in control. I know what needs my attention first, I can hide distractions when I need to focus, and I've reclaimed my weekends. My inbox went from being a source of anxiety to a tool that actually works for me.
              </p>
              <p
                style={{
                  fontSize: bodyFontSize,
                  color: theme.colors.text.secondary,
                  lineHeight: 1.8,
                  marginBottom: 0,
                  fontWeight: theme.typography.fontWeight.medium,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                }}
              >
                If you're drowning in email like I was, give BearlyMail a try. Your future self will thank you. 🐻
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

