import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GOOGLE_API_SERVICES_USER_DATA_POLICY_URL, PRIVACY_REGULATOR_URLS } from 'constants/legal';
import { PrivacyPolicyContent } from 'pages/privacy/PrivacyPolicyContent';

describe('PrivacyPolicyContent', () => {
  it('discloses automated decisions and the per-account model', () => {
    render(<PrivacyPolicyContent />);

    expect(screen.getByText('3.1 Decisions Made by Computer Programs')).toBeInTheDocument();
    expect(screen.getByText('3.2 A Model Trained on Your Own Email')).toBeInTheDocument();
    expect(screen.getByText(/ask for a person to review it/)).toBeInTheDocument();
  });

  it('states the Google API Services Limited Use commitment with a link to the policy', () => {
    render(<PrivacyPolicyContent />);

    expect(screen.getByText(/including the Limited Use requirements/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google API Services User Data Policy' })).toHaveAttribute(
      'href',
      GOOGLE_API_SERVICES_USER_DATA_POLICY_URL
    );
  });

  it('names the privacy regulator for each region', () => {
    render(<PrivacyPolicyContent />);

    expect(screen.getByRole('link', { name: 'Office of the Australian Information Commissioner' })).toHaveAttribute(
      'href',
      PRIVACY_REGULATOR_URLS.AUSTRALIA_OAIC
    );
    expect(screen.getByRole('link', { name: 'Information Commissioner’s Office' })).toHaveAttribute(
      'href',
      PRIVACY_REGULATOR_URLS.UK_ICO
    );
    expect(screen.getByRole('link', { name: 'Office of the Privacy Commissioner' })).toHaveAttribute(
      'href',
      PRIVACY_REGULATOR_URLS.NEW_ZEALAND_OPC
    );
  });
});
