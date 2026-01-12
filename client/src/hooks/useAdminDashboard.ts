import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import axios from 'axios';
import { ADMIN_TAB_WAITLIST, AdminTab } from 'constants/adminTabs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const DEFAULT_EXTEND_DAYS = 7;

export interface WaitlistEntry {
  id: string;
  email: string;
  firstName: string;
  reason: string;
  approved: boolean;
  createdAt: string;
}

export interface UserWithSubscription {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  trialStartedAt: string | null;
  createdAt: string;
}

export function useAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>(ADMIN_TAB_WAITLIST);
  const [loading, setLoading] = useState(true);
  const [extendingUserId, setExtendingUserId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(DEFAULT_EXTEND_DAYS);

  const fetchWaitlist = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/waitlist`);
      setWaitlist(response.data);
    } catch (error) {
      console.error('Error fetching waitlist:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/subscriptions/all-users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/inbox');
      return;
    }
    fetchWaitlist();
    fetchUsers();
  }, [user, navigate, fetchWaitlist, fetchUsers]);

  const handleExtendTrial = useCallback(async (userId: string) => {
    try {
      await axios.post(`${API_URL}/subscriptions/extend-trial`, {
        userId,
        days: extendDays,
      });
      alert(`Trial extended by ${extendDays} days successfully!`);
      setExtendingUserId(null);
      setExtendDays(DEFAULT_EXTEND_DAYS);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error extending trial:', error);
      alert(error.response?.data?.message || 'Failed to extend trial');
    }
  }, [extendDays, fetchUsers]);

  const handleApprove = useCallback(async (id: string) => {
    try {
      await axios.put(`${API_URL}/waitlist/${id}/approve`);
      await fetchWaitlist();
    } catch (error) {
      console.error('Error approving:', error);
    }
  }, [fetchWaitlist]);

  const pending = waitlist.filter(w => !w.approved);
  const approved = waitlist.filter(w => w.approved);

  return {
    waitlist,
    users,
    activeTab,
    setActiveTab,
    loading,
    extendingUserId,
    setExtendingUserId,
    extendDays,
    setExtendDays,
    handleExtendTrial,
    handleApprove,
    pending,
    approved,
  };
}

