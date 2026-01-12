import React, { useState } from 'react';
import axios from 'axios';
import { MAX_DESCRIPTION_LENGTH } from 'constants/numbers';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { CommentTextarea } from 'components/quick-actions/modals/github/CommentTextarea';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  const [comment, setComment] = useState(email.body?.substring(0, MAX_DESCRIPTION_LENGTH) || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth="600px">
        <ModalHeaderWithClose title="💬 Add Comment to Issue" onClose={onClose} />
        <IssueInfoDisplay owner={issueInfo.owner} repo={issueInfo.repo} number={issueInfo.number} />
        <form onSubmit={handleSubmit}>
          <CommentTextarea value={comment} onChange={setComment} />
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={!comment.trim()}
            submitLabel="Add Comment"
            loadingLabel="Adding..."
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};


