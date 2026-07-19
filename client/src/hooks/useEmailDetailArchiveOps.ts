import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import i18n from 'i18next';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { ANIMATION_TYPE_ARCHIVE } from 'constants/strings';
import { selectEmails } from 'store/selectors/emailSelectors';
import {
  addOptimisticArchive,
  addOptimisticSnooze,
  removeEmail,
  removeOptimisticArchive,
  removeOptimisticSnooze,
  restoreEmail,
} from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

import { EmailDetailOperationsOptions, EmailDetailState } from './useEmailDetailOperations.types';

// Pure helper: performs the optimistic archive update and background API call.
async function executeArchiveRequest(id: string, emailToArchive: Email | null, dispatch: AppDispatch) {
  dispatch(removeEmail(id));
  dispatch(addOptimisticArchive(id));
  try {
    await axios.put(`${API_URL}/emails/${id}/archive`);
  } catch (error) {
    console.error('Error archiving email:', error);
    if (emailToArchive) {
      dispatch(restoreEmail(emailToArchive));
      dispatch(removeOptimisticArchive(id));
    }
    throw error;
  }
}

// Pure helper: performs the optimistic snooze update and background API call.
async function executeSnoozeRequest(id: string, duration: string, emailToSnooze: Email | null, dispatch: AppDispatch) {
  dispatch(removeEmail(id));
  dispatch(addOptimisticSnooze(id));
  try {
    await axios.post(`${API_URL}/snooze/${id}`, { duration });
  } catch (error) {
    console.error('Error snoozing email:', error);
    if (emailToSnooze) {
      dispatch(restoreEmail(emailToSnooze));
      dispatch(removeOptimisticSnooze(id));
    }
    throw error;
  }
}

// Pure helper: runs the snooze flow, handling both callback and navigate paths.
async function executeSnoozeOp(params: {
  id: string;
  duration: string;
  emailToSnooze: Email | null;
  dispatch: AppDispatch;
  options: EmailDetailOperationsOptions;
  navigate: ReturnType<typeof useNavigate>;
  getInboxPath: () => string;
  setSnoozeInput?: (v: string) => void;
  setShowSnoozeInput?: (v: boolean) => void;
  clearInputs: boolean;
}) {
  const {
    id,
    duration,
    emailToSnooze,
    dispatch,
    options,
    navigate,
    getInboxPath,
    setSnoozeInput,
    setShowSnoozeInput,
    clearInputs,
  } = params;
  if (emailToSnooze) {
    dispatch(removeEmail(id));
    dispatch(addOptimisticSnooze(id));
  }
  if (clearInputs && setSnoozeInput && setShowSnoozeInput) {
    setSnoozeInput('');
    setShowSnoozeInput(false);
  }
  if (options.onSnoozeComplete) {
    try {
      await executeSnoozeRequest(id, duration, emailToSnooze, dispatch);
      options.onSnoozeComplete(id);
    } catch {
      options.onSnoozeComplete(id);
    }
  } else {
    navigate(getInboxPath());
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
      console.error('Error snoozing email:', error);
      if (emailToSnooze) {
        dispatch(restoreEmail(emailToSnooze));
        dispatch(removeOptimisticSnooze(id));
      }
    });
  }
}

interface PostReplyOpsParams {
  id: string | undefined;
  emails: Email[];
  dispatch: AppDispatch;
  options: EmailDetailOperationsOptions;
  navigate: ReturnType<typeof useNavigate>;
  getInboxPath: () => string;
}

