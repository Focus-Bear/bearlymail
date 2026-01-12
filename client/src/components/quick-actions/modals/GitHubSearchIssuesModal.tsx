import React, { useState } from 'react';
import axios from 'axios';
import { VIEWPORT_HEIGHT_90, MODAL_WIDTH_LARGE } from 'constants/numbers';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { SearchIssuesForm } from 'components/quick-actions/modals/github/SearchIssuesForm';
import { IssueResultsList } from 'components/quick-actions/modals/github/IssueResultsList';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface GitHubSearchIssuesModalProps {
  email: {
    subject: string;
    body: string;
  };
  onClose: () => void;
}

export const GitHubSearchIssuesModal: React.FC<GitHubSearchIssuesModalProps> = ({
  email,
  onClose,
}) => {
  const [query, setQuery] = useState(email.subject || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to search issues');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_LARGE}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <ModalHeaderWithClose title="🔍 Search Similar Issues" onClose={onClose} />
        <SearchIssuesForm
          query={query}
          loading={loading}
          onQueryChange={setQuery}
          onSubmit={handleSearch}
        />
        <ErrorDisplay error={error} />
        <IssueResultsList
          results={results}
          loading={loading}
          query={query}
          error={error}
        />
      </ModalContent>
    </ModalBackdrop>
  );
};


