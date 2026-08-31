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

const responsive = vi.hoisted(() => ({ isMobile: false }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({
    isMobile: responsive.isMobile,
    isTablet: false,
    isDesktop: !responsive.isMobile,
  }),
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

describe('ProtoCategorySubAccordion – mobile responsiveness (#146)', () => {
  afterEach(() => {
    responsive.isMobile = false;
  });

  it('renders the full multi-word name on mobile (no per-letter wrapping regression)', () => {
    responsive.isMobile = true;
    render(
      <ProtoCategorySubAccordion
        {...BASE_PROPS}
        name="Promotional Solicitations"
        description="Unsolicited sales outreach, marketing"
        onConvertToCategory={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText('Promotional Solicitations')).toBeInTheDocument();
    expect(screen.getByText('Unsolicited sales outreach, marketing')).toBeInTheDocument();
  });

  it('lets the action buttons wrap onto their own row on mobile', () => {
    responsive.isMobile = true;
    render(<ProtoCategorySubAccordion {...BASE_PROPS} onConvertToCategory={vi.fn().mockResolvedValue(undefined)} />);
    const actions = screen.getByText('inbox.protoCategory.convertToCategory').parentElement as HTMLElement;
    expect(actions.style.flexWrap).toBe('wrap');
  });

  it('keeps the action buttons on one line on desktop', () => {
    responsive.isMobile = false;
    render(<ProtoCategorySubAccordion {...BASE_PROPS} onConvertToCategory={vi.fn().mockResolvedValue(undefined)} />);
    const actions = screen.getByText('inbox.protoCategory.convertToCategory').parentElement as HTMLElement;
    expect(actions.style.flexWrap).toBe('');
  });
});
