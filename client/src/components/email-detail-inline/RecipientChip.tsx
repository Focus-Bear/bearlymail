import React from 'react';
import { theme } from 'theme/theme';

import { STRING_NONE } from 'constants/strings';

interface RecipientChipProps {
  tag: string;
  index: number;
  onRemove: (index: number) => void;
  /** When true the chip can be dragged to another recipient field */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}

export const RecipientChip: React.FC<RecipientChipProps> = ({
  tag,
  index,
  onRemove,
  draggable = false,
  onDragStart,
}) => (
  <span
    key={tag}
    draggable={draggable}
    onDragStart={onDragStart}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      backgroundColor: theme.colors.primary.subtle,
      color: theme.colors.primary.main,
      borderRadius: theme.borderRadius.sm,
      fontSize: theme.typography.fontSize.xs,
      maxWidth: '200px',
      cursor: draggable ? 'grab' : 'default',
    }}
  >
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        onRemove(index);
      }}
      style={{
        background: STRING_NONE,
        border: STRING_NONE,
        padding: 0,
        cursor: 'pointer',
        color: theme.colors.primary.main,
        fontSize: '14px',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      &times;
    </button>
  </span>
);

export default RecipientChip;
