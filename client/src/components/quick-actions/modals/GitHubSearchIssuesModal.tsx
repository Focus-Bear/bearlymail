import React, { useState } from 'react';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { IssueResultsList } from 'components/quick-actions/modals/github/IssueResultsList';
import { SearchIssuesForm } from 'components/quick-actions/modals/github/SearchIssuesForm';
import { API_URL } from 'config/api';
import { MODAL_WIDTH_LARGE, VIEWPORT_HEIGHT_90 } from 'constants/numbers';

interface IssueResult {
  url: string;
  title: string;
  repository: string;
  number: number;
  state: string;
  body?: string;
}

interface GitHubSearchIssuesModalProps {
  email: {
    subject: string;
    body: string;
  };
  onClose: () => void;
}

export const GitHubSearchIssuesModal: React.FC<GitHubSearchIssuesModalProps> = ({ email, onClose }) => {
  const [query, setQuery] = useState(email.subject || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<IssueResult[]>([]);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setError('Search query cannot be empty');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/suggested-actions/github/search`, {
        query: query.trim(),
      });
      setResults(response.data || []);
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, 'Failed to search issues'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_LARGE}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <ModalHeaderWithClose title="🔍 Search Similar Issues" onClose={onClose} />
        <SearchIssuesForm query={query} loading={loading} onQueryChange={setQuery} onSubmit={handleSearch} />
        <ErrorDisplay error={error} />
        <IssueResultsList results={results} loading={loading} query={query} error={error} />
      </ModalContent>
    </ModalBackdrop>
  );
};
