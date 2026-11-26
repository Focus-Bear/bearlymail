import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CollapsibleSettingsSection, SectionHeaderActionButton } from './CollapsibleSettingsSection';

const ANCHOR_ID = 'category-rules';
const RULE_COUNT = 3;

const renderAt = (url: string, onAdd = vi.fn()) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <div id="elsewhere">Another section</div>
      <CollapsibleSettingsSection
        anchorId={ANCHOR_ID}
        title="Deterministic category rules"
        itemCount={RULE_COUNT}
        headerAction={<SectionHeaderActionButton label="Add composite rule" onClick={onAdd} />}
      >
        <p>Rule list</p>
      </CollapsibleSettingsSection>
    </MemoryRouter>
  );

describe('CollapsibleSettingsSection', () => {
  it('starts collapsed, with the item count in its heading', () => {
    renderAt('/settings');

    const toggle = screen.getByRole('button', { name: `Deterministic category rules ${RULE_COUNT}` });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', `${ANCHOR_ID}-panel`);
    expect(screen.getByRole('heading', { level: 3 })).toContainElement(toggle);
    expect(screen.getByText('Rule list')).not.toBeVisible();
  });

  it('expands and collapses on toggle, including from the keyboard', async () => {
    renderAt('/settings');
    const toggle = screen.getByRole('button', { name: /Deterministic category rules/ });

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Rule list')).toBeVisible();

    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Rule list')).not.toBeVisible();
  });

  it('keeps the header action usable while collapsed, without toggling the section', async () => {
    const onAdd = vi.fn();
    renderAt('/settings', onAdd);

    await userEvent.click(screen.getByRole('button', { name: 'Add composite rule' }));

    expect(onAdd).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Deterministic category rules/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('opens by itself when a link targets it', async () => {
    renderAt(`/settings#${ANCHOR_ID}`);

    await waitFor(() => expect(screen.getByText('Rule list')).toBeVisible());
  });

  it('stays collapsed for a link to another section', async () => {
    renderAt('/settings#elsewhere');

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText('Rule list')).not.toBeVisible();
  });

  it('leaves the count out while the items are loading', () => {
    render(
      <MemoryRouter>
        <CollapsibleSettingsSection anchorId={ANCHOR_ID} title="Learned priority rules">
          <p>Loading</p>
        </CollapsibleSettingsSection>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Learned priority rules' })).toBeInTheDocument();
  });
});
