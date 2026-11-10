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
    isSkipPromptVisible: false,
    onRequestSkip: vi.fn(),
    onCancelSkip: vi.fn(),
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

describe('TourModalContent Skip (hold to skip)', () => {
  const SKIP_LABEL = 'onboarding.tour.skip';
  const SKIP_MESSAGE = 'onboarding.tourSkipPrompt.message';
  const CONTINUE_LABEL = 'onboarding.tourSkipPrompt.continueTour';

  it('asks for the skip prompt instead of skipping when Skip is clicked', () => {
    const props = renderModal();
    fireEvent.click(screen.getByText(SKIP_LABEL));
    expect(props.onRequestSkip).toHaveBeenCalledTimes(1);
    expect(props.onSkipTour).not.toHaveBeenCalled();
  });

  it('shows the recommendation and a hold-to-skip button in the prompt', () => {
    renderModal({ isSkipPromptVisible: true });
    expect(screen.getByText(SKIP_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'onboarding.tourSkipPrompt.ariaLabel' })).toHaveAccessibleDescription(
      SKIP_MESSAGE
    );
    expect(screen.queryByText(SKIP_LABEL)).not.toBeInTheDocument();
  });

  it('closes the prompt with "Continue the tour"', () => {
    const props = renderModal({ isSkipPromptVisible: true });
    fireEvent.click(screen.getByText(CONTINUE_LABEL));
    expect(props.onCancelSkip).toHaveBeenCalledTimes(1);
    expect(props.onSkipTour).not.toHaveBeenCalled();
  });
});
