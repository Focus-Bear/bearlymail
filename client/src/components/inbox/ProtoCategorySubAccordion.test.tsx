/**
 * Regression tests for the "Convert to category" button (inbox "Other" proto-groups).
 *
 * Bug: clicking "Convert to category" did nothing. This asserts the button is
 * wired to the onConvertToCategory prop so a click actually invokes the promote
 * handler.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProtoCategorySubAccordion } from './ProtoCategorySubAccordion';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const BASE_PROPS = {
  name: '🛡️ Security & Monitoring Digests',
  description: null,
  emailCount: 6,
  children: <div data-testid="child-email" />,
  isConverting: false,
};

describe('ProtoCategorySubAccordion – Convert to category button', () => {
  it('invokes onConvertToCategory when the convert button is clicked', () => {
    const onConvertToCategory = vi.fn().mockResolvedValue(undefined);

    render(<ProtoCategorySubAccordion {...BASE_PROPS} onConvertToCategory={onConvertToCategory} />);

    fireEvent.click(screen.getByText('inbox.protoCategory.convertToCategory'));

    expect(onConvertToCategory).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onConvertToCategory while a conversion is already in progress (button disabled)', () => {
    const onConvertToCategory = vi.fn().mockResolvedValue(undefined);

    render(
      <ProtoCategorySubAccordion {...BASE_PROPS} isConverting onConvertToCategory={onConvertToCategory} />
    );

    // While converting the label switches and the button is disabled.
    fireEvent.click(screen.getByText('inbox.protoCategory.converting'));

    expect(onConvertToCategory).not.toHaveBeenCalled();
  });
});
