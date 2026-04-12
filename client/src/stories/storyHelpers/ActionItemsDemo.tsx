/**
 * ActionItemsDemo — stateful wrapper for ActionItemsSection stories.
 * Manages item list and new-item input state so stories stay declarative.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';

import { actionItemsI18n } from './i18nInstances';

export interface ActionItem {
  id?: string;
  description: string;
  isCompleted: boolean;
  source: string;
}

export interface ActionItemsDemoProps {
  initialItems?: ActionItem[];
  loading?: boolean;
}

export const ActionItemsDemo: React.FC<ActionItemsDemoProps> = ({ initialItems = [], loading = false }) => {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');

  const handleToggle = (id: string, completed: boolean) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, isCompleted: completed } : i)));
  const handleDelete = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const handleAdd = () => {
    if (!newItem.trim()) {
      return;
    }
    setItems(prev => [...prev, { id: `item-${Date.now()}`, description: newItem, isCompleted: false, source: 'user' }]);
    setNewItem('');
  };

  return (
    <I18nextProvider i18n={actionItemsI18n}>
      <div style={{ maxWidth: 640 }}>
        <ActionItemsSection
          actionItems={items}
          newActionItem={newItem}
          isGeneratingSummary={loading}
          onNewActionItemChange={setNewItem}
          onAddActionItem={handleAdd}
          onToggleActionItem={handleToggle}
          onDeleteActionItem={handleDelete}
          onExtractActions={() => console.log('Extract actions clicked')}
          onRegenerateActionItems={() => console.log('Regenerate clicked')}
        />
      </div>
    </I18nextProvider>
  );
};
