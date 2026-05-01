import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';

import { useAdminMfa } from './AdminMfaGate';

export interface DecryptFieldRow {
  field: string;
  ciphertextPreview: string | null;
  decrypted: string | null;
  error: string | null;
}

export interface DecryptResponsePayload {
  serverKeyPrefix: string;
  fields: DecryptFieldRow[];
}

export function useAdminEmailDecrypt() {
  const { t } = useTranslation();
  const { onMfaRequired } = useAdminMfa();
  const [emailId, setEmailId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecryptResponsePayload | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      setResult(null);
      const trimmedId = emailId.trim();
      if (!trimmedId) {
        setError(t('admin.emailDecrypt.emailIdRequired'));
        return;
      }
      setLoading(true);
      try {
        const response = await axios.post<DecryptResponsePayload>(`${API_URL}/admin/encryption/decrypt-email-preview`, {
          emailId: trimmedId,
          ...(encryptionKey.trim() ? { encryptionKey: encryptionKey.trim() } : {}),
        });
        setResult(response.data);
      } catch (requestError) {
        const mfaType = getMfaErrorType(requestError);
        if (mfaType) {
 onMfaRequired(mfaType); return; 
}
        setError(getAxiosErrorMessage(requestError, t('admin.emailDecrypt.requestFailed')));
      } finally {
        setLoading(false);
      }
    },
    [emailId, encryptionKey, t, onMfaRequired]
  );

  return {
    emailId,
    setEmailId,
    encryptionKey,
    setEncryptionKey,
    loading,
    error,
    result,
    handleSubmit,
  };
}
