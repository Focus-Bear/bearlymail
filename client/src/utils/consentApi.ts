import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

