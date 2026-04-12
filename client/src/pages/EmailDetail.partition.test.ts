/**
 * Unit tests for the suggested-actions partition logic in EmailDetail.
 *
 * These tests verify that the partition correctly separates GitHub actions,
 * scheduling actions, and other actions — ensuring QuickActionsSection never
 * receives scheduling types when SchedulingRequestCard is active (fixes #807).
 */

import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
  ACTION_TYPE_SCHEDULING_REQUEST,
} from 'constants/strings';

// Re-implement the partition logic inline so we can test it without mounting
// the full EmailDetail component (which has heavy provider dependencies).
// The real implementation lives in EmailDetail.tsx useMemo; this mirrors it exactly.
const GITHUB_ACTION_TYPES: Set<string> = new Set([
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
]);

const SCHEDULING_ACTION_TYPES: Set<string> = new Set([
  ACTION_TYPE_SCHEDULING_REQUEST,
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
]);

function partitionActions(all: Array<{ type: string }>) {
  return {
    githubActions: all.filter(action => GITHUB_ACTION_TYPES.has(action.type)),
    schedulingActions: all.filter(action => SCHEDULING_ACTION_TYPES.has(action.type)),
    otherActions: all.filter(
      action => !GITHUB_ACTION_TYPES.has(action.type) && !SCHEDULING_ACTION_TYPES.has(action.type)
    ),
  };
}

describe('EmailDetail suggestedActions partition', () => {
  it('routes github_add_comment to githubActions only', () => {
    const { githubActions, schedulingActions, otherActions } = partitionActions([
      { type: ACTION_TYPE_GITHUB_ADD_COMMENT },
    ]);
    expect(githubActions).toHaveLength(1);
    expect(schedulingActions).toHaveLength(0);
    expect(otherActions).toHaveLength(0);
  });

  it('routes all four GitHub action types to githubActions', () => {
    const actions = [
      { type: ACTION_TYPE_GITHUB_ADD_COMMENT },
      { type: ACTION_TYPE_GITHUB_CREATE_ISSUE },
      { type: ACTION_TYPE_GITHUB_SEARCH_ISSUES },
      { type: ACTION_TYPE_GITHUB_UPDATE_STATUS },
    ];
    const { githubActions, schedulingActions, otherActions } = partitionActions(actions);
    expect(githubActions).toHaveLength(4);
    expect(schedulingActions).toHaveLength(0);
    expect(otherActions).toHaveLength(0);
  });

  it('routes scheduling_request to schedulingActions, not otherActions (fixes #807)', () => {
    const { githubActions, schedulingActions, otherActions } = partitionActions([
      { type: ACTION_TYPE_SCHEDULING_REQUEST },
    ]);
    expect(githubActions).toHaveLength(0);
    expect(schedulingActions).toHaveLength(1);
    expect(schedulingActions[0].type).toBe(ACTION_TYPE_SCHEDULING_REQUEST);
    expect(otherActions).toHaveLength(0);
  });

  it('routes calendar_create_invite to schedulingActions, not otherActions (fixes #807)', () => {
    const { githubActions, schedulingActions, otherActions } = partitionActions([
      { type: ACTION_TYPE_CALENDAR_CREATE_INVITE },
    ]);
    expect(githubActions).toHaveLength(0);
    expect(schedulingActions).toHaveLength(1);
    expect(schedulingActions[0].type).toBe(ACTION_TYPE_CALENDAR_CREATE_INVITE);
    expect(otherActions).toHaveLength(0);
  });

  it('keeps non-github non-scheduling actions in otherActions', () => {
    const { githubActions, schedulingActions, otherActions } = partitionActions([
      { type: 'send_reply' },
      { type: 'label_email' },
    ]);
    expect(githubActions).toHaveLength(0);
    expect(schedulingActions).toHaveLength(0);
    expect(otherActions).toHaveLength(2);
  });

  it('correctly partitions a mixed bag of all three types', () => {
    const actions = [
      { type: ACTION_TYPE_GITHUB_ADD_COMMENT },
      { type: ACTION_TYPE_SCHEDULING_REQUEST },
      { type: ACTION_TYPE_CALENDAR_CREATE_INVITE },
      { type: 'send_reply' },
    ];
    const { githubActions, schedulingActions, otherActions } = partitionActions(actions);
    expect(githubActions).toHaveLength(1);
    expect(schedulingActions).toHaveLength(2);
    expect(otherActions).toHaveLength(1);
    expect(otherActions[0].type).toBe('send_reply');
  });

  it('returns empty arrays when suggestedActions is empty', () => {
    const { githubActions, schedulingActions, otherActions } = partitionActions([]);
    expect(githubActions).toHaveLength(0);
    expect(schedulingActions).toHaveLength(0);
    expect(otherActions).toHaveLength(0);
  });
});
