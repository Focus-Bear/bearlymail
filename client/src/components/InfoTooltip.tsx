import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { KEY_ENTER, KEY_ESCAPE, KEY_SPACE } from 'constants/strings';

const HIDE_DELAY_MS = 300;

const triggerStyle: React.CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  backgroundColor: theme.colors.accent.info,
  color: theme.colors.common.white,
  fontSize: '10px',
  fontWeight: theme.typography.fontWeight.bold,
  marginLeft: theme.spacing.xs,
  userSelect: 'none',
  transition: theme.transitions.default,
};

const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: theme.spacing.xs,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.sm,
  boxShadow: theme.shadows.lg,
  zIndex: 1000,
  minWidth: '200px',
  maxWidth: '300px',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
  lineHeight: theme.typography.lineHeight.normal,
};

interface InfoTooltipProps {
  content: string;
  children?: React.ReactNode;
}

/**
 * Info icon with a hoverable tooltip. Hiding is delayed so the pointer can
 * travel from the icon into the tooltip body (e.g. to click a link inside it);
 * entering either the icon or the tooltip cancels the scheduled hide.
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledHide = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    cancelScheduledHide();
    setIsVisible(true);
  }, [cancelScheduledHide]);

  const scheduleHide = useCallback(() => {
    cancelScheduledHide();
    hideTimeoutRef.current = setTimeout(() => setIsVisible(false), HIDE_DELAY_MS);
  }, [cancelScheduledHide]);

  useEffect(() => cancelScheduledHide, [cancelScheduledHide]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        triggerRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isVisible]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={isVisible}
        onClick={() => {
          cancelScheduledHide();
          setIsVisible(previous => !previous);
        }}
        onKeyDown={event => {
          if (event.key === KEY_ESCAPE) {
            cancelScheduledHide();
            setIsVisible(false);
          } else if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
            event.preventDefault();
            cancelScheduledHide();
            setIsVisible(previous => !previous);
          }
        }}
        style={triggerStyle}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        {children || '?'}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          style={tooltipStyle}
          onClick={event => event.stopPropagation()}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          {content}
        </div>
      )}
    </div>
  );
};
