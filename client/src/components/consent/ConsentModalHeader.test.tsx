import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConsentModalHeader } from 'components/consent/ConsentModalHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ConsentModalHeader', () => {
  it('welcomes first-time users without a change summary', () => {
    render(<ConsentModalHeader />);

    expect(screen.getByText('consent.welcome')).toBeInTheDocument();
    expect(screen.queryByText('consent.whatsChanged')).not.toBeInTheDocument();
  });

  it('shows what changed when an updated policy needs accepting', () => {
    render(<ConsentModalHeader changeSummaryKey="consent.changeSummaries.privacy_1_2_0" />);

    expect(screen.getByText('consent.updatedTitle')).toBeInTheDocument();
    expect(screen.getByText('consent.whatsChanged')).toBeInTheDocument();
    expect(screen.getByText('consent.changeSummaries.privacy_1_2_0')).toBeInTheDocument();
  });
});
