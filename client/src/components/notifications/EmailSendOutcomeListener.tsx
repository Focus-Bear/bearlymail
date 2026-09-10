import React from 'react';

import { useEmailSendOutcomes } from 'hooks/useEmailSendOutcomes';

/**
 * Renders nothing; exists so the background-send outcome listener can live at
 * the app root, where it still hears the result after the user has navigated
 * away from the composer.
 */
export const EmailSendOutcomeListener: React.FC = () => {
  useEmailSendOutcomes();
  return null;
};