// Sub-hook: post-reply archive and snooze operations (fire-and-forget style, no animation).
function usePostReplyOps({ id, emails, dispatch, options, navigate, getInboxPath }: PostReplyOpsParams) {
  const performArchiveAfterReply = useCallback(async () => {
    if (!id) {
      return;
    }
    const emailToArchive = emails.find(event => event.id === id);
    dispatch(removeEmail(id));
    dispatch(addOptimisticArchive(id));
    try {
      await axios.put(`${API_URL}/emails/${id}/archive`);
    } catch (error) {
      console.error('Error archiving email after reply:', error);
      dispatch(removeOptimisticArchive(id));
      if (emailToArchive) {
        dispatch(restoreEmail(emailToArchive));
      }
    }
    if (options.onArchiveComplete) {
      options.onArchiveComplete(id);
    } else {
      navigate(getInboxPath());
    }
  }, [id, emails, dispatch, options, navigate, getInboxPath]);

  const performSnoozeAfterReply = useCallback(
    async (duration: string) => {
      if (!id) {
        return;
      }
      const emailToSnooze = emails.find(event => event.id === id);
      dispatch(removeEmail(id));
      dispatch(addOptimisticSnooze(id));
      if (options.onSnoozeComplete) {
        options.onSnoozeComplete(id);
      } else {
        navigate(getInboxPath());
      }
      axios.post(`${API_URL}/snooze/${id}`, { duration, locale: i18n.language }).catch(error => {
        console.error('Error snoozing email after reply:', error);
        dispatch(removeOptimisticSnooze(id));
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
        }
      });
    },
    [id, emails, dispatch, options, navigate, getInboxPath]
  );

  return { performArchiveAfterReply, performSnoozeAfterReply };
}

interface ArchiveOpsParams {
  id: string | undefined;
  snoozeInput: EmailDetailState['snoozeInput'];
  setSnoozeInput: EmailDetailState['setSnoozeInput'];
  setShowSnoozeInput: EmailDetailState['setShowSnoozeInput'];
  options: EmailDetailOperationsOptions;
  getInboxPath: () => string;
  triggerAnimation: (type: 'send' | 'archive' | 'priority') => Promise<void>;
}

export function useEmailDetailArchiveOps({
  id,
  snoozeInput,
  setSnoozeInput,
  setShowSnoozeInput,
  options,
  getInboxPath,
  triggerAnimation,
}: ArchiveOpsParams) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const emails = useSelector(selectEmails);

  const { performArchiveAfterReply, performSnoozeAfterReply } = usePostReplyOps({
    id,
    emails,
    dispatch,
    options,
    navigate,
    getInboxPath,
  });

  const handleArchive = useCallback(async () => {
    if (!id) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.EMAIL_ARCHIVE_CLICKED, { email_id: id });
    const emailToArchive = emails.find(event => event.id === id) ?? null;
    if (options.onArchiveComplete) {
      if (emailToArchive) {
        dispatch(removeEmail(id));
        dispatch(addOptimisticArchive(id));
      }
      try {
        await executeArchiveRequest(id, emailToArchive, dispatch);
        options.onArchiveComplete(id);
      } catch {
        options.onArchiveComplete(id);
      }
    } else {
      if (emailToArchive) {
        dispatch(removeEmail(id));
        dispatch(addOptimisticArchive(id));
      }
      await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
      navigate(getInboxPath());
      axios.put(`${API_URL}/emails/${id}/archive`).catch(error => {
        console.error('Error archiving email:', error);
        if (emailToArchive) {
          dispatch(restoreEmail(emailToArchive));
          dispatch(removeOptimisticArchive(id));
        }
      });
    }
  }, [id, triggerAnimation, navigate, getInboxPath, options, dispatch, emails]);

  const handleSnooze = useCallback(
    async (durationOverride?: string) => {
      const duration = durationOverride || snoozeInput.trim();
      if (!id || !duration) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CONFIRMED, { email_id: id, snooze_input_length: duration.length });
      const emailToSnooze = emails.find(event => event.id === id) ?? null;
      await executeSnoozeOp({
        id,
        duration,
        emailToSnooze: emailToSnooze,
        dispatch,
        options,
        navigate,
        getInboxPath,
        setSnoozeInput,
        setShowSnoozeInput,
        clearInputs: !durationOverride,
      });
    },
    [id, snoozeInput, setSnoozeInput, setShowSnoozeInput, navigate, getInboxPath, options, dispatch, emails]
  );

  const handleDelete = useCallback(async () => {
    if (!id) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.EMAIL_DELETE_CLICKED, { email_id: id });
    await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
    navigate(getInboxPath());
    axios.delete(`${API_URL}/emails/${id}`).catch(error => {
      console.error('Error deleting email:', error);
    });
  }, [id, triggerAnimation, navigate, getInboxPath]);

  return {
    performArchiveAfterReply,
    performSnoozeAfterReply,
    handleArchive,
    handleSnooze,
    handleDelete,
  };
}
