import { CONTEXT_EXPLANATION_VIP_CONTACT_STARRED } from 'constants/strings';

import { translateContextExplanation } from './contextExplanation';

const echoKey = (key: string) => key;

describe('translateContextExplanation', () => {
  it('returns a plain reason as-is', () => {
    expect(translateContextExplanation('Client the user replies to about the Acme rollout', echoKey)).toBe(
      'Client the user replies to about the Acme rollout'
    );
  });

  it('translates the starred-contact code with its count', () => {
    const translate = vi.fn(() => 'Starred 3 emails');
    expect(translateContextExplanation(`${CONTEXT_EXPLANATION_VIP_CONTACT_STARRED}:3`, translate)).toBe(
      'Starred 3 emails'
    );
    expect(translate).toHaveBeenCalledWith('settings.contextExplanations.vipContactStarredExplanation', {
      count: 3,
      plural: 's',
    });
  });

  it('falls back to the raw text when a coded explanation has no translation', () => {
    const translate = (_key: string, opts?: Record<string, unknown>) => String(opts?.defaultValue);
    expect(translateContextExplanation('Manager: approves the roadmap', translate)).toBe(
      'Manager: approves the roadmap'
    );
  });
});
