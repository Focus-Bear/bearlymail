import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';

import { useReplyDiscardGuard } from './useReplyDiscardGuard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const renderGuard = (hasUnsentChanges: boolean) => {
  const closeComposer = vi.fn();
  const saveDraft = vi.fn().mockResolvedValue(undefined);
  const discardDraft = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(
    () => useReplyDiscardGuard({ hasUnsentChanges, closeComposer, saveDraft, discardDraft }),
    { wrapper }
  );
  return { result, closeComposer, saveDraft, discardDraft };
};

const clickInternalLink = (href: string) => {
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  document.body.appendChild(anchor);
  act(() => {
    anchor.click();
  });
  anchor.remove();
};

describe('useReplyDiscardGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes straight away when there is nothing to lose', () => {
    const { result, closeComposer } = renderGuard(false);
    act(() => result.current.requestClose());
    expect(closeComposer).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('asks instead of closing when the reply has unsent changes', () => {
    const { result, closeComposer } = renderGuard(true);
    act(() => result.current.requestClose());
    expect(result.current.isConfirmOpen).toBe(true);
    expect(closeComposer).not.toHaveBeenCalled();
  });

  it('"Keep editing" dismisses the question and leaves the reply open', () => {
    const { result, closeComposer, saveDraft, discardDraft } = renderGuard(true);
    act(() => result.current.requestClose());
    act(() => result.current.keepEditing());
    expect(result.current.isConfirmOpen).toBe(false);
    expect(closeComposer).not.toHaveBeenCalled();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(discardDraft).not.toHaveBeenCalled();
  });

  it('"Save draft" saves, then closes', async () => {
    const { result, closeComposer, saveDraft, discardDraft } = renderGuard(true);
    act(() => result.current.requestClose());
    await act(() => result.current.saveAndLeave());
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(discardDraft).not.toHaveBeenCalled();
    expect(closeComposer).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(closeComposer.mock.invocationCallOrder[0]);
  });

  it('"Discard" deletes the saved draft, then closes', async () => {
    const { result, closeComposer, saveDraft, discardDraft } = renderGuard(true);
    act(() => result.current.requestClose());
    await act(() => result.current.discardAndLeave());
    expect(discardDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).not.toHaveBeenCalled();
    expect(closeComposer).toHaveBeenCalledTimes(1);
  });

  it('asks before following an in-app link, and only navigates after the reply is closed', async () => {
    const { result, closeComposer, discardDraft } = renderGuard(true);
    clickInternalLink('/settings');
    expect(result.current.isConfirmOpen).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(() => result.current.discardAndLeave());

    expect(discardDraft).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
    expect(closeComposer.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
  });

  it('"Keep editing" after a link click stays on the page', () => {
    const { result } = renderGuard(true);
    clickInternalLink('/settings');
    act(() => result.current.keepEditing());
    expect(result.current.isConfirmOpen).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('lets links through when there is nothing to lose', () => {
    const { result } = renderGuard(false);
    clickInternalLink('/settings');
    expect(result.current.isConfirmOpen).toBe(false);
  });
});
