import React from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { theme } from 'theme/theme';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

interface EmojiData {
  native: string;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect }) => {
  return (
    <div
      style={{
        boxShadow: theme.shadows.lg,
        borderRadius: theme.borderRadius.lg,
        overflow: 'hidden',
      }}
    >
      <Picker
        data={data}
        onEmojiSelect={(emoji: EmojiData) => onSelect(emoji.native)}
        theme="light"
        previewPosition="none"
        skinTonePosition="search"
        maxFrequentRows={2}
        perLine={8}
      />
    </div>
  );
};
