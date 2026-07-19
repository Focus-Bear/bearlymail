import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { EmojiPicker } from 'components/rich-text/EmojiPicker';
import { Z_INDEX_POPUP } from 'constants/numbers';

import { ToolbarButton } from './ToolbarButtonGroup';

interface EmojiPickerPortalProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export const EmojiPickerPortal: React.FC<EmojiPickerPortalProps> = ({ onSelect, disabled = false }) => {
  const { t } = useTranslation();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ top: number; left: number } | null>(null);

  const updateEmojiPickerPosition = useCallback(() => {
    if (!emojiButtonRef.current) {
      return;
    }

    const triggerRect = emojiButtonRef.current.getBoundingClientRect();
    const pickerRect = emojiPickerRef.current?.getBoundingClientRect();

    const viewportPadding = 12;
    const pickerOffset = 8;
    const fallbackPickerWidth = 352;
    const fallbackPickerHeight = 435;
    const pickerWidth = pickerRect?.width || fallbackPickerWidth;
    const pickerHeight = pickerRect?.height || fallbackPickerHeight;
    const availableBottomSpace = window.innerHeight - triggerRect.bottom;
    const shouldOpenAbove = availableBottomSpace < pickerHeight + pickerOffset;

    const maxLeft = Math.max(viewportPadding, window.innerWidth - pickerWidth - viewportPadding);
    const nextLeft = Math.max(viewportPadding, Math.min(triggerRect.right - pickerWidth, maxLeft));
    const preferredTop = shouldOpenAbove
      ? triggerRect.top - pickerHeight - pickerOffset
      : triggerRect.bottom + pickerOffset;
    const maxTop = Math.max(viewportPadding, window.innerHeight - pickerHeight - viewportPadding);
    const nextTop = Math.max(viewportPadding, Math.min(preferredTop, maxTop));

    setEmojiPickerPosition(previousPosition => {
      if (previousPosition?.top === nextTop && previousPosition?.left === nextLeft) {
        return previousPosition;
      }
      return { top: nextTop, left: nextLeft };
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        emojiButtonRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  useLayoutEffect(() => {
    if (!showEmojiPicker) {
      setEmojiPickerPosition(null);
      return;
    }

    updateEmojiPickerPosition();
    const animationFrameId = window.requestAnimationFrame(updateEmojiPickerPosition);

    window.addEventListener('resize', updateEmojiPickerPosition);
    window.addEventListener('scroll', updateEmojiPickerPosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateEmojiPickerPosition);
      window.removeEventListener('scroll', updateEmojiPickerPosition, true);
    };
  }, [showEmojiPicker, updateEmojiPickerPosition]);

  return (
    <div ref={emojiButtonRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <ToolbarButton
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        isActive={showEmojiPicker}
        disabled={disabled}
        title={t('compose.toolbar.insertEmoji')}
      >
        <span style={{ fontSize: '14px' }}>😊</span>
      </ToolbarButton>
      {showEmojiPicker &&
        createPortal(
          <div
            ref={emojiPickerRef}
            style={{
              position: 'fixed',
              top: `${emojiPickerPosition?.top ?? 0}px`,
              left: `${emojiPickerPosition?.left ?? 0}px`,
              zIndex: Z_INDEX_POPUP,
              visibility: emojiPickerPosition ? 'visible' : 'hidden',
            }}
          >
            <EmojiPicker
              onSelect={emoji => {
                onSelect(emoji);
                setShowEmojiPicker(false);
              }}
            />
          </div>,
          document.body
        )}
    </div>
  );
};

export default EmojiPickerPortal;
