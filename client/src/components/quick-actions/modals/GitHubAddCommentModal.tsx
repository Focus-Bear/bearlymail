import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { CommentTextarea } from 'components/quick-actions/modals/github/CommentTextarea';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { API_URL } from 'config/api';
import { MAX_DESCRIPTION_LENGTH } from 'constants/numbers';

interface GitHubAddCommentModalProps {
  issueInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  email: {
    body: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export const GitHubAddCommentModal: React.FC<GitHubAddCommentModalProps> = ({
  issueInfo,
  email,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState(email.body?.substring(0, MAX_DESCRIPTION_LENGTH) || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_URL}/suggested-actions/github/add-comment`, {
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        issueNumber: issueInfo.number,
        body: comment,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Failed to add comment'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth="600px">
        <ModalHeaderWithClose
          title={t('quickActions.addCommentTitle', { defaultValue: '💬 Add Comment to Issue' })}
          onClose={onClose}
        />
        <IssueInfoDisplay owner={issueInfo.owner} repo={issueInfo.repo} number={issueInfo.number} />
        <form onSubmit={handleSubmit}>
          <CommentTextarea value={comment} onChange={setComment} />
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={!comment.trim()}
            submitLabel={t('quickActions.addComment', { defaultValue: 'Add Comment' })}
            loadingLabel={t('quickActions.adding', { defaultValue: 'Adding...' })}
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
