import React from 'react';
import { theme } from 'theme/theme';

interface MissingItem {
  threadId: string;
  reason: string;
  details: {
    starCount: number;
    emailCount: number;
    inGmail: boolean;
    subject: string;
  };
}

interface MissingFromProcessTabListProps {
  missingItems: MissingItem[];
}

const getMissingItemKey = (item: MissingItem, index: number): string => {
  return `missing-${item.threadId}-${index}`;
};

export const MissingFromProcessTabList: React.FC<MissingFromProcessTabListProps> = ({
  missingItems,
}) => {
  if (missingItems.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <h5 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: 'red' }}>
        ⚠️ Missing from Action Tab:
      </h5>
      {missingItems.map((item, index) => (
        <div
          key={getMissingItemKey(item, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: '#FFE6E6',
            border: '1px solid #F5C6CB',
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <div>
            <strong>Thread:</strong> {item.threadId}
          </div>
          <div>
            <strong>Reason:</strong> <span style={{ color: 'red' }}>{item.reason}</span>
          </div>
          <div>
            <strong>Details:</strong> Stars: {item.details.starCount} | Emails:{' '}
            {item.details.emailCount} | In Gmail: {item.details.inGmail ? '✅' : '❌'} |
            Subject: {item.details.subject}
          </div>
        </div>
      ))}
    </div>
  );
};






