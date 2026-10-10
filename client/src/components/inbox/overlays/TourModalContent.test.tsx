import { fireEvent, render, screen } from '@testing-library/react';

import { TourModalContent } from './TourModalContent';

// Without an i18next instance the raw keys render, so tests match on the keys.
const BACK_LABEL = 'onboarding.tour.back';
const NEXT_LABEL = 'onboarding.tour.next';

const steps = [
  { title: 'One', content: 'First tip' },
  { title: 'Two', content: 'Second tip' },
];

const renderModal = (overrides: Partial<React.ComponentProps<typeof TourModalContent>> = {}) => {
  const props: React.ComponentProps<typeof TourModalContent> = {
    tourStep: 1,
    tourSteps: steps,
    isLastStep: false,
    isFirstStep: false,
    onSkipTour: vi.fn(),
    onNextTourStep: vi.fn(),
    onPrevTourStep: vi.fn(),
    ...overrides,
  };
  render(<TourModalContent {...props} />);
  return props;
};

describe('TourModalContent Back button (#299)', () => {
  it('hides the Back button on the first step', () => {
    renderModal({ tourStep: 0, isFirstStep: true });
    expect(screen.queryByText(BACK_LABEL)).not.toBeInTheDocument();
  });

  it('shows the Back button on later steps and calls onPrevTourStep when clicked', () => {
    const props = renderModal({ tourStep: 1, isFirstStep: false });
    fireEvent.click(screen.getByText(BACK_LABEL));
    expect(props.onPrevTourStep).toHaveBeenCalledTimes(1);
    expect(props.onNextTourStep).not.toHaveBeenCalled();
  });

  it('keeps forward navigation working alongside Back', () => {
    const props = renderModal({ tourStep: 1, isFirstStep: false });
    fireEvent.click(screen.getByText(NEXT_LABEL));
    expect(props.onNextTourStep).toHaveBeenCalledTimes(1);
  });
});
