import axios from 'axios';

import { API_URL } from 'config/api';

interface AcceptConsentParams {
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

/**
 * API function to accept consent
 */
export const acceptConsent = async (params: AcceptConsentParams): Promise<void> => {
  await axios.post(`${API_URL}/users/accept-consent`, params);
};
