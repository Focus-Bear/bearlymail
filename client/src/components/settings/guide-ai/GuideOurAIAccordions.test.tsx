import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { CONTEXT_KEY_Q_AND_A, CONTEXT_SOURCE_UNAPPROVED } from 'constants/strings';

import { ContextSection } from './ContextSection';
import { QAndASection } from './QAndASection';
import { SummarizationRulesSection } from './SummarizationRulesSection';
import { ToneSettingsSection } from './ToneSettingsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess: () => undefined, showError: () => undefined }),
}));

const noop = () => undefined;
const noopAsync = async () => undefined;

const VIP_TITLE = 'VIP Contacts';
const VIP_CONTEXT_KEY = 'VIP_CONTACT';
const VIP_VALUE = 'boss@example.com';
const HELP_TEXT = 'People whose email always matters';
const MENU_LABEL = 'More actions';

const contextEditingProps = {
  addingContextType: null,
  editingContextId: null,
  editContextValue: '',
  newContextValue: '',
  onAddContext: noopAsync,
  onUpdateContext: noopAsync,
  onDeleteContext: noop,
  onNewContextValueChange: noop,
  onAddingContextTypeChange: noop,
  onEditingContextIdChange: noop,
  onEditContextValueChange: noop,
};

const renderInRouter = (ui: React.ReactElement, url = '/settings') =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

const renderVipSection = (onMenuClick = vi.fn()) =>
  renderInRouter(
    <ContextSection
      title={VIP_TITLE}
      contextKey={VIP_CONTEXT_KEY}
      contexts={[{ contextId: 'vip-1', contextKey: VIP_CONTEXT_KEY, contextValue: VIP_VALUE, source: 'USER_EDITED' }]}
      addLabel="Add VIP"
      tooltipContent={HELP_TEXT}
      actionButton={
        <button type="button" onClick={onMenuClick}>
          {MENU_LABEL}
        </button>
      }
      {...contextEditingProps}
    />
  );

const renderQAndASection = (url?: string) =>
  renderInRouter(
    <QAndASection
      anchorId={SETTINGS_ANCHORS.Q_AND_A}
      contexts={[
        {
          contextId: 'qa-1',
          contextKey: CONTEXT_KEY_Q_AND_A,
          contextValue: 'Q: Office hours? | A: 9 to 5',
          source: CONTEXT_SOURCE_UNAPPROVED,
        },
      ]}
      {...contextEditingProps}
    />,
    url
  );

const renderToneSection = () =>
  renderInRouter(
    <ToneSettingsSection
      toneRules={['Be brief']}
      newToneRule=""
      onAddToneRule={noop}
      onRemoveToneRule={noop}
      onNewToneRuleChange={noop}
    />
  );

const renderSummarizationSection = () =>
  renderInRouter(
    <SummarizationRulesSection
      summarizationRules={[]}
      newSummarizationWhen=""
      newSummarizationHow=""
      newFromPatterns=""
      newSubjectPatterns=""
      newPriority={1}
      editingSummarizationRule={null}
      editSummarizationWhen=""
      editSummarizationHow=""
      editFromPatterns=""
      editSubjectPatterns=""
      editPriority={1}
      onAddSummarizationRule={noopAsync}
      onEditSummarizationRule={noop}
      onSaveSummarizationRule={noopAsync}
      onDeleteSummarizationRule={noopAsync}
      onNewSummarizationWhenChange={noop}
      onNewSummarizationHowChange={noop}
      onNewFromPatternsChange={noop}
      onNewSubjectPatternsChange={noop}
      onNewPriorityChange={noop}
      onEditSummarizationWhenChange={noop}
      onEditSummarizationHowChange={noop}
      onEditFromPatternsChange={noop}
      onEditSubjectPatternsChange={noop}
      onEditPriorityChange={noop}
      onEditingSummarizationRuleChange={noop}
    />
  );

interface AccordionCase {
  name: string;
  renderSection: () => void;
  toggleName: RegExp;
  bodyText: string;
}

const ACCORDION_CASES: AccordionCase[] = [
  { name: 'a context section', renderSection: renderVipSection, toggleName: /VIP Contacts/, bodyText: VIP_VALUE },
  {
    name: 'Q&A',
    renderSection: renderQAndASection,
    toggleName: /settings\.contextSections\.qanda/,
    bodyText: 'settings.context.pendingReview',
  },
  { name: 'How I write emails', renderSection: renderToneSection, toggleName: /settings\.howIWrite/, bodyText: 'Be brief' },
  {
    name: 'Summarization Rules',
    renderSection: renderSummarizationSection,
    toggleName: /settings\.summarizationRules/,
    bodyText: 'settings.noSummarizationRules',
  },
];

const KEYS_THAT_ACTIVATE_A_BUTTON = ['{Enter}', ' '];

describe.each(ACCORDION_CASES)('$name accordion', ({ renderSection, toggleName, bodyText }) => {
  it('starts collapsed behind a heading button', () => {
    renderSection();

    const toggle = screen.getByRole('button', { name: toggleName });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.closest('h3, h4')).not.toBeNull();
    expect(screen.queryByText(bodyText)).toBeNull();
  });

  it.each(KEYS_THAT_ACTIVATE_A_BUTTON)('opens from the keyboard with %s', async key => {
    renderSection();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: toggleName })).toHaveFocus();
    await userEvent.keyboard(key);

    expect(screen.getByRole('button', { name: toggleName })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(bodyText)).toBeVisible();
  });
});

describe('context section header controls', () => {
  it('keeps the help icon and the header menu as their own tab stops that do not toggle the section', async () => {
    const onMenuClick = vi.fn();
    renderVipSection(onMenuClick);
    const toggle = screen.getByRole('button', { name: /VIP Contacts/ });

    await userEvent.tab();
    expect(toggle).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: '?' })).toHaveFocus();
    expect(screen.getByText(HELP_TEXT)).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: MENU_LABEL })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onMenuClick).toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('nests context sections under the Context About Me heading', () => {
    renderVipSection();

    expect(screen.getByRole('heading', { level: 4, name: /VIP Contacts/ })).toBeInTheDocument();
  });
});

describe('Q&A header', () => {
  it('names the pending count in the toggle', () => {
    renderQAndASection();

    expect(
      screen.getByRole('button', { name: 'settings.contextSections.qanda 1 settings.context.pendingCount' })
    ).toBeInTheDocument();
  });

  it('opens when a link targets it', async () => {
    renderQAndASection(`/settings#${SETTINGS_ANCHORS.Q_AND_A}`);

    await waitFor(() => expect(screen.getByText('settings.context.pendingReview')).toBeVisible());
  });
});
