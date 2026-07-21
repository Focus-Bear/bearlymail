import axios from 'axios';

import { API_URL } from 'config/api';

interface VerifyDistractionPhraseResponse {
  verified: boolean;
}

/**
 * Ask the backend to semantically verify a spoken confession transcript against
 * the distraction-tax phrase. Returns whether the transcript passed.
 */
export async function verifyDistractionPhrase(transcript: string): Promise<boolean> {
  const response = await axios.post<VerifyDistractionPhraseResponse>(
    `${API_URL}/triage/verify-distraction-phrase`,
    { transcript }
  );
  return response.data?.verified === true;
}
