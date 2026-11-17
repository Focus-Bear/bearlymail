import React from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';

import { useSetupWizardHistory } from './useSetupWizardHistory';

const STEPS = ['welcome', 'schedule', 'learning'] as const;
const CONSENT_SCREEN = '/provider-consent';

function renderWizardHistory() {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[CONSENT_SCREEN, '/inbox']} initialIndex={1}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => ({ wizard: useSetupWizardHistory(STEPS), location: useLocation(), navigate: useNavigate() }),
    { wrapper }
  );
}

describe('useSetupWizardHistory', () => {
  it('starts on the first step', () => {
    const { result } = renderWizardHistory();

    expect(result.current.wizard.currentStep).toBe('welcome');
  });

  it('Back (browser or in-wizard) returns to the previous step instead of leaving the app', () => {
    const { result } = renderWizardHistory();
    act(() => result.current.wizard.goToStep('schedule'));
    act(() => result.current.wizard.goToStep('learning'));
    expect(result.current.wizard.currentStep).toBe('learning');

    act(() => {
      void result.current.navigate(-1);
    });
    expect(result.current.wizard.currentStep).toBe('schedule');
    expect(result.current.location.pathname).toBe('/inbox');

    act(() => result.current.wizard.goBack());
    expect(result.current.wizard.currentStep).toBe('welcome');
    expect(result.current.location.pathname).toBe('/inbox');
  });

  it('rewinds its entries on completion so Back from the inbox does not land on old steps', async () => {
    const { result } = renderWizardHistory();
    act(() => result.current.wizard.goToStep('schedule'));
    act(() => result.current.wizard.goToStep('learning'));

    await act(async () => {
      const rewind = result.current.wizard.rewindWizardHistory();
      window.dispatchEvent(new PopStateEvent('popstate'));
      await rewind;
    });

    expect(result.current.wizard.currentStep).toBe('learning');
    act(() => {
      void result.current.navigate(-1);
    });
    expect(result.current.location.pathname).toBe(CONSENT_SCREEN);
  });
});
