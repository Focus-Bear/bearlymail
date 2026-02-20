import React from 'react';
import { theme } from 'theme/theme';

interface EmailDetailAnimationOverlayProps {
  animationClass: string | null;
}

export const EmailDetailAnimationOverlay: React.FC<EmailDetailAnimationOverlayProps> = ({
  animationClass,
}) => {
  if (!animationClass) {
    return null;
  }

  return (
    <div className={animationClass} style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.background.paper,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: '5rem' }}>
        {animationClass.includes('poof') ? '💨' : animationClass.includes('priority') ? '🏗️' : '✈️'}
      </div>
    </div>
  );
};





