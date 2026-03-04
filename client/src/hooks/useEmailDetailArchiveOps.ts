import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';
import {
  removeEmail,
  addOptimisticArchive,
  restoreEmail,
  removeOptimisticArchive,
  addOptimisticSnooze,
  removeOptimisticSnooze,
} from 'store/slices/emailSlice';
import { selectEmails } from 'store/selectors/emailSelectors';
import { ANIMATION_TYPE_ARCHIVE } from 'constants/strings';
import { API_URL } from 'config/api';
import { AppDispatch } from 'store/store';
import { EmailDetailOperationsOptions, EmailDetailState } from './useEmailDetailOperations.types';

// Pure helper: performs the optimistic archive update and background API call.
async function executeArchiveRequest(id: string, emailToArchive: any, dispatch: AppDispatch) {
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
async function executeSnoozeRequest(id: string, duration: string, emailToSnooze: any, dispatch: AppDispatch) {
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

  const performArchiveAfterReply = useCallback(async () => {
    if (!id) return;
    const emailToArchive = emails.find(e => e.id === id);
    dispatch(removeEmail(id));
    dispatch(addOptimisticArchive(id));
    if (options.onArchiveComplete) { options.onArchiveComplete(id); } else { navigate(getInboxPath()); }
    axios.put(`${API_URL}/emails/${id}/archive`).catch((error) => {
      console.error('Error archiving email after reply:', error);
      dispatch(removeOptimisticArchive(id));
      if (emailToArchive) dispatch(restoreEmail(emailToArchive));
    });
  }, [id, emails, dispatch, options, navigate, getInboxPath]);

  const performSnoozeAfterReply = useCallback(async (duration: string) => {
    if (!id) return;
    const emailToSnooze = emails.find(e => e.id === id);
    dispatch(removeEmail(id));
    dispatch(addOptimisticSnooze(id));
    if (options.onSnoozeComplete) { options.onSnoozeComplete(id); } else { navigate(getInboxPath()); }
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch((error) => {
      console.error('Error snoozing email after reply:', error);
      dispatch(removeOptimisticSnooze(id));
      if (emailToSnooze) dispatch(restoreEmail(emailToSnooze));
    });
  }, [id, emails, dispatch, options, navigate, getInboxPath]);

  const handleArchive = useCallback(async () => {
    if (!id) return;
    captureEvent('email_archive_clicked', { email_id: id });
    const emailToArchive = emails.find(e => e.id === id);
    if (options.onArchiveComplete) {
      if (emailToArchive) { dispatch(removeEmail(id)); dispatch(addOptimisticArchive(id)); }
      try {
        await executeArchiveRequest(id, emailToArchive, dispatch);
        options.onArchiveComplete(id);
      } catch {
        options.onArchiveComplete(id);
      }
    } else {
      if (emailToArchive) { dispatch(removeEmail(id)); dispatch(addOptimisticArchive(id)); }
      await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
      navigate('/inbox');
      axios.put(`${API_URL}/emails/${id}/archive`).catch((error) => {
        console.error('Error archiving email:', error);
        if (emailToArchive) { dispatch(restoreEmail(emailToArchive)); dispatch(removeOptimisticArchive(id)); }
      });
    }
  }, [id, triggerAnimation, navigate, options, dispatch, emails]);

  const handleSnooze = useCallback(async (durationOverride?: string) => {
    const duration = durationOverride || snoozeInput.trim();
    if (!id || !duration) return;
    captureEvent('email_snooze_confirmed', { email_id: id, snooze_input_length: duration.length });
    const emailToSnooze = emails.find(e => e.id === id);
    if (emailToSnooze) { dispatch(removeEmail(id)); dispatch(addOptimisticSnooze(id)); }
    if (!durationOverride) { setSnoozeInput(''); setShowSnoozeInput(false); }
    if (options.onSnoozeComplete) {
      try {
        await executeSnoozeRequest(id, duration, emailToSnooze, dispatch);
        options.onSnoozeComplete(id);
      } catch {
        options.onSnoozeComplete(id);
      }
    } else {
      navigate('/inbox');
      axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
        console.error('Error snoozing email:', error);
        if (emailToSnooze) { dispatch(restoreEmail(emailToSnooze)); dispatch(removeOptimisticSnooze(id)); }
      });
    }
  }, [id, snoozeInput, setSnoozeInput, setShowSnoozeInput, navigate, options, dispatch, emails]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    captureEvent('email_delete_clicked', { email_id: id });
    await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
    navigate('/inbox');
    axios.delete(`${API_URL}/emails/${id}`).catch(error => {
      console.error('Error deleting email:', error);
    });
  }, [id, triggerAnimation, navigate]);

  return {
    performArchiveAfterReply,
    performSnoozeAfterReply,
    handleArchive,
    handleSnooze,
    handleDelete,
  };
}
