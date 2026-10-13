import type React from 'react';

import { ONBOARDING_TOKENS as TOK } from 'components/setup-wizard/onboarding-tokens';

const WEIGHT_SEMIBOLD = 600;
const WEIGHT_BOLD = 700;
const PENDING_OPACITY = 0.6;
const FULL_OPACITY = 1;

export const sectionStyle: React.CSSProperties = { marginTop: '4px', marginBottom: '8px' };

export const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '17px',
  fontWeight: WEIGHT_BOLD,
  letterSpacing: '-0.01em',
  color: TOK.ink,
};

export const sectionLedeStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '13.5px',
  lineHeight: 1.5,
  color: TOK.ink3,
};

export const statusTextStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: '13px', color: TOK.ink3 };

export const errorTextStyle: React.CSSProperties = { margin: '8px 0 0', fontSize: '13px', color: TOK.sunDark };

export const groupsStyle: React.CSSProperties = {
  display: 'grid',
  // minmax(0, …) lets long chips truncate instead of pushing the card wider than a phone screen.
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '10px',
};

export const groupCardStyle: React.CSSProperties = {
  minWidth: 0,
  padding: '14px 16px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '12px',
};

export const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '10px',
};

export const groupIconStyle: React.CSSProperties = { fontSize: '16px', lineHeight: 1 };

export const groupTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  fontWeight: WEIGHT_SEMIBOLD,
  color: TOK.ink,
};

export const groupCountStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontFamily: TOK.fontMono,
  fontSize: '12px',
  color: TOK.ink3,
};

export const emptyTextStyle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '13px',
  lineHeight: 1.5,
  color: TOK.ink3,
};

export const chipListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

export const chipStyle = (isPending: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  maxWidth: '100%',
  padding: '4px 4px 4px 10px',
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  borderRadius: '999px',
  fontSize: '13px',
  color: TOK.ink2,
  opacity: isPending ? PENDING_OPACITY : FULL_OPACITY,
});

export const chipLabelStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

export const kindTagStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '1px 7px',
  borderRadius: '999px',
  background: TOK.sunPale,
  color: TOK.sunDark,
  fontSize: '11px',
  fontWeight: WEIGHT_SEMIBOLD,
};

export const iconButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '24px',
  height: '24px',
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '999px',
  background: 'transparent',
  color: TOK.ink4,
};

export const editRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
};

export const textInputStyle: React.CSSProperties = {
  flex: '1 1 180px',
  minWidth: 0,
  height: '34px',
  padding: '0 10px',
  border: `1.5px solid ${TOK.sun}`,
  borderRadius: '8px',
  fontSize: '13.5px',
  fontFamily: 'inherit',
  color: TOK.ink,
  background: '#fff',
  outline: 'none',
};

export const selectStyle: React.CSSProperties = {
  height: '34px',
  padding: '0 8px',
  border: `1px solid ${TOK.line2}`,
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
  background: '#fff',
  color: TOK.ink2,
};

export const smallPrimaryButtonStyle = (isEnabled: boolean): React.CSSProperties => ({
  height: '34px',
  padding: '0 12px',
  border: 'none',
  borderRadius: '8px',
  background: isEnabled ? TOK.sun : TOK.sunPale2,
  color: '#fff',
  fontSize: '13px',
  fontWeight: WEIGHT_SEMIBOLD,
  cursor: isEnabled ? 'pointer' : 'not-allowed',
});

export const smallGhostButtonStyle: React.CSSProperties = {
  height: '34px',
  padding: '0 10px',
  border: 'none',
  borderRadius: '8px',
  background: 'transparent',
  color: TOK.ink3,
  fontSize: '13px',
  fontWeight: WEIGHT_SEMIBOLD,
};

export const groupFooterStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 12px',
  marginTop: '10px',
};

export const linkButtonStyle: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: TOK.sunDark,
  fontSize: '13px',
  fontWeight: WEIGHT_SEMIBOLD,
};
