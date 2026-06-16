import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { PriorityBand, PriorityRuleDto, UpsertPriorityRulePayload } from 'types/priority-rules.types';
import { PRIORITY_BANDS } from 'types/priority-rules.types';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { COLOR_WHITE } from 'constants/colors';

export interface PriorityRuleFormModalProps {
  open: boolean;
  /** Rule being edited, or null when adding a new one. */
  rule: PriorityRuleDto | null;
  onClose: () => void;
  onSubmit: (payload: UpsertPriorityRulePayload) => Promise<void>;
}

const linesToArray = (value: string): string[] =>
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  marginBottom: theme.spacing.xs,
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.sm,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  fontSize: theme.typography.fontSize.sm,
  boxSizing: 'border-box',
};

export const PriorityRuleFormModal: React.FC<PriorityRuleFormModalProps> = ({
  open,
  rule,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [senders, setSenders] = useState('');
  const [band, setBand] = useState<PriorityBand>('medium');
  const [subjectContains, setSubjectContains] = useState('');
  const [bodyContains, setBodyContains] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSenders(rule?.senders.join('\n') ?? '');
    setBand(rule?.band ?? 'medium');
    setSubjectContains(rule?.subjectContainsAny.join('\n') ?? '');
    setBodyContains(rule?.bodyContainsAny.join('\n') ?? '');
  }, [open, rule]);

  if (!open) {
    return null;
  }

  const senderList = linesToArray(senders);
  const canSave = senderList.length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        senders: senderList,
        band,
        subjectContainsAny: linesToArray(subjectContains),
        bodyContainsAny: linesToArray(bodyContains),
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10002}>
      <ModalContent>
        <ModalHeaderWithClose
          title={t(rule ? 'settings.priorityRules.editTitle' : 'settings.priorityRules.addTitle')}
          onClose={onClose}
        />

        <label style={labelStyle} htmlFor="priority-rule-senders">
          {t('settings.priorityRules.senderField')}
        </label>
        <textarea
          id="priority-rule-senders"
          value={senders}
          onChange={event => setSenders(event.target.value)}
          placeholder={t('settings.priorityRules.senderPlaceholder')}
          rows={3}
          style={{ ...fieldStyle, fontFamily: 'ui-monospace, monospace', marginBottom: theme.spacing.xs }}
        />
        <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, margin: `0 0 ${theme.spacing.md} 0` }}>
          {t('settings.priorityRules.senderHelp')}
        </p>

        <label style={labelStyle} htmlFor="priority-rule-band">
          {t('settings.priorityRules.bandField')}
        </label>
        <select
          id="priority-rule-band"
          value={band}
          onChange={event => setBand(event.target.value as PriorityBand)}
          style={{ ...fieldStyle, marginBottom: theme.spacing.md }}
        >
          {PRIORITY_BANDS.map(option => (
            <option key={option} value={option}>
              {t(`settings.priorityRules.bands.${option}`)}
            </option>
          ))}
        </select>

        <label style={labelStyle} htmlFor="priority-rule-subject">
          {t('settings.priorityRules.subjectField')}
        </label>
        <textarea
          id="priority-rule-subject"
          value={subjectContains}
          onChange={event => setSubjectContains(event.target.value)}
          rows={2}
          style={{ ...fieldStyle, marginBottom: theme.spacing.md }}
        />

        <label style={labelStyle} htmlFor="priority-rule-body">
          {t('settings.priorityRules.bodyField')}
        </label>
        <textarea
          id="priority-rule-body"
          value={bodyContains}
          onChange={event => setBodyContains(event.target.value)}
          rows={2}
          style={{ ...fieldStyle, marginBottom: theme.spacing.lg }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              background: theme.colors.background.paper,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSave}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.sm,
              border: 'none',
              background: canSave ? theme.colors.primary.main : theme.colors.border.medium,
              color: COLOR_WHITE,
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </ModalContent>
    </ModalBackdrop>,
    document.body
  );
};
