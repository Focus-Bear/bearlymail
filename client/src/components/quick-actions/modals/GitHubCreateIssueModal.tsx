import React, { useState } from 'react';
import axios from 'axios';
import { VIEWPORT_HEIGHT_90, MAX_DESCRIPTION_LENGTH, MODAL_WIDTH_MEDIUM } from 'constants/numbers';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { GitHubIssueForm } from 'components/quick-actions/modals/github/GitHubIssueForm';

import { API_URL } from 'config/api';

interface GitHubCreateIssueModalProps {
  email: {
    subject: string;
    body: string;
    from: string;
    fromName?: string;
  };
  defaultRepo?: {
    owner: string;
    repo: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const GitHubCreateIssueModal: React.FC<GitHubCreateIssueModalProps> = ({
  email,
  defaultRepo,
  onClose,
  onSuccess,
}) => {
  const [owner, setOwner] = useState(defaultRepo?.owner || '');
  const [repo, setRepo] = useState(defaultRepo?.repo || '');
  const [title, setTitle] = useState(email.subject || '');
  const [description, setDescription] = useState(email.body?.substring(0, MAX_DESCRIPTION_LENGTH) || '');
  const [labels, setLabels] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner || !repo || !title) {
      setError('Owner, repository, and title are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_URL}/suggested-actions/github/create-issue`, {
        owner,
        repo,
        title,
        body: description,
        labels: labels ? labels.split(',').map(label => label.trim()) : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create issue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_MEDIUM}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <ModalHeaderWithClose title="🐛 Create GitHub Issue" onClose={onClose} />
        <form onSubmit={handleSubmit}>
          <GitHubIssueForm
            owner={owner}
            repo={repo}
            title={title}
            description={description}
            labels={labels}
            onOwnerChange={setOwner}
            onRepoChange={setRepo}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onLabelsChange={setLabels}
          />
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={!owner || !repo || !title}
            submitLabel="Create Issue"
            loadingLabel="Creating..."
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};


