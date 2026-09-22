import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeDuration } from 'utils/parseDuration';

import { BulkActionButton } from 'components/inbox/bulk/BulkActionButton';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { SNOOZE_PREVIEW_KEYS } from 'constants/snooze';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

const inputStyle: React.CSSProperties = {
  padding: theme.spacing.xs,
  borderRadius: theme.borderRadius.sm,
  border: STRING_NONE,
  fontSize: theme.typography.fontSize.sm,
  width: '160px',
  outline: 'none',
};

const previewStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: COLOR_NAMED_WHITE,
  opacity: OPACITY_DISABLED,
  whiteSpace: 'nowrap',
};

interface BulkSnoozeFormProps {
  onConfirm: (duration: string) => void;
  onCancel: () => void;
}

/**
 * Duration entry for snoozing the whole selection. Kept separate from the
 * per-email SnoozeInputForm because it sits on the dark bulk bar and has no
 * single email to report against, but it shares the parser and the live
 * "Reappears …" preview so both forms read a duration the same way.
 */
export const BulkSnoozeForm: React.FC<BulkSnoozeFormProps> = ({ onConfirm, onCancel }) => {
  const { t, i18n } = useTranslation();
  const [duration, setDuration] = useState('');
  const hasDuration = duration.trim().length > 0;

  const preview = useMemo(
    () => humanizeDuration(duration, i18n.language, undefined, SNOOZE_PREVIEW_KEYS),
    [duration, i18n.language]
  );
  const humanizedPreview = preview ? t(preview.i18nKey, preview.values) : null;

  const confirmSnooze = () => {
    if (hasDuration) {
      onConfirm(duration.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      confirmSnooze();
    }
    if (event.key === KEY_ESCAPE) {
      onCancel();
    }
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
      <span style={{ fontSize: theme.typography.fontSize.sm, whiteSpace: 'nowrap' }}>
        {t('emailActions.snoozeUntil')}
      </span>
      <input
        type="text"
        data-testid="bulk-snooze-input"
        placeholder={t('emailActions.snoozePlaceholder')}
        autoFocus
        value={duration}
        onChange={event => setDuration(event.target.value)}
        onKeyDown={handleKeyDown}
        title={t('emailActions.snoozeTooltip')}
        style={inputStyle}
      />
      {humanizedPreview && (
        <span data-testid="bulk-snooze-preview" style={previewStyle}>
          {humanizedPreview}
        </span>
      )}
      <BulkActionButton
        onClick={confirmSnooze}
        disabled={!hasDuration}
        style={{ opacity: hasDuration ? OPACITY_FULL : OPACITY_DISABLED }}
      >
        {t('common.confirm')}
      </BulkActionButton>
      <BulkActionButton onClick={onCancel}>{t('common.cancel')}</BulkActionButton>
    </div>
  );
};
