import React, { useEffect, useState } from 'react';
import axios from 'axios';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { StatusSelector } from 'components/quick-actions/modals/github/StatusSelector';
import { API_URL } from 'config/api';

interface GitHubUpdateStatusModalProps {
  issueInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const GitHubUpdateStatusModal: React.FC<GitHubUpdateStatusModalProps> = ({ issueInfo, onClose, onSuccess }) => {
  const [state, setState] = useState<'open' | 'closed'>('closed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchIssue = async () => {
      try {
        await axios.get(`${API_URL}/github/emails/dummy`);
      } catch (err) {
        // Ignore - we'll proceed without pre-fetching
      }
    };
    fetchIssue();
  }, [issueInfo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_URL}/suggested-actions/github/update-status`, {
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        issueNumber: issueInfo.number,
        state,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update issue status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth="500px">
        <ModalHeaderWithClose title="🔄 Update Issue Status" onClose={onClose} />
        <IssueInfoDisplay owner={issueInfo.owner} repo={issueInfo.repo} number={issueInfo.number} />
        <form onSubmit={handleSubmit}>
          <StatusSelector state={state} onStateChange={setState} />
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={false}
            submitLabel="Update Status"
            loadingLabel="Updating..."
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
