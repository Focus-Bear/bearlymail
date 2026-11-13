import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { AutoResponderDeliverySettings } from './AutoResponderDeliverySettings';
import { AUTO_RESPONDER_DELIVERY_MODES } from './types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const DRAFT_LABEL = 'settings.autoResponder.delivery.draftLabel';
const AUTO_LABEL = 'settings.autoResponder.delivery.autoLabel';

describe('AutoResponderDeliverySettings', () => {
  it('shows the current mode as selected', () => {
    render(<AutoResponderDeliverySettings deliveryMode={AUTO_RESPONDER_DELIVERY_MODES.DRAFT} onChange={vi.fn()} />);

    expect(screen.getByLabelText(new RegExp(DRAFT_LABEL))).toBeChecked();
    expect(screen.getByLabelText(new RegExp(AUTO_LABEL))).not.toBeChecked();
  });

  it('reports the newly chosen mode', () => {
    const onChange = vi.fn();
    render(<AutoResponderDeliverySettings deliveryMode={AUTO_RESPONDER_DELIVERY_MODES.DRAFT} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(new RegExp(AUTO_LABEL)));

    expect(onChange).toHaveBeenCalledWith(AUTO_RESPONDER_DELIVERY_MODES.AUTO_SEND_KNOWN_SENDERS);
  });
});
