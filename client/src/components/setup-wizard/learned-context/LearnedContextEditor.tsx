import React, { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { groupLearnedContext, LEARNED_GROUPS } from './learned-context';
import * as styles from './learned-context.styles';
import { LearnedContextGroup } from './LearnedContextGroup';
import { LOAD_STATUS_ERROR, LOAD_STATUS_LOADING, LOAD_STATUS_READY, useLearnedContext } from './useLearnedContext';

interface LearnedContextEditorProps {
  /** Becomes true once the onboarding analysis has finished writing what it learned. */
  isEnabled: boolean;
}

/**
 * "Here's what we learned" on the onboarding learning step: what matters to
 * the user, their current projects and their key email categories, each
 * editable inline so a bad guess is fixed before it shapes the inbox.
 */
export const LearnedContextEditor: React.FC<LearnedContextEditorProps> = ({ isEnabled }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const { items, loadStatus, hasSaveError, addItem, updateItem, removeItem } = useLearnedContext(isEnabled);
  const grouped = useMemo(() => groupLearnedContext(items), [items]);

  if (!isEnabled) {
    return null;
  }

  return (
    <section aria-labelledby={titleId} style={styles.sectionStyle} data-testid="learned-context-editor">
      <h2 id={titleId} style={styles.sectionTitleStyle}>
        {t('setupWizard.learned.title')}
      </h2>
      <p style={styles.sectionLedeStyle}>{t('setupWizard.learned.lede')}</p>

      {loadStatus === LOAD_STATUS_LOADING && <p style={styles.statusTextStyle}>{t('setupWizard.learned.loading')}</p>}
      {loadStatus === LOAD_STATUS_ERROR && (
        <p role="alert" style={styles.errorTextStyle}>
          {t('setupWizard.learned.loadError')}
        </p>
      )}
      {loadStatus === LOAD_STATUS_READY && (
        <div style={styles.groupsStyle}>
          {LEARNED_GROUPS.map(group => (
            <LearnedContextGroup
              key={group.id}
              group={group}
              items={grouped[group.id]}
              onAdd={addItem}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}
      {hasSaveError && (
        <p role="alert" style={styles.errorTextStyle}>
          {t('setupWizard.learned.saveError')}
        </p>
      )}
    </section>
  );
};
