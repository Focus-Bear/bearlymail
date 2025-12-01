import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body?: string; // Optional - not included in inbox list queries for performance
  priorityScore: number;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  receivedAt: string;
  isProcessingPriority?: boolean;
  isProcessingSummary?: boolean;
  summary?: string | null;
  starCount?: number;
  isArchived?: boolean;
}

const Inbox: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout, refreshUser, loading: authLoading } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingModeSwitch, setLoadingModeSwitch] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [nextDelivery, setNextDelivery] = useState<Date | null>(null);
  const [mode, setMode] = useState<'triage' | 'process'>('triage');
  const [snoozeInput, setSnoozeInput] = useState<{ [key: string]: string }>({});
  const [showSnoozeInput, setShowSnoozeInput] = useState<string | null>(null);
  
  // Onboarding state
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [scanNotification, setScanNotification] = useState<{ show: boolean; progress: { current: number; total: number } | null }>({ show: false, progress: null });
  const [urgentNotification, setUrgentNotification] = useState<{ show: boolean; count: number; emails: Array<{ subject: string; from: string; priorityScore: number }> }>({ show: false, count: 0, emails: [] });
  const [triageSuggestions, setTriageSuggestions] = useState<Map<string, { suggestedStarCount: number; suggestedArchive: boolean; confidence: number; reasoning: string }>>(new Map());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [debugViewOpen, setDebugViewOpen] = useState(false);
  
  // Keyboard navigation and multi-select state
  const [selectedEmailIndex, setSelectedEmailIndex] = useState<number>(-1);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [showKeyboardHint, setShowKeyboardHint] = useState<{ emailId: string; action: string } | null>(null);

  // Tour element refs
  const triageTabRef = useRef<HTMLButtonElement>(null);
  const processTabRef = useRef<HTMLButtonElement>(null);
  const deliverBtnRef = useRef<HTMLButtonElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const tourSteps = [
    { title: t('onboarding.tour.welcome'), content: t('onboarding.tour.welcomeContent') },
    { title: t('onboarding.tour.triageTitle'), content: t('onboarding.tour.triageContent') },
    { title: t('onboarding.tour.processTitle'), content: t('onboarding.tour.processContent') },
    { title: t('onboarding.tour.deliveryTitle'), content: t('onboarding.tour.deliveryContent') },
  ];

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // Check if user needs to see tour (from database)
    if (user && !user.hasSeenTour) {
      setTourStep(0);
      return; // Don't show scan modal if tour isn't complete
    }
    
    // Only show scan modal if user has seen tour but hasn't scanned yet
    // Check explicitly for false/undefined to avoid showing if true
    const shouldShowScanModal = user && 
                                user.hasSeenTour && 
                                (user.hasScannedHistory === false || user.hasScannedHistory === undefined) &&
                                !isScanning && 
                                !showScanModal;
    
    if (shouldShowScanModal) {
      setShowScanModal(true);
    } else if (user && user.hasScannedHistory === true) {
      // Explicitly hide modal if user has scanned
      setShowScanModal(false);
    }
  }, [user, authLoading, isScanning, showScanModal]);

  // Poll for scan progress in background
  useEffect(() => {
    if (!isScanning) return;

    const progressInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/onboarding/scan-progress`);
        if (response.data.progress) {
          const { current, total } = response.data.progress;
          setScanProgress({ current, total });
          setScanNotification({ show: true, progress: { current, total } });
          
          // Check if completed (current equals total and total > 0)
          if (total > 0 && current >= total) {
            clearInterval(progressInterval);
            setIsScanning(false);
            // Wait a bit for backend to finish and save hasScannedHistory
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Refresh user to get latest state from DB (backend should have set hasScannedHistory: true)
            await refreshUser();
            // Verify it's set, if not set it manually
            const currentUser = await axios.get(`${API_URL}/users/me`).then(res => res.data);
            if (!currentUser?.hasScannedHistory) {
              await axios.put(`${API_URL}/users/me`, { hasScannedHistory: true });
              await refreshUser();
            }
            // Hide notification after 3 seconds
            setTimeout(() => {
              setScanNotification({ show: false, progress: null });
              setScanProgress(null);
            }, 3000);
          }
        } else {
          // No progress data - check if scan actually completed by checking user state
          try {
            await refreshUser();
            // Check the refreshed user from context instead of making another API call
            const currentUser = await axios.get(`${API_URL}/users/me`).then(res => res.data);
            if (currentUser?.hasScannedHistory) {
              clearInterval(progressInterval);
              setIsScanning(false);
              setScanNotification({ show: false, progress: null });
              setScanProgress(null);
            }
          } catch (err) {
            // Keep polling
          }
        }
      } catch (error) {
        console.error('Error fetching scan progress:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(progressInterval);
  }, [isScanning, refreshUser]);

  // Poll for email updates when processing
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkAndPoll = () => {
      // Check if any email is processing
      const hasProcessing = emails.some(e => e.isProcessingPriority || e.isProcessingSummary);
      if (hasProcessing) {
        if (!interval) {
          interval = setInterval(() => {
            fetchEmails();
          }, 3000);
        }
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    checkAndPoll();
    const checkInterval = setInterval(checkAndPoll, 1000); // Check every second

    return () => {
      if (interval) clearInterval(interval);
      clearInterval(checkInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.length]); // Only re-run when email count changes

  const markTourComplete = async () => {
    try {
      await axios.put(`${API_URL}/users/me`, { hasSeenTour: true });
      await refreshUser(); // Refresh user data from server
    } catch (error) {
      console.error('Failed to mark tour complete', error);
    }
  };

  const handleNextTourStep = () => {
    if (tourStep !== null && tourStep < tourSteps.length - 1) {
      setTourStep(tourStep + 1);
    } else {
      setTourStep(null);
      markTourComplete();
      // Show scan modal after tour
      if (user && !user.hasScannedHistory) {
        setShowScanModal(true);
      }
    }
  };

  const handleSkipTour = () => {
    setTourStep(null);
    markTourComplete();
    if (user && !user.hasScannedHistory) {
      setShowScanModal(true);
    }
  };

  const handleStartScan = async () => {
    setShowScanModal(false); // Close modal immediately
    setIsScanning(true);
    setScanNotification({ show: true, progress: { current: 0, total: 100 } });
    try {
      await axios.post(`${API_URL}/onboarding/scan`);
      // Progress polling is handled by useEffect
    } catch (error) {
      console.error('Scan failed', error);
      setIsScanning(false);
      setScanNotification({ show: false, progress: null });
    }
  };

  // Wait for auth to finish, then fetch emails on initial load
  useEffect(() => {
    if (authLoading) return; // Still loading auth
    
    if (!user) {
      setLoading(false); // No user, stop loading
      return;
    }
    
    // Refresh user data on mount to ensure we have latest state (including hasScannedHistory)
    const initializeData = async () => {
      // Refresh user to get latest hasScannedHistory from DB
      await refreshUser();
      
      // User is loaded and auth is done - fetch emails
      if (!hasInitiallyLoaded) {
        setHasInitiallyLoaded(true);
        fetchEmails();
        fetchBatchStatus();
        
        // Trigger sync in background after a short delay (only if user is connected)
        setTimeout(() => {
          axios.post(`${API_URL}/emails/check-urgent`).catch(err => 
            console.error('Error triggering initial email sync:', err)
          );
        }, 2000);
      }
    };
    
    initializeData();
  }, [authLoading, user, hasInitiallyLoaded]);

  // Re-fetch when mode changes (after initial load)
  useEffect(() => {
    if (hasInitiallyLoaded && user && !authLoading) {
      // Only show loading spinner, don't clear emails immediately to avoid flash
      setLoadingModeSwitch(true);
      // Don't set main loading state to true - just use loadingModeSwitch
      // This prevents the whole page from looking like it's reloading
      fetchEmails().finally(() => {
        setLoadingModeSwitch(false);
      });
      fetchBatchStatus();
    }
  }, [mode]);

  // Fetch triage suggestions when in triage mode with emails
  useEffect(() => {
    if (mode === 'triage' && emails.length > 0 && !loadingSuggestions) {
      fetchTriageSuggestions();
    }
  }, [mode, emails.length]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Up/Down arrow keys for navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedEmailIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedEmailIndex(prev => Math.min(emails.length - 1, prev + 1));
      }
      // Number keys 1-3 for star count
      else if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        const starCount = parseInt(e.key);
        if (selectedEmailIndex >= 0 && selectedEmailIndex < emails.length) {
          const email = emails[selectedEmailIndex];
          handleSetStarCount(email.id, starCount);
        } else if (selectedEmailIds.size > 0) {
          // Bulk operation on selected emails
          Promise.all(Array.from(selectedEmailIds).map(id => handleSetStarCount(id, starCount)));
        }
      }
      // Delete/Backspace for archive
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selectedEmailIndex >= 0 && selectedEmailIndex < emails.length) {
          const email = emails[selectedEmailIndex];
          handleArchive(email.id, { stopPropagation: () => {} } as React.MouseEvent);
        } else if (selectedEmailIds.size > 0) {
          // Bulk archive
          Promise.all(Array.from(selectedEmailIds).map(id => 
            handleArchive(id, { stopPropagation: () => {} } as React.MouseEvent)
          ));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [emails, selectedEmailIndex, selectedEmailIds]);

  // Reset selection when emails change
  useEffect(() => {
    setSelectedEmailIndex(-1);
    setSelectedEmailIds(new Set());
  }, [mode, emails.length]);

  // Handle email click for multi-select
  const handleEmailClick = (emailId: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (e.shiftKey && lastSelectedIndex >= 0) {
      // Shift+Click: Select range
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set(selectedEmailIds);
      for (let i = start; i <= end; i++) {
        newSelected.add(emails[i].id);
      }
      setSelectedEmailIds(newSelected);
      setSelectedEmailIndex(index);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: Toggle selection
      const newSelected = new Set(selectedEmailIds);
      if (newSelected.has(emailId)) {
        newSelected.delete(emailId);
      } else {
        newSelected.add(emailId);
      }
      setSelectedEmailIds(newSelected);
      setSelectedEmailIndex(index);
      setLastSelectedIndex(index);
    } else {
      // Regular click: Single selection
      setSelectedEmailIds(new Set([emailId]));
      setSelectedEmailIndex(index);
      setLastSelectedIndex(index);
    }
  };

  // Bulk operations
  const handleBulkArchive = async () => {
    if (selectedEmailIds.size === 0) return;
    await Promise.all(Array.from(selectedEmailIds).map(id => 
      handleArchive(id, { stopPropagation: () => {} } as React.MouseEvent)
    ));
    setSelectedEmailIds(new Set());
  };

  const handleBulkStar = async (starCount: number) => {
    if (selectedEmailIds.size === 0) return;
    await Promise.all(Array.from(selectedEmailIds).map(id => handleSetStarCount(id, starCount)));
    setSelectedEmailIds(new Set());
  };

  const fetchBatchStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/batch-status`);
      if (response.data.nextDelivery) {
        setNextDelivery(new Date(response.data.nextDelivery));
      } else {
        setNextDelivery(null);
      }
    } catch (error) {
      console.error('Error fetching batch status:', error);
    }
  };

  const fetchTriageSuggestions = async () => {
    if (emails.length === 0 || loadingSuggestions) return;
    
    setLoadingSuggestions(true);
    try {
      const emailIds = emails.slice(0, 20).map(e => e.id); // Limit to first 20 emails
      const response = await axios.post(`${API_URL}/priority/triage-suggestions`, { emailIds });
      const suggestionsMap = new Map();
      response.data.forEach((suggestion: any) => {
        suggestionsMap.set(suggestion.emailId, suggestion);
      });
      setTriageSuggestions(suggestionsMap);
    } catch (error) {
      console.error('Error fetching triage suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const fetchEmails = async () => {
    try {
      // Pass mode param (includeBatched is now irrelevant as user only sees what's delivered)
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`, response.data);
      setEmails(response.data);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingModeSwitch(false);
    }
  };

  const handleSnooze = async (emailId: string) => {
    const duration = snoozeInput[emailId];
    if (!duration) return;

    try {
      await axios.post(`${API_URL}/snooze/${emailId}`, { duration });
      setShowSnoozeInput(null);
      setSnoozeInput({ ...snoozeInput, [emailId]: '' });
      fetchEmails();
    } catch (error) {
      console.error('Error snoozing email:', error);
    }
  };

  const handleMarkAsRead = async (emailId: string) => {
    try {
      await axios.put(`${API_URL}/emails/${emailId}/read`);
      // Update local state instantly for better UX
      setEmails(emails.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleSetStarCount = async (emailId: string, starCount: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // Optimistic update - update UI immediately
    setEmails(prevEmails => prevEmails.map(email => 
      email.id === emailId ? { ...email, starCount } : email
    ));
    
    // Remove suggestion immediately
    const suggestion = triageSuggestions.get(emailId);
    if (suggestion) {
      const newSuggestions = new Map(triageSuggestions);
      newSuggestions.delete(emailId);
      setTriageSuggestions(newSuggestions);
    }
    
    try {
      await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount });
      
      // Track override if there was a suggestion
      if (suggestion) {
        await handleOverrideSuggestion(emailId, suggestion, { 
          starCount, 
          archived: false 
        });
      }
      
      // Refresh to ensure consistency (non-blocking)
      fetchEmails().catch(err => console.error('Error refreshing after star update:', err));
    } catch (error) {
      console.error('Error setting star count:', error);
      // Revert optimistic update on error
      fetchEmails();
    }
  };

  const handleToggleStar = async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const email = emails.find(e => e.id === emailId);
      const currentStarCount = email?.starCount || 0;
      // Cycle through: 0 -> 1 -> 2 -> 3 -> 0
      const newStarCount = (currentStarCount + 1) % 4;
      await handleSetStarCount(emailId, newStarCount);
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleArchive = async (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Optimistic update - remove from UI immediately
    const emailToArchive = emails.find(e => e.id === emailId);
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
    
    // Remove from selection if selected
    setSelectedEmailIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(emailId);
      return newSet;
    });
    
    // Remove suggestion immediately
    const suggestion = triageSuggestions.get(emailId);
    if (suggestion) {
      const newSuggestions = new Map(triageSuggestions);
      newSuggestions.delete(emailId);
      setTriageSuggestions(newSuggestions);
    }
    
    try {
      await axios.put(`${API_URL}/emails/${emailId}/archive`);
      
      // Track override if there was a suggestion
      if (suggestion) {
        await axios.post(`${API_URL}/priority/triage-suggestions/override`, {
          emailId,
          suggestion,
          userAction: { starCount: 0, archived: true },
        });
      }
      
      // Refresh to ensure consistency (non-blocking, but don't block UI)
      fetchEmails().catch(err => console.error('Error refreshing after archive:', err));
    } catch (error) {
      console.error('Error archiving email:', error);
      // Revert optimistic update on error - restore the email
      if (emailToArchive) {
        setEmails(prevEmails => [...prevEmails, emailToArchive].sort((a, b) => 
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ));
      }
      fetchEmails();
    }
  };

  const handleAcceptSuggestion = async (emailId: string, suggestion: any) => {
    try {
      // Apply the suggestion
      if (suggestion.suggestedArchive) {
        await axios.put(`${API_URL}/emails/${emailId}/archive`);
      } else if (suggestion.suggestedStarCount > 0) {
        await axios.put(`${API_URL}/emails/${emailId}/star-count`, {
          starCount: suggestion.suggestedStarCount,
        });
      }
      // Remove suggestion from map
      const newSuggestions = new Map(triageSuggestions);
      newSuggestions.delete(emailId);
      setTriageSuggestions(newSuggestions);
      fetchEmails();
    } catch (error) {
      console.error('Error accepting suggestion:', error);
    }
  };

  const handleOverrideSuggestion = async (
    emailId: string,
    suggestion: any,
    userAction: { starCount: number; archived: boolean }
  ) => {
    try {
      // Track the override for learning
      await axios.post(`${API_URL}/priority/triage-suggestions/override`, {
        emailId,
        suggestion,
        userAction,
      });
      // Remove suggestion from map
      const newSuggestions = new Map(triageSuggestions);
      newSuggestions.delete(emailId);
      setTriageSuggestions(newSuggestions);
    } catch (error) {
      console.error('Error tracking override:', error);
    }
  };

  const handleCheckUrgent = async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API_URL}/emails/check-urgent`);
      if (response.data.hasUrgent) {
        // Show notification with urgent email info - don't auto-dismiss, let user dismiss manually
        setUrgentNotification({
          show: true,
          count: response.data.urgentCount,
          emails: response.data.urgentEmails || [],
        });
        // Don't auto-hide urgent notifications - user should dismiss manually
      } else {
        // Show brief "no urgent emails" message - stay visible longer so user can see it
        setUrgentNotification({
          show: true,
          count: 0,
          emails: [],
        });
        // Keep it visible for 8 seconds so user can see the confirmation
        setTimeout(() => {
          setUrgentNotification(prev => {
            // Only auto-hide if still showing "no urgent" (count is 0)
            if (prev.count === 0) {
              return { show: false, count: 0, emails: [] };
            }
            return prev; // Keep urgent notifications visible
          });
        }, 8000);
      }
      // Refresh batch status
      fetchBatchStatus();
    } catch (error) {
      console.error('Error checking for urgent emails:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleForceCheck = async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API_URL}/emails/force-check`);
      console.log('Force check result:', response.data);
      // Update state with the returned emails
      setEmails(response.data);
      // Clear next delivery time as we just delivered everything
      setNextDelivery(null);
    } catch (error) {
      console.error('Error forcing check:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getPriorityBadge = (score: number) => {
    if (score >= 80) return { color: theme.colors.accent.error, label: t('priority.high'), bg: '#FEE2E2' };
    if (score >= 60) return { color: theme.colors.accent.warning, label: t('priority.medium'), bg: '#FEF3C7' };
    return { color: theme.colors.secondary.main, label: t('priority.low'), bg: '#D1FAE5' };
  };

  const SidebarItem: React.FC<{ label: string; path: string; active?: boolean; onClick?: () => void }> = ({ label, path, active, onClick }) => (
    <button
      onClick={onClick || (() => navigate(path))}
      style={{
        width: '100%',
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: active ? theme.colors.primary.subtle : 'transparent',
        color: active ? theme.colors.primary.main : theme.colors.text.secondary,
        border: 'none',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        transition: theme.transitions.fast,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = theme.colors.background.default;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text.secondary,
      }}>
        {t('inbox.loadingInbox')}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <div style={{
        width: '280px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.lg,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ marginBottom: theme.spacing['2xl'], paddingLeft: theme.spacing.md, display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
          <img 
            src="/favicon.svg" 
            alt="BearlyMail Icon" 
            style={{ 
              height: '28px', 
              width: 'auto',
              objectFit: 'contain'
            }}
          />
          <h2 style={{
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            letterSpacing: '-0.02em',
          }}>
            {t('common.appName')}
          </h2>
        </div>
        
        <nav style={{ flex: 1 }}>
          <SidebarItem label={t('inbox.title')} path="/inbox" active={location.pathname === '/inbox'} />
          <SidebarItem label={t('settings.title')} path="/settings" active={location.pathname === '/settings'} />
          {user?.isAdmin && (
            <SidebarItem label={t('admin.title')} path="/admin" active={location.pathname === '/admin'} />
          )}
        </nav>

        <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <div style={{
            padding: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.sm,
          }}>
            {user?.email}
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              transition: theme.transitions.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.text.primary;
              e.currentTarget.style.color = theme.colors.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border.medium;
              e.currentTarget.style.color = theme.colors.text.secondary;
            }}
          >
            {t('auth.logout')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        
        {/* Simple Modal-based Tour */}
        {tourStep !== null && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}>
            {/* Dynamic highlight overlay */}
            {(() => {
              let targetElement: HTMLElement | null = null;
              if (tourStep === 1 && triageTabRef.current) {
                targetElement = triageTabRef.current;
              } else if (tourStep === 2 && processTabRef.current) {
                targetElement = processTabRef.current;
              } else if (tourStep === 3 && deliverBtnRef.current) {
                targetElement = deliverBtnRef.current;
              }
              
              if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                return (
                  <div style={{
                    position: 'fixed',
                    top: rect.top - 4,
                    left: rect.left - 4,
                    width: rect.width + 8,
                    height: rect.height + 8,
                    border: `3px solid ${theme.colors.primary.main}`,
                    borderRadius: theme.borderRadius.full,
                    boxShadow: `0 0 0 4px rgba(59, 130, 246, 0.3)`,
                    pointerEvents: 'none',
                    zIndex: 1001,
                  }} />
                );
              }
              return null;
            })()}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: theme.colors.background.paper,
              padding: theme.spacing['2xl'],
              borderRadius: theme.borderRadius.lg,
              boxShadow: theme.shadows.xl,
              maxWidth: '500px',
              textAlign: 'center',
              zIndex: 1002,
            }}>
              <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
                {tourSteps[tourStep].title}
              </h2>
              <p style={{ marginBottom: theme.spacing.xl, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
                {tourSteps[tourStep].content}
              </p>
              
              <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
                <button
                  onClick={handleSkipTour}
                  style={{
                    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    backgroundColor: 'transparent',
                    color: theme.colors.text.secondary,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                  }}
                >
                  {t('onboarding.tour.skip')}
                </button>
                <button
                  onClick={handleNextTourStep}
                  style={{
                    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    backgroundColor: theme.colors.primary.main,
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}
                >
                  {tourStep === tourSteps.length - 1 ? t('onboarding.tour.finish') : t('onboarding.tour.next')}
                </button>
              </div>
              <div style={{ marginTop: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
                {t('onboarding.tour.stepProgress', { current: tourStep + 1, total: tourSteps.length })}
              </div>
            </div>
          </div>
        )}

        {/* Scan Permission Modal (Non-blocking - only shown initially) */}
        {showScanModal && !isScanning && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: theme.colors.background.overlay,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              backgroundColor: theme.colors.background.paper,
              padding: theme.spacing['2xl'],
              borderRadius: theme.borderRadius.lg,
              boxShadow: theme.shadows.xl,
              maxWidth: '500px',
              textAlign: 'center',
            }}>
              <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
                {t('onboarding.scan.title')}
              </h2>
              <p style={{ marginBottom: theme.spacing.xl, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
                {t('onboarding.scan.content')}
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                <button
                  onClick={handleStartScan}
                  style={{
                    padding: theme.spacing.lg,
                    backgroundColor: theme.colors.primary.main,
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    fontWeight: theme.typography.fontWeight.semibold,
                    cursor: 'pointer',
                  }}
                >
                  {t('onboarding.scan.startScan')}
                </button>
                <button
                  onClick={async () => {
                    // Mark as scanned (dismissed) so modal doesn't show again
                    try {
                      await axios.put(`${API_URL}/users/me`, { hasScannedHistory: true });
                      await refreshUser();
                    } catch (error) {
                      console.error('Error dismissing scan prompt:', error);
                    }
                    setShowScanModal(false);
                  }}
                  style={{
                    padding: theme.spacing.md,
                    backgroundColor: 'transparent',
                    color: theme.colors.text.secondary,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t('onboarding.scan.skip')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Non-blocking scan progress notification - positioned above inbox area */}
        {scanNotification.show && (
          <div style={{
            position: 'absolute',
            top: '120px', // Below header but above inbox content
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing.lg,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            minWidth: '300px',
            maxWidth: '500px',
            zIndex: 2000,
            border: `1px solid ${theme.colors.border.light}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
              <div style={{
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <h3 style={{ 
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.semibold,
                margin: 0,
              }}>
                {t('onboarding.scan.scanning')}
              </h3>
            </div>
            {scanNotification.progress && (
              <>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: theme.colors.border.light,
                  borderRadius: theme.borderRadius.full,
                  overflow: 'hidden',
                  marginBottom: theme.spacing.xs,
                }}>
                  <div style={{
                    width: `${(scanNotification.progress.current / scanNotification.progress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: theme.colors.primary.main,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <p style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  margin: 0,
                }}>
                  {t('onboarding.scan.progress', { current: scanNotification.progress.current, total: scanNotification.progress.total })}
                </p>
              </>
            )}
          </div>
        )}

        {/* Urgent emails notification */}
        {urgentNotification.show && (
          <div style={{
            position: 'fixed',
            top: urgentNotification.count > 0 ? theme.spacing.lg : undefined,
            bottom: urgentNotification.count === 0 ? theme.spacing.lg : undefined,
            right: theme.spacing.lg,
            backgroundColor: urgentNotification.count > 0 ? '#FEE2E2' : theme.colors.background.paper,
            padding: theme.spacing.lg,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            minWidth: '320px',
            maxWidth: '400px',
            zIndex: 2000,
            border: `2px solid ${urgentNotification.count > 0 ? theme.colors.accent.error : theme.colors.border.light}`,
          }}>
            {urgentNotification.count > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                  <span style={{ fontSize: '1.5rem' }}>🚨</span>
                  <h3 style={{ 
                    color: theme.colors.accent.error,
                    fontSize: theme.typography.fontSize.base,
                    fontWeight: theme.typography.fontWeight.bold,
                    margin: 0,
                  }}>
                    {urgentNotification.count} Urgent Email{urgentNotification.count > 1 ? 's' : ''} Found!
                  </h3>
                </div>
                <p style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.primary,
                  marginBottom: theme.spacing.md,
                }}>
                  You have urgent emails waiting. They'll be delivered at the next batch time.
                </p>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {urgentNotification.emails.slice(0, 3).map((email, idx) => (
                    <div key={idx} style={{
                      padding: theme.spacing.sm,
                      marginBottom: theme.spacing.xs,
                      backgroundColor: theme.colors.background.paper,
                      borderRadius: theme.borderRadius.md,
                      border: `1px solid ${theme.colors.border.light}`,
                    }}>
                      <div style={{
                        fontWeight: theme.typography.fontWeight.semibold,
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.primary,
                        marginBottom: theme.spacing.xs,
                      }}>
                        {email.subject}
                      </div>
                      <div style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.secondary,
                      }}>
                        From: {email.from} • Priority: {email.priorityScore.toFixed(0)}
                      </div>
                    </div>
                  ))}
                  {urgentNotification.count > 3 && (
                    <p style={{
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.text.secondary,
                      textAlign: 'center',
                      marginTop: theme.spacing.xs,
                    }}>
                      +{urgentNotification.count - 3} more urgent email{urgentNotification.count - 3 > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                    <button
                      onClick={() => setUrgentNotification({ show: false, count: 0, emails: [] })}
                      style={{
                        marginTop: theme.spacing.md,
                        width: '100%',
                        padding: theme.spacing.sm,
                        backgroundColor: theme.colors.accent.error,
                        color: 'white',
                        border: 'none',
                        borderRadius: theme.borderRadius.md,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                        fontWeight: theme.typography.fontWeight.medium,
                      }}
                    >
                      {t('common.dismiss')}
                    </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                <span>✓</span>
                <p style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                  margin: 0,
                }}>
                  {t('inbox.noUrgentEmailsFound')}
                </p>
              </div>
            )}
          </div>
        )}

        {user?.needsRelogin && (
          <div style={{
            backgroundColor: theme.colors.accent.error,
            color: 'white',
            padding: theme.spacing.md,
            textAlign: 'center',
            fontWeight: theme.typography.fontWeight.medium,
          }}>
            Action Required: Please <a href="/login" style={{ color: 'white', textDecoration: 'underline' }} onClick={logout}>log in again</a> to restore email synchronization.
          </div>
        )}
        {/* Header */}
        <header style={{
          padding: `${theme.spacing.lg} ${theme.spacing['2xl']}`,
          backgroundColor: theme.colors.background.paper, // Or transparent if you prefer
          borderBottom: `1px solid ${theme.colors.border.light}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              marginBottom: theme.spacing.xs,
            }}>
              {t('inbox.title')}
            </h1>
            <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
              <button
                ref={triageTabRef}
                className="triage-tab" // Added class for tour
                onClick={() => {
                  if (mode !== 'triage') {
                    setMode('triage');
                  }
                }}
                disabled={loadingModeSwitch}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: mode === 'triage' ? theme.colors.primary.subtle : 'transparent',
                  color: mode === 'triage' ? theme.colors.primary.main : theme.colors.text.secondary,
                  border: 'none',
                  borderRadius: theme.borderRadius.full,
                  cursor: loadingModeSwitch ? 'wait' : 'pointer',
                  fontWeight: theme.typography.fontWeight.semibold,
                  fontSize: theme.typography.fontSize.base,
                  opacity: loadingModeSwitch ? 0.6 : 1,
                }}
              >
                {loadingModeSwitch && mode === 'triage' ? 'Loading...' : t('inbox.triageTab')}
              </button>
              <button
                ref={processTabRef}
                className="process-tab" // Added class for tour
                onClick={() => {
                  if (mode !== 'process') {
                    setMode('process');
                  }
                }}
                disabled={loadingModeSwitch}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: mode === 'process' ? theme.colors.primary.subtle : 'transparent',
                  color: mode === 'process' ? theme.colors.primary.main : theme.colors.text.secondary,
                  border: 'none',
                  borderRadius: theme.borderRadius.full,
                  cursor: loadingModeSwitch ? 'wait' : 'pointer',
                  fontWeight: theme.typography.fontWeight.semibold,
                  fontSize: theme.typography.fontSize.base,
                  opacity: loadingModeSwitch ? 0.6 : 1,
                }}
              >
                {loadingModeSwitch && mode === 'process' ? 'Loading...' : t('inbox.processTab')}
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
            {nextDelivery && (
              <div style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                backgroundColor: theme.colors.background.subtle,
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.full,
                border: `1px solid ${theme.colors.border.medium}`,
              }}>
                {t('inbox.nextDelivery', { time: nextDelivery.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
              </div>
            )}

            <button
              ref={deliverBtnRef}
              className="deliver-btn" // Added class for tour
              onClick={handleCheckUrgent}
              disabled={refreshing}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.full,
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                boxShadow: theme.shadows.sm,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                opacity: refreshing ? 0.7 : 1,
                transition: theme.transitions.fast,
              }}
              onMouseEnter={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.dark)}
              onMouseLeave={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.main)}
            >
              {refreshing ? t('inbox.checkingUrgent') : t('inbox.checkUrgent')}
            </button>
          </div>
        </header>

            {/* Debug View - Collapsible Accordion */}
            <div style={{ 
              margin: theme.spacing.md,
              border: '2px solid #FFC107',
              borderRadius: theme.borderRadius.md,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setDebugViewOpen(!debugViewOpen)}
                style={{
                  width: '100%',
                  padding: theme.spacing.md,
                  backgroundColor: '#FFF3CD',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: theme.typography.fontWeight.bold,
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>🐛 DEBUG VIEW - Mode: {mode} | Total Threads: {(() => {
                  // Count unique threads (not emails), filter by mode and exclude archived
                  const visibleEmails = emails.filter(e => !e.isArchived);
                  const filteredByMode = mode === 'process' 
                    ? visibleEmails.filter(e => (e.starCount ?? 0) > 0)
                    : visibleEmails.filter(e => (e.starCount ?? 0) === 0);
                  const uniqueThreads = new Set(filteredByMode.map(e => e.threadId));
                  return uniqueThreads.size;
                })()} | Thread-Based Fetching</span>
                <span style={{ fontSize: theme.typography.fontSize.lg }}>
                  {debugViewOpen ? '▼' : '▶'}
                </span>
              </button>
              {debugViewOpen && (
                <div style={{ 
                  padding: theme.spacing.md, 
                  backgroundColor: '#FFF3CD', 
                  fontSize: theme.typography.fontSize.xs,
                  fontFamily: 'monospace',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}>
                  {emails.map((email) => {
                      const starCount = email.starCount ?? 0;
                      const shouldBeIn = starCount > 0 ? 'process' : 'triage';
                      const isInWrongTab = shouldBeIn !== mode;
                      const isArchived = email.isArchived ?? false;
                      return (
                        <div 
                          key={email.id} 
                          style={{ 
                            padding: theme.spacing.xs,
                            marginBottom: theme.spacing.xs,
                            backgroundColor: isArchived ? '#FFE6E6' : (isInWrongTab ? '#F8D7DA' : '#D1ECF1'),
                            border: `1px solid ${isArchived ? '#F5C6CB' : (isInWrongTab ? '#F5C6CB' : '#BEE5EB')}`,
                            borderRadius: theme.borderRadius.sm,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '500px' }}>
                              <span>
                                <strong>ThreadID:</strong> {email.threadId?.substring(0, 8)}... | 
                                <strong> EmailID:</strong> {email.id.substring(0, 8)}... | 
                                <strong> StarCount:</strong> {starCount} | 
                                <strong> Archived:</strong> {isArchived ? 'YES' : 'NO'} | 
                                <strong> Should be in:</strong> {shouldBeIn} | 
                                <strong> Current tab:</strong> {mode} | 
                                <strong> Priority:</strong> {email.priorityScore?.toFixed(1) || 'N/A'}
                                {isArchived && <span style={{ color: 'red', fontWeight: 'bold' }}> ⚠️ ARCHIVED!</span>}
                                {isInWrongTab && !isArchived && <span style={{ color: 'red', fontWeight: 'bold' }}> ❌ WRONG TAB!</span>}
                              </span>
                              <span style={{ fontSize: '0.65rem', color: theme.colors.text.secondary }}>
                                {email.subject || '(No Subject)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {emails.length === 0 && (
                    <div style={{ color: theme.colors.text.secondary }}>
                      No threads to display in debug view
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bulk Operations Bar */}
            {selectedEmailIds.size > 0 && (
              <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                margin: theme.spacing.md,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: theme.shadows.md,
              }}>
                <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
                  {selectedEmailIds.size} email{selectedEmailIds.size > 1 ? 's' : ''} selected
                </span>
                <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                  {[1, 2, 3].map(count => (
                    <button
                      key={count}
                      onClick={() => handleBulkStar(count)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                      }}
                    >
                      {'⭐'.repeat(count)}
                    </button>
                  ))}
                  <button
                    onClick={handleBulkArchive}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    Archive
                  </button>
                  <button
                    onClick={() => setSelectedEmailIds(new Set())}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Keyboard Hint Tooltip */}
            {showKeyboardHint && (
              <div style={{
                position: 'fixed',
                bottom: theme.spacing['2xl'],
                right: theme.spacing['2xl'],
                backgroundColor: theme.colors.background.paper,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                boxShadow: theme.shadows.lg,
                border: `1px solid ${theme.colors.border.medium}`,
                zIndex: 1000,
                maxWidth: '300px',
              }}>
                <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                  💡 {showKeyboardHint.action}
                </div>
              </div>
            )}

            {/* Email List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing['2xl'] }}>
              <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                {loading || !hasInitiallyLoaded || loadingModeSwitch ? (
                  // Show loading state while emails are being fetched
                  <div style={{
                    padding: theme.spacing['3xl'],
                    textAlign: 'center',
                    backgroundColor: theme.colors.background.paper,
                    borderRadius: theme.borderRadius.xl,
                    border: `1px dashed ${theme.colors.border.medium}`,
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      border: `3px solid ${theme.colors.border.light}`,
                      borderTop: `3px solid ${theme.colors.primary.main}`,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto',
                      marginBottom: theme.spacing.md,
                    }} />
                    <h3 style={{ 
                      color: theme.colors.text.primary, 
                      marginBottom: theme.spacing.sm,
                      fontWeight: theme.typography.fontWeight.semibold 
                    }}>
                      {t('inbox.loadingEmails')}
                    </h3>
                    <p style={{ color: theme.colors.text.secondary }}>
                      {t('inbox.loadingEmailsSub')}
                    </p>
                  </div>
                ) : emails.length === 0 && !loading && !loadingModeSwitch ? (
                  // Show inbox zero only after emails have loaded and there are none (and not switching modes)
                  <div style={{
                    padding: theme.spacing['3xl'],
                    textAlign: 'center',
                    backgroundColor: theme.colors.background.paper,
                    borderRadius: theme.borderRadius.xl,
                    border: `1px dashed ${theme.colors.border.medium}`,
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>📭</div>
                    <h3 style={{ 
                      color: theme.colors.text.primary, 
                      marginBottom: theme.spacing.sm,
                      fontWeight: theme.typography.fontWeight.semibold 
                    }}>
                      {mode === 'triage' ? t('inbox.noTriageEmails') : t('inbox.noProcessEmails')}
                    </h3>
                    <p style={{ color: theme.colors.text.secondary }}>
                      {mode === 'triage' ? t('inbox.triageCaughtUp') : t('inbox.processCaughtUp')}
                    </p>
                  </div>
                ) : loadingModeSwitch ? (
                  // Show loading when switching modes (even if emails exist from previous mode)
                  <div style={{
                    padding: theme.spacing['3xl'],
                    textAlign: 'center',
                    backgroundColor: theme.colors.background.paper,
                    borderRadius: theme.borderRadius.xl,
                    border: `1px dashed ${theme.colors.border.medium}`,
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      border: `3px solid ${theme.colors.border.light}`,
                      borderTop: `3px solid ${theme.colors.primary.main}`,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto',
                      marginBottom: theme.spacing.md,
                    }} />
                    <h3 style={{ 
                      color: theme.colors.text.primary, 
                      marginBottom: theme.spacing.sm,
                      fontWeight: theme.typography.fontWeight.semibold 
                    }}>
                      Loading {mode === 'process' ? 'starred' : 'unstarred'} emails...
                    </h3>
                  </div>
                ) : (
              // Filter out archived emails as a safety check (backend should already filter)
              emails.filter(email => !email.isArchived).map((email, index) => {
                const priority = getPriorityBadge(email.priorityScore);
                const suggestion = mode === 'triage' ? triageSuggestions.get(email.id) : null;
                const isSelected = selectedEmailIds.has(email.id) || selectedEmailIndex === index;
                return (
                  <div key={email.id} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
                    {/* Simplified Triage Suggestion with arrow pointing to star location */}
                    {suggestion && mode === 'triage' && suggestion.suggestedStarCount > 0 && (
                      <div
                        style={{
                          backgroundColor: theme.colors.background.subtle,
                          border: `1px solid ${theme.colors.border.light}`,
                          borderRadius: theme.borderRadius.md,
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          marginBottom: theme.spacing.xs,
                          fontSize: theme.typography.fontSize.xs,
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          position: 'relative',
                        }}
                      >
                        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs }}>
                          💡 Suggested:
                        </span>
                        {/* Faint suggested stars - click to apply */}
                        <div 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleSetStarCount(email.id, suggestion.suggestedStarCount);
                          }}
                          style={{
                            display: 'flex',
                            gap: '2px',
                            opacity: 0.5,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.5';
                          }}
                          title={`Click to set ${suggestion.suggestedStarCount} stars (or press ${suggestion.suggestedStarCount})`}
                        >
                          {'⭐'.repeat(suggestion.suggestedStarCount)}
                        </div>
                        {/* Arrow pointing to where stars will appear */}
                        <span style={{ 
                          color: theme.colors.text.tertiary, 
                          fontSize: theme.typography.fontSize.xs,
                          marginLeft: 'auto',
                        }}>
                          →
                        </span>
                      </div>
                    )}
                    <div
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey || e.shiftKey) {
                          handleEmailClick(email.id, index, e);
                        } else {
                          handleMarkAsRead(email.id);
                          navigate(`/email/${email.id}`);
                        }
                      }}
                      className="animate-fade-in"
                      style={{
                        backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
                        borderRadius: theme.borderRadius.lg,
                        padding: theme.spacing.lg,
                        border: `2px solid ${isSelected ? theme.colors.primary.main : (email.isRead ? theme.colors.border.light : theme.colors.primary.light)}`,
                        borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${theme.colors.primary.main}`,
                        boxShadow: theme.shadows.sm,
                        cursor: 'pointer',
                        transition: theme.transitions.default,
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = theme.shadows.md;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = theme.shadows.sm;
                      }}
                    >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
                        <strong style={{
                          color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
                          fontSize: theme.typography.fontSize.base,
                          fontWeight: theme.typography.fontWeight.semibold,
                        }}>
                          {email.fromName || email.from}
                        </strong>
                        <span style={{
                          fontSize: theme.typography.fontSize.xs,
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: priority.bg,
                          color: priority.color,
                          borderRadius: theme.borderRadius.full,
                          fontWeight: theme.typography.fontWeight.medium,
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                        }}>
                          {email.isProcessingPriority ? (
                            <>
                              <span style={{ 
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                border: `2px solid ${priority.color}`,
                                borderTop: '2px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                              }} />
                              {t('email.calculating')}
                            </>
                          ) : (
                            `${priority.label} (${email.priorityScore.toFixed(0)})`
                          )}
                        </span>
                      </div>
                      <span style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.tertiary,
                      }}>
                        {new Date(email.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{
                      color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.lg,
                      fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
                      marginBottom: theme.spacing.sm,
                    }}>
                      {email.subject}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '600px',
                        lineHeight: theme.typography.lineHeight.relaxed,
                        display: 'flex',
                        alignItems: 'center',
                        gap: theme.spacing.xs,
                        position: 'relative',
                      }}>
                        {email.isProcessingSummary ? (
                          <>
                            <span style={{ 
                              display: 'inline-block',
                              width: '12px',
                              height: '12px',
                              border: `2px solid ${theme.colors.text.tertiary}`,
                              borderTop: '2px solid transparent',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                            }} />
                            {t('email.generatingSummary')}
                          </>
                        ) : email.summary ? (
                          email.summary
                        ) : email.body ? (
                          <span
                            title={email.body.substring(0, 1000).replace(/[\r\n]+/g, ' ')}
                            style={{ cursor: 'help' }}
                          >
                            {(() => {
                              // Extract first sentence
                              const firstSentenceMatch = email.body.match(/^[^.!?]+[.!?]/);
                              if (firstSentenceMatch) {
                                return firstSentenceMatch[0].trim();
                              }
                              // Fallback to first 150 chars
                              return email.body.substring(0, 150).replace(/[\r\n]+/g, ' ') + '...';
                            })()}
                          </span>
                        ) : (
                          <span style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
                            {t('inbox.noPreview') || 'Click to view email'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {/* Stars - prioritise more deeply */}
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: theme.spacing.xs,
                        }}>
                          <div style={{
                            fontSize: theme.typography.fontSize.xs,
                            color: theme.colors.text.tertiary,
                            fontWeight: theme.typography.fontWeight.medium,
                          }}>
                            Prioritise more deeply:
                          </div>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: theme.spacing.xs,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            backgroundColor: theme.colors.background.subtle,
                            borderRadius: theme.borderRadius.md,
                            border: `1px solid ${theme.colors.border.light}`,
                          }}>
                          {[1, 2, 3].map(count => (
                            <button
                              key={count}
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentCount = email.starCount || 0;
                                // If clicking the current star count, remove stars (set to 0)
                                // Otherwise, set to that count
                                const newCount = currentCount === count ? 0 : count;
                                handleSetStarCount(email.id, newCount, e);
                                // Show keyboard hint
                                if (e.type === 'click' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                                  setShowKeyboardHint({ emailId: email.id, action: `Press ${count} to set ${count} star${count > 1 ? 's' : ''}` });
                                  setTimeout(() => setShowKeyboardHint(null), 3000);
                                }
                              }}
                              title={(email.starCount || 0) === count ? `Remove stars (or press ${count})` : `Set ${count} star${count > 1 ? 's' : ''} (or press ${count})`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '1.4rem',
                                padding: '2px 4px',
                                color: (email.starCount || 0) >= count ? theme.colors.accent.warning : theme.colors.text.tertiary,
                                opacity: (email.starCount || 0) >= count ? 1 : 0.5,
                                transition: theme.transitions.fast,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.transform = 'scale(1.2)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = (email.starCount || 0) >= count ? '1' : '0.5';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              ⭐
                            </button>
                          ))}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(email.id, e);
                            // Show keyboard hint
                            if (e.type === 'click' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                              setShowKeyboardHint({ emailId: email.id, action: 'Press Delete to archive' });
                              setTimeout(() => setShowKeyboardHint(null), 3000);
                            }
                          }}
                          title="Archive (or press Delete)"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: '0 4px',
                          }}
                        >
                          📥
                        </button>

                        {/* Hide Snooze in triage mode */}
                        {mode !== 'triage' && (
                          <>
                            {showSnoozeInput === email.id ? (
                              <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  placeholder="2h, tomorrow..."
                                  autoFocus
                                  value={snoozeInput[email.id] || ''}
                                  onChange={(e) => setSnoozeInput({ ...snoozeInput, [email.id]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSnooze(email.id);
                                    if (e.key === 'Escape') setShowSnoozeInput(null);
                                  }}
                                  style={{
                                    padding: theme.spacing.xs,
                                    borderRadius: theme.borderRadius.sm,
                                    border: `1px solid ${theme.colors.primary.main}`,
                                    fontSize: theme.typography.fontSize.sm,
                                    width: '100px',
                                    outline: 'none',
                                  }}
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowSnoozeInput(email.id)}
                                style={{
                                  color: theme.colors.text.tertiary,
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: theme.typography.fontSize.xs,
                                  fontWeight: theme.typography.fontWeight.medium,
                                  padding: theme.spacing.xs,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = theme.colors.primary.main}
                                onMouseLeave={(e) => e.currentTarget.style.color = theme.colors.text.tertiary}
                              >
                                Snooze
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })
            )}
            <div style={{ padding: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, marginTop: theme.spacing.xl }}>
              <details>
                <summary style={{ cursor: 'pointer', color: theme.colors.text.secondary }}>Debug View</summary>
                <pre style={{ 
                  backgroundColor: theme.colors.background.subtle, 
                  padding: theme.spacing.md, 
                  borderRadius: theme.borderRadius.md,
                  fontSize: '12px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(emails, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
        
        {/* Footer with Focus Bear Logo */}
        <footer style={{
          padding: theme.spacing.lg,
          borderTop: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.background.paper,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}>
          <span style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Made by
          </span>
          <a 
            href="https://focusbear.io" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <img 
              src="https://focus-bear.github.io/assets/focus-blocked/images/FocusBearLogo.svg" 
              alt="Focus Bear" 
              style={{ 
                height: '24px',
                width: 'auto',
                objectFit: 'contain'
              }}
            />
          </a>
        </footer>
      </div>
    </div>
  );
};

export default Inbox;
