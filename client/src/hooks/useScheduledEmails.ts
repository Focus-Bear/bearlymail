import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';

export interface ScheduledEmail {
  id: string;
  emailType: 'reply' | 'new';
  threadId?: string;
  emailId?: string;
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  scheduledSendAt: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  userTimezone?: string;
}

export interface TimeSuggestion {
  label: string;
  value: string;
  description: string;
}

export interface TimeCheckResult {
  isAppropriate: boolean;
  warning?: string;
  suggestion?: string;
}

export function useScheduledEmails() {
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeSuggestions, setTimeSuggestions] = useState<TimeSuggestion[]>([]);

  const fetchScheduledEmails = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get<ScheduledEmail[]>(`${API_URL}/scheduled-emails`);
      setScheduledEmails(response.data);
    } catch (error) {
      console.error('Failed to fetch scheduled emails:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTimeSuggestions = useCallback(async (userTimezone?: string) => {
    try {
      const params = userTimezone ? { timezone: userTimezone } : {};
      const response = await axios.get<TimeSuggestion[]>(
        `${API_URL}/scheduled-emails/suggestions`,
        { params }
      );
      setTimeSuggestions(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch time suggestions:', error);
      return [];
    }
  }, []);

  const checkSendTime = useCallback(async (scheduledSendAt: Date): Promise<TimeCheckResult> => {
    try {
      const response = await axios.post<TimeCheckResult>(
        `${API_URL}/scheduled-emails/check-time`,
        { scheduledSendAt: scheduledSendAt.toISOString() }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to check send time:', error);
      return { isAppropriate: true };
    }
  }, []);

  const cancelScheduledEmail = useCallback(async (scheduledEmailId: string) => {
    try {
      await axios.delete(`${API_URL}/scheduled-emails/${scheduledEmailId}`);
      setScheduledEmails(prev => prev.filter(e => e.id !== scheduledEmailId));
      return true;
    } catch (error) {
      console.error('Failed to cancel scheduled email:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchScheduledEmails();
    fetchTimeSuggestions();
  }, [fetchScheduledEmails, fetchTimeSuggestions]);

  return {
    scheduledEmails,
    loading,
    timeSuggestions,
    fetchScheduledEmails,
    fetchTimeSuggestions,
    checkSendTime,
    cancelScheduledEmail,
  };
}
