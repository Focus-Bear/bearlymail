import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';

import { ErrorDisplay } from 'components/modal/ErrorDisplay';
import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { ModalFormActions } from 'components/modal/ModalFormActions';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { IssueInfoDisplay } from 'components/quick-actions/modals/github/IssueInfoDisplay';
import {
  ProjectStatusOption,
  ProjectStatusSelector,
} from 'components/quick-actions/modals/github/ProjectStatusSelector';
import { StatusOption, StatusSelector } from 'components/quick-actions/modals/github/StatusSelector';
import { API_URL } from 'config/api';

/** Valid GitHub issue state values used in the update-status API call. */
const ISSUE_STATE_OPEN = 'open' as const;
const ISSUE_STATE_CLOSED = 'closed' as const;

/** Error color token for inline fetch error messages. */
const FETCH_ERROR_COLOR = theme_error_fallback();
function theme_error_fallback() {
  // Use the theme error color — imported lazily to avoid circular deps in this module.
  // '#EF4444' matches theme.colors.error from the design system.
  return '#EF4444' as const;
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a selected status option name to the GitHub issue state value.
 * Explicit mapping guards against silent fallback when new states are added.
 */
function mapStatusNameToIssueState(statusName: string): 'open' | 'closed' {
  const normalised = statusName.toLowerCase().trim();
  if (normalised === ISSUE_STATE_CLOSED) {
    return ISSUE_STATE_CLOSED;
  }
  if (normalised === ISSUE_STATE_OPEN) {
    return ISSUE_STATE_OPEN;
  }
  // Unrecognised value — default to open and surface in dev tools.
  console.warn(`[GitHubUpdateStatusModal] Unrecognised status name "${statusName}", defaulting to "open".`);
  return ISSUE_STATE_OPEN;
}

// ---------------------------------------------------------------------------
// Sub-component: fetch error + retry
// ---------------------------------------------------------------------------

interface FetchErrorViewProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

function FetchErrorView({ message, retryLabel, onRetry }: FetchErrorViewProps) {
  return (
    <div>
      <p style={{ color: FETCH_ERROR_COLOR, fontSize: '0.875rem', marginBottom: '8px' }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontSize: '0.875rem',
          cursor: 'pointer',
          padding: '4px 8px',
          border: '1px solid currentColor',
          borderRadius: '4px',
          background: 'none',
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
      } catch (err: unknown) {
        setFetchError(
          getAxiosErrorMessage(
            err,
            t('quickActions.github.failedToLoadOptions', { defaultValue: 'Failed to load project status options.' })
          )
        );
      } finally {
        setFetchingOptions(false);
      }
    };

    fetchProjectOptions();
  }, [issueInfo.owner, issueInfo.repo, issueInfo.number, projectName, t, retryCount]);

  // Populate hardcoded Open/Closed options for the non-project path
  useEffect(() => {
    if (projectName) {
      return;
    }
    setStatusOptions([
      { id: ISSUE_STATE_OPEN, name: t('quickActions.github.statusOpen', { defaultValue: 'Open' }) },
      { id: ISSUE_STATE_CLOSED, name: t('quickActions.github.statusClosed', { defaultValue: 'Closed' }) },
    ]);
    setOptionsLoading(false);
  }, [projectName, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await submitStatusUpdate();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(
        getAxiosErrorMessage(
          err,
          t('quickActions.github.failedToUpdateStatus', { defaultValue: 'Failed to update status' })
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const submitStatusUpdate = async () => {
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
      const state = mapStatusNameToIssueState(selectedStatus);
      await axios.post(`${API_URL}/suggested-actions/github/update-status`, {
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        issueNumber: issueInfo.number,
        state,
      });
    }
  };

  // In project mode, the submit button is disabled when no option is selected
  const isSubmitDisabled = projectName ? !selectedOptionId : !selectedStatus.trim();

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
                <FetchErrorView
                  message={fetchError}
                  retryLabel={t('common.retry', { defaultValue: 'Retry' })}
                  onRetry={() => setRetryCount(prev => prev + 1)}
                />
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
