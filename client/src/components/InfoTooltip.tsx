import React, { useState, useRef, useEffect } from 'react';
import { theme } from '../theme/theme';

interface InfoTooltipProps {
  content: string;
  children?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

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
        onClick={() => setIsVisible(!isVisible)}
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: theme.colors.accent.info,
          color: 'white',
          fontSize: '10px',
          fontWeight: theme.typography.fontWeight.bold,
          marginLeft: theme.spacing.xs,
          userSelect: 'none',
          transition: theme.transitions.default,
        }}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children || '?'}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          style={{
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
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      )}
    </div>
  );
};


