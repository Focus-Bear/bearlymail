import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { MobileAssistantSheet } from './MobileAssistantSheet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const renderSheet = () =>
  render(
    <MobileAssistantSheet
      actionsContent={<div>tools-tab-body</div>}
      askAiContent={<div>ask-ai-tab-body</div>}
    />
  );

describe('MobileAssistantSheet', () => {
  it('shows the floating launcher and keeps the sheet closed initially', () => {
    renderSheet();
    expect(screen.getByLabelText('inbox.assistant.openMobile')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('tools-tab-body')).not.toBeInTheDocument();
  });

  it('opens on the Actions tab when the launcher is tapped', () => {
    renderSheet();
    fireEvent.click(screen.getByLabelText('inbox.assistant.openMobile'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('tools-tab-body')).toBeInTheDocument();
    expect(screen.queryByText('ask-ai-tab-body')).not.toBeInTheDocument();
  });

  it('switches to the Ask AI tab', () => {
    renderSheet();
    fireEvent.click(screen.getByLabelText('inbox.assistant.openMobile'));
    fireEvent.click(screen.getByRole('tab', { name: 'inbox.assistant.askAiTab' }));
    expect(screen.getByText('ask-ai-tab-body')).toBeInTheDocument();
    expect(screen.queryByText('tools-tab-body')).not.toBeInTheDocument();
  });

  it('closes via the close button', () => {
    renderSheet();
    fireEvent.click(screen.getByLabelText('inbox.assistant.openMobile'));
    fireEvent.click(screen.getByLabelText('inbox.assistant.close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    renderSheet();
    fireEvent.click(screen.getByLabelText('inbox.assistant.openMobile'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
