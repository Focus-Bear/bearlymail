import { Page } from '@playwright/test';

/**
 * Number of consecutive taps required to pay the Triage "tap tax" and unlock the
 * inbox. Mirrors DISTRACTION_TAP_TARGET in
 * client/src/constants/distractionFriction.ts — e2e cannot import client paths,
 * so the value is duplicated here. The final (30th) tap fires the unlock, which
 * closes the friction modal and triggers the inbox's real post-unlock fetch.
 */
export const DISTRACTION_TAP_TARGET = 30;

export interface DismissDistractionGateOptions {
  /**
   * Invoked immediately BEFORE the final (unlock) tap — i.e. after all taxing
   * taps but before the tap that fires `completeUnlock` and the inbox's real
   * post-unlock fetch. Perf tests use this hook to reset network trackers / start
   * timers so the gated-phase requests don't pollute the steady-state
   * measurement. No-op for ordinary callers.
   */
  onBeforeFinalTap?: () => void | Promise<void>;
}

/**
 * Dismiss the Triage "distraction tax" gate when it is present.
 *
 * This branch adds an entry gate (data-testid `triage-entry-gate`) plus a
 * friction exercise (data-testid `distraction-friction`) that render INLINE in
 * place of the Triage email list whenever the account has unfinished
 * Action/Follow-Up work; the list is not rendered until the gate is paid, so it
 * must be dismissed before interacting with the list. It also RE-LOCKS whenever
 * the user leaves Triage and returns — so call this after every (re)entry to the
 * inbox before interacting with the list.
 *
 * No-op when the gate never appears (accounts with no pending work never see it).
 */
export async function dismissDistractionGate(
  page: Page,
  options: DismissDistractionGateOptions = {},
): Promise<void> {
  const gate = page.getByTestId('triage-entry-gate');
  // The gate renders only after tabCounts finish loading (async), which lags the
  // /inbox navigation. Actually WAIT for it to appear — isVisible() checks once
  // and would miss a gate that's about to render (that was the original bug). If
  // it never appears within the window, the account has no pending work and there
  // is nothing to dismiss.
  try {
    await gate.waitFor({ state: 'visible', timeout: 12_000 });
  } catch {
    return;
  }

  // Insist on opening Triage → advances the gate to the friction modal.
  await page.getByTestId('triage-entry-gate-proceed').click();

  // Pick the deterministic tap tax (the voice option needs a microphone), then
  // pay it by tapping exactly DISTRACTION_TAP_TARGET times. The final tap fires
  // onUnlocked, closing the modal and revealing the inbox.
  await page.getByTestId('distraction-method-tap').click();
  const tapButton = page.getByTestId('distraction-tap-button');
  for (let i = 0; i < DISTRACTION_TAP_TARGET - 1; i += 1) {
    await tapButton.click();
  }
  if (options.onBeforeFinalTap) {
    await options.onBeforeFinalTap();
  }
  await tapButton.click();

  await gate.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}
