/**
 * PrivateNotesDemo — stateful wrapper for PrivateNotesSection stories.
 * Manages note content and collapsed state.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';

import { privateNotesI18n } from './i18nInstances';

export interface PrivateNotesDemoProps {
  initialContent?: string;
  defaultCollapsed?: boolean;
}

export const PrivateNotesDemo: React.FC<PrivateNotesDemoProps> = ({
  initialContent = '',
  defaultCollapsed = false,
}) => {
  const [content, setContent] = useState(initialContent);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <I18nextProvider i18n={privateNotesI18n}>
      <div style={{ maxWidth: 640 }}>
        <PrivateNotesSection
          noteContent={content}
          notesCollapsed={collapsed}
          onNoteContentChange={setContent}
          onToggleCollapsed={() => setCollapsed(prev => !prev)}
          onSaveNote={() => console.log('Note saved:', content)}
        />
      </div>
    </I18nextProvider>
  );
};
