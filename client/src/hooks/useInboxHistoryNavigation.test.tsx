import React from 'react';
import { MemoryRouter, NavigateFunction, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';

import { useInboxHistoryNavigation } from './useInboxHistoryNavigation';
import { useInboxUrlSync } from './useInboxUrlSync';

const CONSENT_SCREEN = '/provider-consent';
const TRIAGE_LIST = '/inbox/triage';
const THREAD_A = '11111111-1111-4111-8111-111111111111';
const THREAD_B = '22222222-2222-4222-8222-222222222222';

function makeSplitView(selectedEmailId: string | null = null) {
  return { selectedEmailId, openEmail: vi.fn(), closeEmail: vi.fn() };
}

function renderInRouter<Result>(useHook: () => Result, initialEntries: string[]) {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => ({ hook: useHook(), location: useLocation(), navigationType: useNavigationType(), navigate: useNavigate() }),
    { wrapper }
  );
}

function goBack(navigate: NavigateFunction) {
  act(() => {
    navigate(-1);
  });
}

describe('useInboxHistoryNavigation', () => {
  it('pushes a history entry when switching tab, so Back returns to the previous tab', () => {
    const { result } = renderInRouter(
      () => useInboxHistoryNavigation({ basePath: '/inbox', mode: 'triage', splitView: makeSplitView() }),
      [CONSENT_SCREEN, TRIAGE_LIST]
    );

    act(() => result.current.hook.navigateToMode('action'));
    expect(result.current.location.pathname).toBe('/inbox/action');
    expect(result.current.navigationType).toBe('PUSH');

    goBack(result.current.navigate);
    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
  });

  it('pushes a history entry when opening a thread from the list', () => {
    const splitView = makeSplitView();
    const { result } = renderInRouter(
      () => useInboxHistoryNavigation({ basePath: '/inbox', mode: 'triage', splitView }),
      [CONSENT_SCREEN, TRIAGE_LIST]
    );

    act(() => result.current.hook.openEmailWithNavigate(THREAD_A));
    expect(splitView.openEmail).toHaveBeenCalledWith(THREAD_A);
    expect(result.current.location.pathname).toBe(`${TRIAGE_LIST}/${THREAD_A}`);
    expect(result.current.navigationType).toBe('PUSH');

    goBack(result.current.navigate);
    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
  });

  it('replaces the entry when moving between threads, so Back skips to the list', () => {
    let splitView = makeSplitView();
    const { result, rerender } = renderInRouter(
      () => useInboxHistoryNavigation({ basePath: '/inbox', mode: 'triage', splitView }),
      [CONSENT_SCREEN, TRIAGE_LIST]
    );
    act(() => result.current.hook.openEmailWithNavigate(THREAD_A));
    splitView = makeSplitView(THREAD_A);
    rerender();

    act(() => result.current.hook.openEmailWithNavigate(THREAD_B));
    expect(result.current.location.pathname).toBe(`${TRIAGE_LIST}/${THREAD_B}`);
    expect(result.current.navigationType).toBe('REPLACE');

    goBack(result.current.navigate);
    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
  });

  it('closes a pushed thread by stepping back instead of adding a duplicate list entry', () => {
    let splitView = makeSplitView();
    const { result, rerender } = renderInRouter(
      () => useInboxHistoryNavigation({ basePath: '/inbox', mode: 'triage', splitView }),
      [CONSENT_SCREEN, TRIAGE_LIST]
    );
    act(() => result.current.hook.openEmailWithNavigate(THREAD_A));
    splitView = makeSplitView(THREAD_A);
    rerender();

    act(() => result.current.hook.closeEmailWithNavigate());
    expect(splitView.closeEmail).toHaveBeenCalled();
    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
    expect(result.current.navigationType).toBe('POP');

    goBack(result.current.navigate);
    expect(result.current.location.pathname).toBe(CONSENT_SCREEN);
  });

  it('closes a deep-linked thread in place', () => {
    const splitView = makeSplitView(THREAD_A);
    const { result } = renderInRouter(
      () => useInboxHistoryNavigation({ basePath: '/inbox', mode: 'triage', splitView }),
      [CONSENT_SCREEN, `${TRIAGE_LIST}/${THREAD_A}`]
    );

    act(() => result.current.hook.closeEmailWithNavigate());
    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
    expect(result.current.navigationType).toBe('REPLACE');
  });
});

describe('landing on the inbox from an OAuth callback', () => {
  it('replaces the bare /inbox entry, adding nothing between the app and the consent screen', () => {
    const { result } = renderInRouter(() => {
      const navigate = useNavigate();
      useInboxUrlSync({
        isFocusedMode: false,
        mode: 'triage',
        splitViewSelectedEmailId: null,
        urlMode: undefined,
        urlThreadId: undefined,
        openEmail: vi.fn(),
        closeEmail: vi.fn(),
        navigate,
        onUrlModeChange: vi.fn(),
      });
    }, [CONSENT_SCREEN, '/inbox']);

    expect(result.current.location.pathname).toBe(TRIAGE_LIST);
    expect(result.current.navigationType).toBe('REPLACE');

    goBack(result.current.navigate);
    expect(result.current.location.pathname).toBe(CONSENT_SCREEN);
  });
});
