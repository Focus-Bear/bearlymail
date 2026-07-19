import React, { useEffect, useRef } from 'react';
import { theme } from 'theme/theme';

interface ResizableDividerProps {
  onResize: (newPosition: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  position: number; // Percentage (0-100)
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

interface UseDragListenersParams {
  isDraggingRef: React.MutableRefObject<boolean>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onResize: (newPosition: number) => void;
  onResizeEnd: () => void;
}

function useDragListeners({ isDraggingRef, containerRef, onResize, onResizeEnd }: UseDragListenersParams) {
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef?.current) {
        return;
      }
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const newPosition = ((event.clientX - containerRect.left) / containerRect.width) * 100;
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
      const touchX = event.touches[0].clientX - containerRect.left;
      onResize((touchX / containerRect.width) * 100);
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
  }, [onResize, onResizeEnd, containerRef, isDraggingRef]);
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

  useDragListeners({ isDraggingRef, containerRef, onResize, onResizeEnd });

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
