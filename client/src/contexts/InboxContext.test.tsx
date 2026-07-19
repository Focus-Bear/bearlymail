/**
 * Tests for InboxContext — verifies consumer hooks throw when used outside provider.
 *
 * Issue #1225 (Critical Issue #1): Split useInboxState god hook → InboxContext provider
 */

import { renderHook } from '@testing-library/react';

import { useInboxActions, useInboxData, useInboxFiltersCtx, useInboxUI } from './InboxContext';

describe('InboxContext consumer hooks', () => {
  it('useInboxData throws when used outside InboxProvider', () => {
    expect(() => renderHook(() => useInboxData())).toThrow('useInboxData must be used inside InboxProvider');
  });

  it('useInboxUI throws when used outside InboxProvider', () => {
    expect(() => renderHook(() => useInboxUI())).toThrow('useInboxUI must be used inside InboxProvider');
  });

  it('useInboxActions throws when used outside InboxProvider', () => {
    expect(() => renderHook(() => useInboxActions())).toThrow('useInboxActions must be used inside InboxProvider');
  });

  it('useInboxFiltersCtx throws when used outside InboxProvider', () => {
    expect(() => renderHook(() => useInboxFiltersCtx())).toThrow(
      'useInboxFiltersCtx must be used inside InboxProvider'
    );
  });
});
