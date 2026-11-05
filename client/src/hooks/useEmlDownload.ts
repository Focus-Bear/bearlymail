import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { downloadBlob } from 'utils/downloadBlob';
import { fetchEmlFile } from 'utils/emlDownload';

import { HTTP_NOT_IMPLEMENTED } from 'constants/numbers';
import { useNotifications } from 'contexts/NotificationContext';

const isUnsupportedByProvider = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === HTTP_NOT_IMPLEMENTED;

/**
 * Returns a function that downloads one message as a `.eml` file (the
 * provider's original source, all headers included) and reports failures —
 * distinguishing a provider that can't supply raw messages from other errors.
 */
export function useEmlDownload(): (emailId: string) => Promise<void> {
  const { t } = useTranslation();
  const { showError } = useNotifications();

  return useCallback(
    async (emailId: string) => {
      try {
        const { blob, filename } = await fetchEmlFile(emailId);
        downloadBlob(blob, filename);
      } catch (error) {
        showError(
          t(isUnsupportedByProvider(error) ? 'emailDetail.downloadEmlUnsupported' : 'emailDetail.downloadEmlFailed')
        );
      }
    },
    [showError, t]
  );
}
