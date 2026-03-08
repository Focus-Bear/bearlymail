import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

import { API_URL } from 'config/api';
import { CATEGORY_OTHER } from 'constants/strings';

interface EmailsPerDayEntry {
  date: string;
  count: string;
  category: string | null;
}

interface ReplyTimeEntry {
  category: string | null;
  avgReplyTimeMinutes: string;
  minReplyTimeMinutes: string;
  maxReplyTimeMinutes: string;
  repliedCount: string;
}

interface TotalByCategoryEntry {
  category: string | null;
  total: string;
}

export interface EmailStats {
  days: number;
  emailsPerDay: EmailsPerDayEntry[];
  replyTimesByCategory: ReplyTimeEntry[];
  totalByCategory: TotalByCategoryEntry[];
}

export interface DailyCount {
  date: string;
  total: number;
  byCategory: Record<string, number>;
}

export interface CategoryStats {
  category: string;
  totalEmails: number;
  avgReplyTimeMinutes: number | null;
  minReplyTimeMinutes: number | null;
  maxReplyTimeMinutes: number | null;
  repliedCount: number;
}

export interface ProcessedEmailStats {
  dailyCounts: DailyCount[];
  categoryStats: CategoryStats[];
  totalEmails: number;
  avgEmailsPerDay: number;
  days: number;
}

function processStats(raw: EmailStats): ProcessedEmailStats {
  const dailyMap = new Map<string, DailyCount>();
  for (const entry of raw.emailsPerDay) {
    const existing = dailyMap.get(entry.date);
    const count = parseInt(entry.count, 10);
    const cat = entry.category || CATEGORY_OTHER;
    if (existing) {
      existing.total += count;
      existing.byCategory[cat] = (existing.byCategory[cat] || 0) + count;
    } else {
      dailyMap.set(entry.date, {
        date: entry.date,
        total: count,
        byCategory: { [cat]: count },
      });
    }
  }
  const dailyCounts = Array.from(dailyMap.values()).sort((itemA, itemB) => itemA.date.localeCompare(itemB.date));

  const totalMap = new Map<string, number>();
  for (const entry of raw.totalByCategory) {
    const cat = entry.category || CATEGORY_OTHER;
    totalMap.set(cat, (totalMap.get(cat) || 0) + parseInt(entry.total, 10));
  }

  const replyMap = new Map<string, ReplyTimeEntry>();
  for (const entry of raw.replyTimesByCategory) {
    replyMap.set(entry.category || CATEGORY_OTHER, entry);
  }

  const allCategories = new Set([...totalMap.keys(), ...replyMap.keys()]);
  const categoryStats: CategoryStats[] = Array.from(allCategories)
    .map(cat => {
      const reply = replyMap.get(cat);
      return {
        category: cat,
        totalEmails: totalMap.get(cat) || 0,
        avgReplyTimeMinutes: reply ? parseFloat(reply.avgReplyTimeMinutes) : null,
        minReplyTimeMinutes: reply ? parseFloat(reply.minReplyTimeMinutes) : null,
        maxReplyTimeMinutes: reply ? parseFloat(reply.maxReplyTimeMinutes) : null,
        repliedCount: reply ? parseInt(reply.repliedCount, 10) : 0,
      };
    })
    .sort((itemA, itemB) => itemB.totalEmails - itemA.totalEmails);

  const totalEmails = categoryStats.reduce((sum, cat) => sum + cat.totalEmails, 0);
  const activeDays = dailyCounts.length || 1;

  return {
    dailyCounts,
    categoryStats,
    totalEmails,
    avgEmailsPerDay: Math.round((totalEmails / activeDays) * 10) / 10,
    days: raw.days,
  };
}

export function useEmailStats(days = 30) {
  const [stats, setStats] = useState<ProcessedEmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<EmailStats>(`${API_URL}/emails/stats?days=${days}`);
      setStats(processStats(response.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stats';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
