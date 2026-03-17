import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { StatusOption, StatusSelector } from 'components/quick-actions/modals/github/StatusSelector';
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

/** Node IDs returned by the status-options endpoint, needed for the Projects v2 mutation. */
interface ProjectStatusData {
  projectId: string;
  itemId: string;
  fieldId: string;
}

export const GitHubUpdateStatusModal: React.FC<GitHubUpdateStatusModalProps> = ({ issueInfo, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [projectStatusData, setProjectStatusData] = useState<ProjectStatusData | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOptions = async () => {
      setOptionsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/github/projects/status-options`, {
          params: {
            owner: issueInfo.owner,
            repo: issueInfo.repo,
            issueNumber: issueInfo.number,
          },
        });
        const { options, projectId, itemId, fieldId } = response.data ?? {};
        setStatusOptions(options ?? []);
        if (projectId && itemId && fieldId) {
          setProjectStatusData({ projectId, itemId, fieldId });
        }
      } catch {
        // If fetching options fails, fall back to free-text entry (empty options list)
        setStatusOptions([]);
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchOptions();
  }, [issueInfo.owner, issueInfo.repo, issueInfo.number]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStatus.trim()) {
      setError(t('quickActions.github.statusRequired', { defaultValue: 'Please enter or select a status.' }));
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (projectStatusData) {
        // Use the Projects v2 GraphQL mutation via the dedicated endpoint
        const selectedOption = statusOptions.find(opt => opt.name === selectedStatus);
        await axios.post(`${API_URL}/suggested-actions/github/update-project-status`, {
          projectId: projectStatusData.projectId,
          itemId: projectStatusData.itemId,
          fieldId: projectStatusData.fieldId,
          singleSelectOptionId: selectedOption?.id ?? selectedStatus,
        });
      } else {
        // Fallback: update issue open/closed state for issues not in a project
        const state = selectedStatus.toLowerCase() === 'closed' ? 'closed' : 'open';
        await axios.post(`${API_URL}/suggested-actions/github/update-status`, {
          owner: issueInfo.owner,
          repo: issueInfo.repo,
          issueNumber: issueInfo.number,
          state,
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message ?? 'Failed to update issue status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth="500px">
        <ModalHeaderWithClose title={t('quickActions.updateStatusTitle', { defaultValue: '🔄 Update Issue Status' })} onClose={onClose} />
        <IssueInfoDisplay owner={issueInfo.owner} repo={issueInfo.repo} number={issueInfo.number} />
        <form onSubmit={handleSubmit}>
          <StatusSelector
            options={statusOptions}
            value={selectedStatus}
            onChange={setSelectedStatus}
            loading={optionsLoading}
          />
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={!selectedStatus.trim()}
            submitLabel={t('quickActions.updateStatus', { defaultValue: 'Update Status' })}
            loadingLabel={t('quickActions.updating', { defaultValue: 'Updating...' })}
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
