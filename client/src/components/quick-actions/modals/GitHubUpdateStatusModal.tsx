import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { StatusSelector } from 'components/quick-actions/modals/github/StatusSelector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface GitHubUpdateStatusModalProps {
  issueInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const GitHubUpdateStatusModal: React.FC<GitHubUpdateStatusModalProps> = ({
  issueInfo,
  onClose,
  onSuccess,
}) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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


