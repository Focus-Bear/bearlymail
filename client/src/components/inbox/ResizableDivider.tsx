import React, { useEffect, useRef } from 'react';
import { theme } from 'theme/theme';

interface ResizableDividerProps {
  onResize: (newPosition: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  position: number; // Percentage (0-100)
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onResize,
  onResizeStart,
  onResizeEnd,
  position,
  containerRef,
}) => {
  const dividerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef?.current) {
        return;
      }

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = event.clientX - containerRect.left;

      // Calculate new position as percentage
      const newPosition = (mouseX / containerWidth) * 100;
      onResize(newPosition);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onResizeEnd();
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isDraggingRef.current || !containerRef?.current) {
        return;
      }
      event.preventDefault();

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const touch = event.touches[0];
      const touchX = touch.clientX - containerRect.left;

      const newPosition = (touchX / containerWidth) * 100;
      onResize(newPosition);
    };

    const handleTouchEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onResizeEnd();
      }
    };

    if (isDraggingRef.current) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onResize, onResizeEnd, containerRef]);

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    onResizeStart();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    onResizeStart();
  };

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{
        width: '4px',
        backgroundColor: theme.colors.border.light,
        cursor: 'col-resize',
        position: 'relative',
        flexShrink: 0,
        transition: 'background-color 0.2s ease',
        zIndex: 10,
      }}
      onMouseEnter={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.main;
      }}
      onMouseLeave={event => {
        if (!isDraggingRef.current) {
          event.currentTarget.style.backgroundColor = theme.colors.border.light;
        }
      }}
      role="separator"
      aria-label="Resizable divider"
      aria-orientation="vertical"
      aria-valuenow={position}
      aria-valuemin={20}
      aria-valuemax={80}
    />
  );
};
