import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CollapsibleSettingsSection } from 'components/settings/CollapsibleSettingsSection';
import { SETTINGS_ANCHORS, settingsAnchorPath } from 'constants/settingsAnchors';

import { GUIDE_OUR_AI_SUB_NAV_SECTIONS, GuideOurAISubNav } from './GuideOurAISubNav';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const NAV_LABEL = 'settings.guideAI.sectionNavLabel';
const RULES_LINK_NAME = 'settings.deterministicCategoryRules.sectionTitle';

const renderSubNavWithRulesSection = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <GuideOurAISubNav />
      <CollapsibleSettingsSection anchorId={SETTINGS_ANCHORS.CATEGORY_RULES} title="Rules" itemCount={1}>
        <p>Rule list</p>
      </CollapsibleSettingsSection>
    </MemoryRouter>
  );

describe('GuideOurAISubNav', () => {
  it('links to every Guide Our AI section, in page order', () => {
    renderSubNavWithRulesSection();

    const nav = screen.getByRole('navigation', { name: NAV_LABEL });
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(GUIDE_OUR_AI_SUB_NAV_SECTIONS.map(section => section.labelKey));
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      GUIDE_OUR_AI_SUB_NAV_SECTIONS.map(section => settingsAnchorPath(section.anchorId))
    );
  });

  it('expands a collapsed section it links to and moves focus there', async () => {
    renderSubNavWithRulesSection();
    expect(screen.getByText('Rule list')).not.toBeVisible();

    await userEvent.click(screen.getByRole('link', { name: RULES_LINK_NAME }));

    await waitFor(() => expect(screen.getByText('Rule list')).toBeVisible());
    expect(screen.getByRole('button', { name: /Rules/ })).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(document.getElementById(SETTINGS_ANCHORS.CATEGORY_RULES));
  });

  it('re-opens the section when the same link is followed after the user collapsed it', async () => {
    renderSubNavWithRulesSection();
    const link = screen.getByRole('link', { name: RULES_LINK_NAME });
    await userEvent.click(link);
    await waitFor(() => expect(screen.getByText('Rule list')).toBeVisible());

    await userEvent.click(screen.getByRole('button', { name: /Rules/ }));
    expect(screen.getByText('Rule list')).not.toBeVisible();

    await userEvent.click(link);
    await waitFor(() => expect(screen.getByText('Rule list')).toBeVisible());
  });
});
