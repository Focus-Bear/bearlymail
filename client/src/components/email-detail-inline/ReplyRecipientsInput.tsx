import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ReplyRecipientsInputProps {
  replyRecipients: string;
  onRecipientsChange: (recipients: string) => void;
}

export const ReplyRecipientsInput: React.FC<ReplyRecipientsInputProps> = ({
  replyRecipients,
  onRecipientsChange,
}) => {
  const { t } = useTranslation();
  
  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <label style={{ 
        display: 'block', 
        fontSize: theme.typography.fontSize.sm, 
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.xs,
      }}>
        {t('compose.to')}:
      </label>
      <input
        type="text"
        value={replyRecipients}
        onChange={(e) => onRecipientsChange(e.target.value)}
        style={{
          width: '100%',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          outline: 'none',
        }}
        placeholder={t('compose.recipientPlaceholder')}
      />
    </div>
  );
};



