import React, { useRef, useState } from 'react';
import { FiInfo } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_WHITE } from 'constants/colors';

const TOOLTIP_HIDE_DELAY_MS = 150;

interface InfoTooltipProps {
  text: string;
}

/**
 * Hoverable info icon that shows a tooltip with explanatory text.
 * Delays hide to allow mouse to move between icon and tooltip.
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setVisible(true);
  };

  const hide = () => {
    timerRef.current = setTimeout(() => setVisible(false), TOOLTIP_HIDE_DELAY_MS);
  };

  return (
    <span
      data-testid="info-tooltip-trigger"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <FiInfo
        size={13}
        style={{ color: theme.colors.text.tertiary, cursor: 'help', flexShrink: 0 }}
        aria-label="info"
      />
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme.colors.text.primary,
            color: COLOR_WHITE,
            padding: '6px 10px',
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            whiteSpace: 'normal',
            width: '220px',
            zIndex: 999,
            lineHeight: 1.4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};
