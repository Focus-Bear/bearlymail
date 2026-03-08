import React from 'react';
import { theme } from 'theme/theme';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_CALENDAR_FIND_EVENTS,
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
  CALENDAR_ACTION_PREFIX,
  GITHUB_ACTION_PREFIX,
} from 'constants/strings';

interface QuickActionItemProps {
  action: SuggestedAction;
  onSelect: (action: SuggestedAction) => void;
}

const getActionIcon = (type: string): string => {
  if (type.startsWith(GITHUB_ACTION_PREFIX)) {
    if (type === ACTION_TYPE_GITHUB_CREATE_ISSUE) {
      return '🐛';
    }
    if (type === ACTION_TYPE_GITHUB_UPDATE_STATUS) {
      return '🔄';
    }
    if (type === ACTION_TYPE_GITHUB_ADD_COMMENT) {
      return '💬';
    }
    if (type === ACTION_TYPE_GITHUB_SEARCH_ISSUES) {
      return '🔍';
    }
    return '🐙';
  }
  if (type.startsWith(CALENDAR_ACTION_PREFIX)) {
    if (type === ACTION_TYPE_CALENDAR_CREATE_INVITE) {
      return '📅';
    }
    if (type === ACTION_TYPE_CALENDAR_FIND_EVENTS) {
      return '🔎';
    }
    return '📆';
  }
  return '⚡';
};

const getActionTitle = (type: string): string => {
  if (type === ACTION_TYPE_GITHUB_CREATE_ISSUE) {
    return 'Create GitHub Issue';
  }
  if (type === ACTION_TYPE_GITHUB_UPDATE_STATUS) {
    return 'Update Issue Status';
  }
  if (type === ACTION_TYPE_GITHUB_ADD_COMMENT) {
    return 'Add Comment to Issue';
  }
  if (type === ACTION_TYPE_GITHUB_SEARCH_ISSUES) {
    return 'Search Similar Issues';
  }
  if (type === ACTION_TYPE_CALENDAR_CREATE_INVITE) {
    return 'Create Calendar Invite';
  }
  if (type === ACTION_TYPE_CALENDAR_FIND_EVENTS) {
    return 'Find Calendar Events';
  }
  return 'Action';
};

export const QuickActionItem: React.FC<QuickActionItemProps> = ({ action, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(action)}
      style={{
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.default,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        textAlign: 'left',
        transition: theme.transitions.fast,
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
      }}
      onMouseEnter={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
        event.currentTarget.style.borderColor = theme.colors.primary.main;
      }}
      onMouseLeave={event => {
        event.currentTarget.style.backgroundColor = theme.colors.background.default;
        event.currentTarget.style.borderColor = theme.colors.border.medium;
      }}
    >
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{getActionIcon(action.type)}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.base,
          }}
        >
          {getActionTitle(action.type)}
        </div>
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            lineHeight: theme.typography.lineHeight.relaxed,
          }}
        >
          {action.reason}
        </div>
      </div>
    </button>
  );
};
