import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { GitHubIssueForm } from 'components/quick-actions/modals/github/GitHubIssueForm';
import { API_URL } from 'config/api';
import { MAX_DESCRIPTION_LENGTH, MODAL_WIDTH_MEDIUM, VIEWPORT_HEIGHT_90 } from 'constants/numbers';

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
  const { t } = useTranslation();
  const [owner, setOwner] = useState(defaultRepo?.owner || '');
  const [repo, setRepo] = useState(defaultRepo?.repo || '');
  const [title, setTitle] = useState(email.subject || '');
  const [description, setDescription] = useState(email.body?.substring(0, MAX_DESCRIPTION_LENGTH) || '');
  const [labels, setLabels] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Failed to create issue'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_MEDIUM}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <ModalHeaderWithClose
          title={t('quickActions.createIssueTitle', { defaultValue: '🐛 Create GitHub Issue' })}
          onClose={onClose}
        />
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
            submitLabel={t('quickActions.createIssue', { defaultValue: 'Create Issue' })}
            loadingLabel={t('quickActions.creating', { defaultValue: 'Creating...' })}
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
