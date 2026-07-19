import React from 'react';
import { theme } from 'theme/theme';

import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { QuickActionItem } from 'components/quick-actions/QuickActionItem';
import { QuickActionsHeader } from 'components/quick-actions/QuickActionsHeader';

export interface SuggestedAction {
  type: string;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

interface QuickActionsMenuProps {
  actions: SuggestedAction[];
  onSelectAction: (action: SuggestedAction) => void;
  onClose: () => void;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({ actions, onSelectAction, onClose }) => {
  if (actions.length === 0) {
    return null;
  }

  const handleSelectAction = (action: SuggestedAction) => {
    onSelectAction(action);
    onClose();
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2000}>
      <ModalContent maxWidth="600px" maxHeight="80vh">
        <QuickActionsHeader onClose={onClose} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {actions.map(action => (
            <QuickActionItem
              key={`${action.type}-${action.confidence}-${action.reason}`}
              action={action}
              onSelect={handleSelectAction}
            />
          ))}
        </div>
      </ModalContent>
    </ModalBackdrop>
  );
};
