import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { AutoResponderDeliverySettings } from 'components/settings/auto-responder/AutoResponderDeliverySettings';
import { AUTO_RESPONDER_DELIVERY_MODES, AutoResponderDeliveryMode } from 'components/settings/auto-responder/types';

const DeliverySettingsWrapper = ({ initialMode }: { initialMode: AutoResponderDeliveryMode }) => {
  const [mode, setMode] = useState(initialMode);
  return (
    <I18nextProvider i18n={i18n}>
      <div style={{ maxWidth: 720, padding: 16 }}>
        <AutoResponderDeliverySettings deliveryMode={mode} onChange={setMode} />
      </div>
    </I18nextProvider>
  );
};

const meta: Meta<typeof DeliverySettingsWrapper> = {
  title: 'Settings/AutoResponderDeliverySettings',
  component: DeliverySettingsWrapper,
};

export default meta;
type Story = StoryObj<typeof DeliverySettingsWrapper>;

export const DraftForApproval: Story = {
  args: { initialMode: AUTO_RESPONDER_DELIVERY_MODES.DRAFT },
};

export const AutoSendKnownSenders: Story = {
  args: { initialMode: AUTO_RESPONDER_DELIVERY_MODES.AUTO_SEND_KNOWN_SENDERS },
};
