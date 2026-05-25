import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';
import { getMfaErrorType } from 'utils/mfaErrors';

import { useAdminMfa } from 'components/admin/AdminMfaGate';
import { API_URL } from 'config/api';
import { ADMIN_TAB_WAITLIST, AdminTab } from 'constants/adminTabs';
import { useAuth } from 'contexts/AuthContext';

const DEFAULT_EXTEND_DAYS = 7;
const DEFAULT_USERS_PAGE_LIMIT = 50;

export interface WaitlistEntry {
  id: string;
  email: string;
  firstName: string;
  reason: string;
  emailSystem?: string;
  emailSystemOther?: string;
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
  needsRelogin?: boolean;
  lastLogoutReason?: string | null;
  lastLogoutAt?: string | null;
}

export function useAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTab>(ADMIN_TAB_WAITLIST);
  const [loading, setLoading] = useState(true);
  const [extendingUserId, setExtendingUserId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(DEFAULT_EXTEND_DAYS);

  const fetchWaitlist = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/waitlist`);
      setWaitlist(response.data);
    } catch (error) {
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return;
}
      console.error('Error fetching waitlist:', error);
    } finally {
      setLoading(false);
    }
  }, [onMfaRequired]);

  const fetchUsers = useCallback(async (page: number = 1) => {
    try {
      const response = await axios.get(`${API_URL}/subscriptions/all-users`, {
        params: { page, limit: DEFAULT_USERS_PAGE_LIMIT },
      });
      const { users: fetchedUsers, total, totalPages } = response.data;
      setUsers(fetchedUsers);
      setUsersTotal(total);
      setUsersTotalPages(totalPages);
      setUsersPage(page);
    } catch (error) {
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return;
}
      console.error('Error fetching users:', error);
    }
  }, [onMfaRequired]);

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/inbox');
      return;
    }
    fetchWaitlist();
    fetchUsers(1);
  }, [user, navigate, fetchWaitlist, fetchUsers, mfaVerifiedAt]);

  const handleExtendTrial = useCallback(
    async (userId: string) => {
      try {
        await axios.post(`${API_URL}/subscriptions/extend-trial`, {
          userId,
          days: extendDays,
        });
        alert(`Trial extended by ${extendDays} days successfully!`);
        setExtendingUserId(null);
        setExtendDays(DEFAULT_EXTEND_DAYS);
        await fetchUsers(usersPage);
      } catch (error: unknown) {
        console.error('Error extending trial:', error);
        alert(getAxiosErrorMessage(error, 'Failed to extend trial'));
      }
    },
    [extendDays, fetchUsers, usersPage]
  );

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await axios.put(`${API_URL}/waitlist/${id}/approve`);
        await fetchWaitlist();
      } catch (error) {
        console.error('Error approving:', error);
      }
    },
    [fetchWaitlist]
  );

  const handleDecline = useCallback(
    async (id: string) => {
      try {
        await axios.delete(`${API_URL}/waitlist/${id}`);
        await fetchWaitlist();
      } catch (error) {
        console.error('Error declining:', error);
      }
    },
    [fetchWaitlist]
  );

  const pending = waitlist.filter(waitlistItem => !waitlistItem.approved);
  const approved = waitlist.filter(waitlistItem => waitlistItem.approved);

  const handleUsersPageChange = useCallback(
    (page: number) => {
      fetchUsers(page);
    },
    [fetchUsers]
  );

  return {
    waitlist,
    users,
    usersPage,
    usersTotalPages,
    usersTotal,
    activeTab,
    setActiveTab,
    loading,
    extendingUserId,
    setExtendingUserId,
    extendDays,
    setExtendDays,
    handleExtendTrial,
    handleUsersPageChange,
    handleApprove,
    handleDecline,
    pending,
    approved,
  };
}
