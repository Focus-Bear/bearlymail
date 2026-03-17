import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import { ProjectStatusOption, ProjectStatusSelector } from 'components/quick-actions/modals/github/ProjectStatusSelector';
import { StatusOption, StatusSelector } from 'components/quick-actions/modals/github/StatusSelector';
import { API_URL } from 'config/api';

interface ProjectStatusData {
  projectId: string;
  itemId: string;
  fieldId: string;
  options: ProjectStatusOption[];
}

interface GitHubUpdateStatusModalProps {
  issueInfo: {
    owner: string;
    repo: string;
    number: number;
  };
  /**
   * When provided, the modal fetches project-specific column status options
   * and submits via the update-project-status endpoint instead of the
   * generic open/closed update-status endpoint.
   */
  projectName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const GitHubUpdateStatusModal: React.FC<GitHubUpdateStatusModalProps> = ({
  issueInfo,
  projectName,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();

  // --- Issue open/closed state (used when projectName is not set) ---
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(!projectName);

  // --- Project status mode (used when projectName is set) ---
  const [projectStatusData, setProjectStatusData] = useState<ProjectStatusData | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [fetchingOptions, setFetchingOptions] = useState(!!projectName);
  const [fetchError, setFetchError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // --- Shared ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch project-specific status options when projectName is set
  useEffect(() => {
    if (!projectName) {
      return;
    }

    const fetchProjectOptions = async () => {
      setFetchingOptions(true);
      setFetchError('');
      try {
        const response = await axios.get(`${API_URL}/github/project-status-options`, {
          params: {
            owner: issueInfo.owner,
            repo: issueInfo.repo,
            issueNumber: issueInfo.number,
            projectName,
          },
        });
        setProjectStatusData(response.data);
      } catch (err: any) {
        setFetchError(
          err.response?.data?.message ||
          t('quickActions.github.failedToLoadOptions', { defaultValue: 'Failed to load project status options.' }),
        );
      } finally {
        setFetchingOptions(false);
      }
    };

    fetchProjectOptions();
  }, [issueInfo.owner, issueInfo.repo, issueInfo.number, projectName, t, retryCount]);

  // Fetch generic issue status options when projectName is not set
  useEffect(() => {
    if (projectName) {
      return;
    }

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
        setStatusOptions(response.data?.options ?? []);
      } catch {
        // Fall back to free-text entry if options can't be fetched
        setStatusOptions([]);
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchOptions();
  }, [issueInfo.owner, issueInfo.repo, issueInfo.number, projectName]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (projectName && projectStatusData && selectedOptionId) {
        // Project status update path (new)
        await axios.post(`${API_URL}/suggested-actions/github/update-project-status`, {
          projectId: projectStatusData.projectId,
          itemId: projectStatusData.itemId,
          fieldId: projectStatusData.fieldId,
          optionId: selectedOptionId,
        });
      } else {
        // Issue open/closed state update path (existing — kept for backwards compatibility)
        if (!selectedStatus.trim()) {
          setError(t('quickActions.github.statusRequired', { defaultValue: 'Please enter or select a status.' }));
          setLoading(false);
          return;
        }
        await axios.post(`${API_URL}/suggested-actions/github/update-status`, {
          owner: issueInfo.owner,
          repo: issueInfo.repo,
          issueNumber: issueInfo.number,
          projectStatusValue: selectedStatus,
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || t('quickActions.github.failedToUpdateStatus', { defaultValue: 'Failed to update status' }));
    } finally {
      setLoading(false);
    }
  };

  // In project mode, the submit button is disabled when no option is selected
  const isSubmitDisabled = projectName
    ? !selectedOptionId
    : !selectedStatus.trim();

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth="500px">
        <ModalHeaderWithClose
          title={t('quickActions.updateStatusTitle', { defaultValue: '🔄 Update Issue Status' })}
          onClose={onClose}
        />
        <IssueInfoDisplay owner={issueInfo.owner} repo={issueInfo.repo} number={issueInfo.number} />
        <form onSubmit={handleSubmit}>
          {projectName ? (
            <>
              {fetchError ? (
                <div>
                  <p
                    style={{ color: 'red', fontSize: '0.875rem', marginBottom: '8px' }}
                  >
                    {fetchError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryCount(prev => prev + 1)}
                    style={{
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      border: '1px solid currentColor',
                      borderRadius: '4px',
                      background: 'none',
                    }}
                  >
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </button>
                </div>
              ) : (
                <ProjectStatusSelector
                  options={projectStatusData?.options ?? []}
                  selectedId={selectedOptionId}
                  onSelect={setSelectedOptionId}
                  loading={fetchingOptions}
                />
              )}
            </>
          ) : (
            <StatusSelector
              options={statusOptions}
              value={selectedStatus}
              onChange={setSelectedStatus}
              loading={optionsLoading}
            />
          )}
          <ErrorDisplay error={error} />
          <ModalFormActions
            loading={loading}
            disabled={isSubmitDisabled}
            submitLabel={t('quickActions.updateStatus', { defaultValue: 'Update Status' })}
            loadingLabel={t('quickActions.updating', { defaultValue: 'Updating...' })}
            onCancel={onClose}
          />
        </form>
      </ModalContent>
    </ModalBackdrop>
  );
};
