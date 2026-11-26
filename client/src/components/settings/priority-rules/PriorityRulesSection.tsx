import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { PriorityRuleDto, UpsertPriorityRulePayload } from 'types/priority-rules.types';

import { ConfirmModal } from 'components/ConfirmModal';
import { CollapsibleSettingsSection, SectionHeaderActionButton } from 'components/settings/CollapsibleSettingsSection';
import { PriorityRuleFormModal } from 'components/settings/priority-rules/PriorityRuleFormModal';
import { PriorityRulesPanel } from 'components/settings/priority-rules/PriorityRulesPanel';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { useNotifications } from 'contexts/NotificationContext';
import { usePriorityRules } from 'hooks/settings/usePriorityRules';

/**
 * Settings section for deterministic priority rules: lists auto-mined and
 * user-created rules, and supports create / edit / enable-disable / delete.
 * Editing a mined rule converts it to user-managed (the miner then leaves it).
 */
export const PriorityRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { rules, loading, createRule, updateRule, setEnabled, deleteRule } = usePriorityRules();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PriorityRuleDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriorityRuleDto | null>(null);

  const handleToggle = useCallback(
    async (id: string, nextEnabled: boolean) => {
      try {
        await setEnabled(id, nextEnabled);
        showSuccess(t('settings.priorityRules.toggleSuccess'));
      } catch {
        showError(t('settings.priorityRules.toggleError'));
      }
    },
    [setEnabled, showError, showSuccess, t]
  );

  const openAdd = useCallback(() => {
    setEditingRule(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((rule: PriorityRuleDto) => {
    setEditingRule(rule);
    setFormOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (payload: UpsertPriorityRulePayload) => {
      try {
        if (editingRule) {
          await updateRule(editingRule.id, payload);
          showSuccess(t('settings.priorityRules.updateSuccess'));
        } else {
          await createRule(payload);
          showSuccess(t('settings.priorityRules.createSuccess'));
        }
        setFormOpen(false);
        setEditingRule(null);
      } catch {
        showError(t('settings.priorityRules.saveError'));
      }
    },
    [createRule, editingRule, showError, showSuccess, t, updateRule]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteRule(deleteTarget.id);
      showSuccess(t('settings.priorityRules.deleteSuccess'));
    } catch {
      showError(t('settings.priorityRules.deleteError'));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteRule, deleteTarget, showError, showSuccess, t]);

  return (
    <>
      <CollapsibleSettingsSection
        anchorId={SETTINGS_ANCHORS.PRIORITY_RULES}
        title={t('settings.priorityRules.sectionTitle')}
        itemCount={loading ? undefined : rules.length}
        headerAction={<SectionHeaderActionButton label={t('settings.priorityRules.addRule')} onClick={openAdd} />}
      >
        {loading ? (
          <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
            {t('common.loading')}
          </p>
        ) : (
          <PriorityRulesPanel
            rules={rules}
            onToggleEnabled={handleToggle}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        )}
      </CollapsibleSettingsSection>

      <PriorityRuleFormModal
        open={formOpen}
        rule={editingRule}
        onClose={() => {
          setFormOpen(false);
          setEditingRule(null);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('settings.priorityRules.deleteTitle')}
        message={t('settings.priorityRules.deleteConfirm', { sender: deleteTarget?.sender ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
};
