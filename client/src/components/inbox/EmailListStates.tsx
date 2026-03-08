import React from 'react';
import { InboxMode } from 'types/email';

import { EmptyState, ErrorState, LoadingState } from 'components/inbox/states';

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  onRetry: () => void;
}

/**
 * Email list states component
 * Handles loading, error, and empty states for email list
 */
export const EmailListStates: React.FC<EmailListStatesProps> = ({
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  emailsEmpty,
  mode,
  onRetry,
}) => {
  if (loading || !hasInitiallyLoaded || loadingModeSwitch) {
    return <LoadingState decrypting={decrypting} loadingModeSwitch={loadingModeSwitch} mode={mode} />;
  }

  if (fetchError) {
    return <ErrorState error={fetchError} onRetry={onRetry} />;
  }

  if (emailsEmpty) {
    return <EmptyState mode={mode} />;
  }

  return null;
};
