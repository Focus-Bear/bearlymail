import type React from 'react';

import { ONBOARDING_TOKENS as TOK } from 'components/setup-wizard/onboarding-tokens';
import { VIEWPORT_HEIGHT_90, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';

export const FOCUS_RING_COLOR = TOK.sunPale2;

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(11, 11, 11, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: Z_INDEX_MODAL_OVERLAY,
  padding: '16px',
  fontFamily: TOK.fontSans,
  color: TOK.ink,
  WebkitFontSmoothing: 'antialiased',
};

export const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  borderRadius: '24px',
  boxShadow: TOK.shadowCard,
  padding: '36px 40px 28px',
  maxWidth: '640px',
  width: '100%',
  maxHeight: VIEWPORT_HEIGHT_90,
  overflowY: 'auto',
};

export const eyebrowStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: TOK.sunDark,
};

export const titleStyle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '26px',
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
  fontWeight: 700,
};

export const ledeStyle: React.CSSProperties = {
  margin: '0 0 20px',
  fontSize: '15px',
  lineHeight: 1.55,
  color: TOK.ink2,
};

export const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '0 0 16px',
  padding: 0,
  display: 'grid',
  gap: '8px',
};

export const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '36px 1fr',
  gap: '12px',
  alignItems: 'start',
  padding: '12px 14px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '12px',
};

export const rowIconStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  display: 'grid',
  placeItems: 'center',
  fontSize: '18px',
};

export const rowTitleStyle: React.CSSProperties = {
  margin: '1px 0 3px',
  fontSize: '14.5px',
  fontWeight: 600,
  color: TOK.ink,
};

export const rowBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.5,
  color: TOK.ink3,
};

export const tipsStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: TOK.sunPale,
  border: `1px solid ${TOK.sunPale2}`,
  borderRadius: '12px',
  marginBottom: '14px',
};

export const tipsTitleStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '14px',
  fontWeight: 700,
  color: TOK.ink,
};

export const tipsListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '20px',
  display: 'grid',
  gap: '6px',
};

export const tipItemStyle: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: 1.5,
  color: TOK.ink2,
};

export const securityStyle: React.CSSProperties = {
  margin: '0 0 22px',
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: TOK.ink3,
};

export const actionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  gap: '12px',
};

export const cancelButtonStyle: React.CSSProperties = {
  height: '52px',
  padding: '0 18px',
  borderRadius: '12px',
  border: `1.5px solid ${TOK.line2}`,
  background: '#fff',
  color: TOK.ink2,
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};
