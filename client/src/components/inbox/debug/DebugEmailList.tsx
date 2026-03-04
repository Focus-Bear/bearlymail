import React from 'react';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore } from 'types/email';

import { COLOR_NAMED_RED } from 'constants/colors';

interface DebugEmailListProps {
  emails: Email[];
  mode: 'triage' | 'action' | 'follow-up';
}

/**
 * Debug email list component
 * Displays current tab emails with debug information
 */
export const DebugEmailList: React.FC<DebugEmailListProps> = ({ emails, mode }) => {
  const getBackgroundColor = (isArchived: boolean, isInWrongTab: boolean): string => {
    if (isArchived) return '#FFE6E6';
    if (isInWrongTab) return '#F8D7DA';
    return '#D1ECF1';
  };

  const getBorderColor = (isArchived: boolean, isInWrongTab: boolean): string => {
    if (isArchived || isInWrongTab) return '#F5C6CB';
    return '#BEE5EB';
  };

  return (
    <>
      <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0` }}>
        📧 Current Tab Emails ({emails.length})
      </h4>
      {emails.map((email) => {
        const starCount = email.starCount ?? 0;
        const shouldBeIn = starCount > 0 ? 'action' : 'triage';
        const isInWrongTab = shouldBeIn !== mode;
        const isArchived = email.isArchived ?? false;

        return (
          <div
            key={email.id}
            style={{
              padding: theme.spacing.xs,
              marginBottom: theme.spacing.xs,
              backgroundColor: getBackgroundColor(isArchived, isInWrongTab),
              border: `1px solid ${getBorderColor(isArchived, isInWrongTab)}`,
              borderRadius: theme.borderRadius.sm,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: theme.spacing.xs,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  flex: 1,
                  minWidth: '200px',
                  overflow: 'visible',
                }}
              >
                <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <strong>ThreadID:</strong> {email.threadId?.substring(0, 8)}...
                  <br />
                  <strong>EmailID:</strong> {email.id.substring(0, 8)}... |
                  <strong> StarCount:</strong> {starCount} |
                  <strong> Archived:</strong> {isArchived ? 'YES' : 'NO'}
                  <br />
                  <strong>Should be in:</strong> {shouldBeIn} |
                  <strong> Current tab:</strong> {mode} |
                  <strong> Priority:</strong> {getEmailPriorityScore(email).toFixed(1)}
                  {email.lastCheckedAt && (
                    <>
                      <br />
                      <strong>Last checked:</strong> {new Date(email.lastCheckedAt).toLocaleString()}
                    </>
                  )}
                  {isArchived && (
                    <span style={{ color: COLOR_NAMED_RED, fontWeight: 'bold' }}> ⚠️ ARCHIVED!</span>
                  )}
                  {isInWrongTab && !isArchived && (
                    <span style={{ color: COLOR_NAMED_RED, fontWeight: 'bold' }}> ❌ WRONG TAB!</span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    color: theme.colors.text.secondary,
                  }}
                >
                  {email.subject || '(No Subject)'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      {emails.length === 0 && (
        <div style={{ color: theme.colors.text.secondary }}>
          No threads to display in debug view
        </div>
      )}
    </>
  );
};

