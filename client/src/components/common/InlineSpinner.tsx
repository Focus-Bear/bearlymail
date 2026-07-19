import React from 'react';

interface InlineSpinnerProps {
  size?: number;
  color?: string;
}

/**
 * Minimal inline SVG spinner for use inside buttons and other compact UI elements.
 * Uses a CSS animation defined inline so no external stylesheet is required.
 */
export const InlineSpinner: React.FC<InlineSpinnerProps> = ({ size = 16, color = 'currentColor' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.5}
    aria-hidden="true"
    data-testid="inline-spinner"
    style={{
      animation: 'bearlymail-spin 0.8s linear infinite',
      flexShrink: 0,
      display: 'inline-block',
      verticalAlign: 'middle',
    }}
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
    <style>{`@keyframes bearlymail-spin { to { transform: rotate(360deg); } }`}</style>
  </svg>
);
