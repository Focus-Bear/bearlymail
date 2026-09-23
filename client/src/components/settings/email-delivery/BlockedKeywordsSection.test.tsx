import { act, fireEvent, render, screen } from '@testing-library/react';

import { BlockedKeywordsSection } from './BlockedKeywordsSection';

/**
 * Without an i18next instance the raw keys are rendered, so the tests match on
 * those keys. That is enough to assert the button's state, which is what #298
 * is about.
 */
const ADD_LABEL = 'settings.blockedKeywords.addKeyword';
const SAVING_LABEL = 'common.saving';

const expand = () => {
  fireEvent.click(screen.getByText(/settings\.blockedKeywords\.title/));
};

const typeKeyword = (value: string) => {
  fireEvent.change(screen.getByPlaceholderText('settings.blockedKeywords.placeholder'), {
    target: { value },
  });
};

describe('BlockedKeywordsSection add button (#298)', () => {
  it('shows a single "Add Keyword" button before saving', () => {
    render(
      <BlockedKeywordsSection blockedKeywords={[]} onUnblockKeyword={vi.fn()} onAddKeyword={vi.fn()} />
    );
    expand();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(ADD_LABEL);
  });

  it('replaces the button with the disabled "Saving…" state while the add is in flight — never both at once', async () => {
    // A promise we control so the save stays pending for the assertions.
    let resolveAdd: () => void = () => {};
    const onAddKeyword = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveAdd = resolve;
        })
    );

    render(
      <BlockedKeywordsSection blockedKeywords={[]} onUnblockKeyword={vi.fn()} onAddKeyword={onAddKeyword} />
    );
    expand();
    typeKeyword('spam');
    fireEvent.click(screen.getByRole('button', { name: ADD_LABEL }));

    // Exactly one button, now showing the saving state — the "Add Keyword"
    // label is gone rather than sitting alongside it.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(SAVING_LABEL);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0]).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(ADD_LABEL)).not.toBeInTheDocument();

    // Let the pending save settle so its state update stays inside act().
    await act(async () => {
      resolveAdd();
    });
  });
});
