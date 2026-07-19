import React from 'react';
import { theme } from 'theme/theme';

interface ModalBackdropProps {
  onClose: () => void;
  zIndex?: number;
  children: React.ReactNode;
}

export const ModalBackdrop: React.FC<ModalBackdropProps> = ({ onClose, zIndex = 2000, children }) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.overlay.dark,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
      }}
      onClick={onClose}
    >
      {children}
    </div>
  );
};
