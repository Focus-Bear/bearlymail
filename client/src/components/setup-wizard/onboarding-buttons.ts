import type React from 'react';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

const FONT_WEIGHT_SEMIBOLD = 600;

/**
 * The orange "next step" button shared by every onboarding step. Disabled, it
 * turns grey with dark text: white on the pale orange it used before was about
 * 1.4:1 contrast and hard to read (#442); this is about 5:1.
 */
export const onboardingPrimaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '48px',
  padding: '0 22px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  border: `1.5px solid ${enabled ? TOK.sun : TOK.line2}`,
  background: enabled ? TOK.sun : TOK.cream3,
  color: enabled ? '#fff' : TOK.ink3,
  cursor: enabled ? 'pointer' : 'not-allowed',
  boxShadow: enabled ? 'inset 0 -1px 0 rgba(0,0,0,.12)' : 'none',
  transition: 'background .12s, border-color .12s, color .12s',
});
