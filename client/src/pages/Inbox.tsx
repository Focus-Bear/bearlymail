import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { theme } from '../theme/theme';
import { ConfirmModal } from '../components/ConfirmModal';
import { StarDiscrepancyModal } from '../components/priority/StarDiscrepancyModal';

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
  labels?: string[];
}

const Inbox: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout, refreshUser, loading: authLoading } = useAuth();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(false);
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
  const [scanNotification, setScanNotification] = useState<{ show: boolean; progress: { current: number; total: number } | null }>({ show: false, progress: null });
  const [urgentNotification, setUrgentNotification] = useState<{ show: boolean; count: number; emails: Array<{ subject: string; from: string; priorityScore: number }> }>({ show: false, count: 0, emails: [] });
  const [triageSuggestions, setTriageSuggestions] = useState<Map<string, { suggestedStarCount: number; suggestedArchive: boolean; confidence: number; reasoning: string }>>(new Map());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [debugViewOpen, setDebugViewOpen] = useState(false);
  const [debugStarredData, setDebugStarredData] = useState<{
    gmail: {
      starredThreadCount: number;
      starredThreadIds: string[];
      error?: string;
    };
    database: {
      starredThreadCount: number;
      starredEmailCount: number;
    };
    processTabResults: number;
    comparison: {
      inGmailNotInDb: string[];
      inDbNotInGmail: string[];
      inDbButArchived: string[];
    };
    starredThreads: Array<{
      threadId: string;
      starCount: number;
      isArchived: boolean;
      isSnoozed: boolean;
      emailCount: number;
      latestSubject: string;
      latestFrom: string;
      issues: string[];
      inGmail: boolean;
    }>;
    missingFromProcessTab: Array<{
      threadId: string;
      reason: string;
      details: any;
    }>;
  } | null>(null);
  const [loadingDebugData, setLoadingDebugData] = useState(false);
  const [starDiscrepancyModal, setStarDiscrepancyModal] = useState<{
    show: boolean;
    emailId: string;
    userStarCount: number;
    predictedStarCount: number;
  } | null>(null);
  const [debugOrphanData, setDebugOrphanData] = useState<{
    totalEmailsInDb: number;
    emailsWithThreadId: number;
    orphanEmails: number;
    orphanEmailDetails: Array<{
      id: string;
      threadId: string;
      emailThreadId: string | null;
      subject: string;
      from: string;
      receivedAt: string;
    }>;
    threadsInDb: number;
    threadsWithoutEmails: Array<{
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
    }>;
  } | null>(null);
  const [loadingOrphanData, setLoadingOrphanData] = useState(false);
  const [fixingOrphans, setFixingOrphans] = useState(false);
  
  // Block sender confirmation modal state
  const [blockConfirmEmail, setBlockConfirmEmail] = useState<Email | null>(null);
  
  // Keyboard navigation and multi-select state
  const [selectedEmailIndex, setSelectedEmailIndex] = useState<number>(-1);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [showKeyboardHint, setShowKeyboardHint] = useState<{ emailId: string; action: string } | null>(null);
  
  // Priority tooltip state
  const [hoveredPriorityEmailId, setHoveredPriorityEmailId] = useState<string | null>(null);
  const [priorityExplanation, setPriorityExplanation] = useState<{
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  } | null>(null);
  const [loadingPriorityExplanation, setLoadingPriorityExplanation] = useState(false);

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

  const fetchEmails = useCallback(async () => {
    setDecrypting(true); // Show "Decrypting..." during request
    try {
      // Pass mode param (includeBatched is now irrelevant as user only sees what's delivered)
      const response = await axios.get(`${API_URL}/emails/inbox?mode=${mode}`);
      console.log(`Fetched ${response.data.length} emails for mode: ${mode}`, response.data);
      setEmails(response.data);
      setDecrypting(false); // Decryption complete
    } catch (error) {
      console.error('Error fetching emails:', error);
      setDecrypting(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingModeSwitch(false);
    }
  }, [mode]);

  const handleOverrideSuggestion = useCallback(async (
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
  }, [triageSuggestions]);

  const fetchTriageSuggestions = useCallback(async () => {
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
  }, [emails, loadingSuggestions]);

  const handleSetStarCount = useCallback(async (emailId: string, starCount: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // Get the email to check for discrepancy
    const email = emails.find(e => e.id === emailId);
    const predictedStarCount = email 
      ? Math.round((email.priorityScore / 100) * 3) 
      : Math.round(50 / 100 * 3); // Default to 1 if email not found
    
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
      
      // Check for star discrepancy (difference of 2 or more, and user gave stars)
      const discrepancy = Math.abs(starCount - predictedStarCount);
      if (discrepancy >= 2 && starCount > 0) {
        setStarDiscrepancyModal({
          show: true,
          emailId,
          userStarCount: starCount,
          predictedStarCount,
        });
      }
      
      // Refresh to ensure consistency (non-blocking)
      fetchEmails().catch(err => console.error('Error refreshing after star update:', err));
    } catch (error) {
      console.error('Error setting star count:', error);
      // Revert optimistic update on error
      fetchEmails();
    }
  }, [emails, triageSuggestions, fetchEmails, handleOverrideSuggestion]);

  const handleArchive = useCallback(async (emailId: string, e: React.MouseEvent) => {
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
        await handleOverrideSuggestion(emailId, suggestion, { 
          starCount: 0, 
          archived: true 
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
  }, [emails, triageSuggestions, fetchEmails, handleOverrideSuggestion]);

  const handleBlockSender = useCallback((emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const emailToBlock = emails.find(e => e.id === emailId);
    if (!emailToBlock) return;
    
    // Show confirmation modal
    setBlockConfirmEmail(emailToBlock);
  }, [emails]);

  const confirmBlockSender = useCallback(async () => {
    if (!blockConfirmEmail) return;
    
    const emailToBlock = blockConfirmEmail;
    setBlockConfirmEmail(null);
    
    // Optimistic update - remove from UI
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailToBlock.id));
    
    try {
      await axios.post(`${API_URL}/emails/${emailToBlock.id}/block-sender`);
      fetchEmails().catch(err => console.error('Error refreshing after block:', err));
    } catch (error) {
      console.error('Error blocking sender:', error);
      // Revert on error
      setEmails(prevEmails => [...prevEmails, emailToBlock].sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      ));
    }
  }, [blockConfirmEmail, fetchEmails]);

  const fetchDebugStarredThreads = async () => {
    setLoadingDebugData(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/starred-threads`);
      setDebugStarredData(response.data);
    } catch (error) {
      console.error('Error fetching debug starred threads:', error);
    } finally {
      setLoadingDebugData(false);
    }
  };

  const fetchDebugOrphanEmails = async () => {
    setLoadingOrphanData(true);
    try {
      const response = await axios.get(`${API_URL}/emails/debug/orphan-emails`);
      setDebugOrphanData(response.data);
    } catch (error) {
      console.error('Error fetching debug orphan emails:', error);
    } finally {
      setLoadingOrphanData(false);
    }
  };

  const handleFixOrphanEmails = async () => {
    setFixingOrphans(true);
    try {
      const response = await axios.post(`${API_URL}/emails/debug/fix-orphan-emails`);
      alert(`Fixed ${response.data.fixed} orphan emails. Errors: ${response.data.errors.length}`);
      // Refresh data
      fetchDebugOrphanEmails();
      fetchEmails();
    } catch (error) {
      console.error('Error fixing orphan emails:', error);
      alert('Failed to fix orphan emails');
    } finally {
      setFixingOrphans(false);
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

  const handleSnooze = async (emailId: string) => {
    const duration = snoozeInput[emailId]?.trim();
    if (!duration) {
      console.warn('Cannot snooze: duration is empty');
      return;
    }

    try {
      await axios.post(`${API_URL}/snooze/${emailId}`, { duration });
      setShowSnoozeInput(null);
      setSnoozeInput({ ...snoozeInput, [emailId]: '' });
      fetchEmails();
    } catch (error: any) {
      console.error('Error snoozing email:', error);
      alert(error.response?.data?.message || 'Failed to snooze email. Please try again.');
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

  // Poll for email updates ONLY when emails are actively processing
  // This is a temporary solution - ideally we'd use WebSockets
  useEffect(() => {
    // Check if any email is currently processing
    const processingEmails = emails.filter(e => e.isProcessingPriority || e.isProcessingSummary);
    
    // If nothing is processing, don't poll at all
    if (processingEmails.length === 0) {
      return;
    }

    // Poll every 10 seconds (much less aggressive than before)
    // Only fetch if we still have processing emails
    const interval = setInterval(() => {
      const stillProcessing = emails.some(e => e.isProcessingPriority || e.isProcessingSummary);
      if (stillProcessing) {
        console.log(`[Polling] ${processingEmails.length} emails still processing, refreshing...`);
        fetchEmails();
      }
    }, 10000); // 10 seconds instead of 3

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.filter(e => e.isProcessingPriority || e.isProcessingSummary).length]); // Only re-run when processing count changes

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
    
    // Only run once on initial load
    if (hasInitiallyLoaded) return;
    
    // Refresh user data on mount to ensure we have latest state (including hasScannedHistory)
    const initializeData = async () => {
      // Refresh user to get latest hasScannedHistory from DB
      await refreshUser();
      
      setHasInitiallyLoaded(true);
      fetchEmails();
      fetchBatchStatus();
      
      // Trigger sync in background after a short delay (only if user is connected)
      setTimeout(() => {
        axios.post(`${API_URL}/emails/check-urgent`).catch(err => 
          console.error('Error triggering initial email sync:', err)
        );
      }, 2000);
    };
    
    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, hasInitiallyLoaded]); // Intentionally exclude fetchEmails and refreshUser to prevent loops

  // Re-fetch when mode changes (after initial load)
  useEffect(() => {
    if (!hasInitiallyLoaded || !user || authLoading) return;
    
    // Clear emails IMMEDIATELY when switching tabs to prevent showing stale data
    setEmails([]);
    setLoadingModeSwitch(true);
    
    fetchEmails().finally(() => {
      setLoadingModeSwitch(false);
    });
    fetchBatchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]); // Only trigger on mode change, not on fetchEmails recreation

  // Fetch triage suggestions when in triage mode with emails
  useEffect(() => {
    if (mode === 'triage' && emails.length > 0 && !loadingSuggestions) {
      fetchTriageSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emails.length]); // Intentionally exclude loadingSuggestions and fetchTriageSuggestions to prevent loops

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
  }, [emails, selectedEmailIndex, selectedEmailIds, handleArchive, handleSetStarCount]);

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
          
          <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
            {nextDelivery && (() => {
              const now = new Date();
              const diffMs = nextDelivery.getTime() - now.getTime();
              const diffMins = Math.round(diffMs / (1000 * 60));
              // Only show if there's actually a future delivery time
              if (diffMins <= 0) return null;
              
              const diffHours = Math.floor(diffMins / 60);
              const remainingMins = diffMins % 60;
              const timeText = diffMins < 60 
                ? `${diffMins}m`
                : remainingMins === 0 
                  ? `${diffHours}h`
                  : `${diffHours}h ${remainingMins}m`;
              
              return (
                <span style={{
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.tertiary,
                }}>
                  Next batch: {timeText}
                </span>
              );
            })()}

            <button
              onClick={() => navigate('/compose')}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.secondary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.medium,
                transition: theme.transitions.fast,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.secondary.dark}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.secondary.main}
            >
              ✉️ Compose
            </button>

            <button
              ref={deliverBtnRef}
              className="deliver-btn"
              onClick={handleCheckUrgent}
              disabled={refreshing}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.medium,
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
                  maxHeight: '600px',
                  overflowY: 'auto',
                }}>
                  {/* Missing Starred Threads Debug Section */}
                  <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, backgroundColor: '#fff', borderRadius: theme.borderRadius.md }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                      <h4 style={{ margin: 0 }}>🔍 Missing Starred Threads Debug</h4>
                      <button
                        onClick={fetchDebugStarredThreads}
                        disabled={loadingDebugData}
                        style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                          backgroundColor: theme.colors.primary.main,
                          color: 'white',
                          border: 'none',
                          borderRadius: theme.borderRadius.sm,
                          cursor: loadingDebugData ? 'not-allowed' : 'pointer',
                          opacity: loadingDebugData ? 0.6 : 1,
                        }}
                      >
                        {loadingDebugData ? 'Loading...' : 'Fetch Debug Data'}
                      </button>
                    </div>
                    
                    {debugStarredData && (
                      <div>
                        {/* Gmail vs DB Comparison */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(2, 1fr)', 
                          gap: theme.spacing.md, 
                          marginBottom: theme.spacing.md,
                        }}>
                          <div style={{ padding: theme.spacing.sm, backgroundColor: '#E8F4FD', borderRadius: theme.borderRadius.sm }}>
                            <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>📧 Gmail (is:starred is:inbox)</h5>
                            {debugStarredData.gmail.error ? (
                              <div style={{ color: 'red' }}>Error: {debugStarredData.gmail.error}</div>
                            ) : (
                              <div><strong>{debugStarredData.gmail.starredThreadCount}</strong> starred threads</div>
                            )}
                          </div>
                          <div style={{ padding: theme.spacing.sm, backgroundColor: '#E8F4FD', borderRadius: theme.borderRadius.sm }}>
                            <h5 style={{ margin: `0 0 ${theme.spacing.xs} 0` }}>🗄️ Database</h5>
                            <div><strong>{debugStarredData.database.starredThreadCount}</strong> starred threads</div>
                            <div><strong>{debugStarredData.database.starredEmailCount}</strong> starred emails</div>
                          </div>
                        </div>
                        
                        {/* Comparison Results */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(3, 1fr)', 
                          gap: theme.spacing.sm, 
                          marginBottom: theme.spacing.md,
                          padding: theme.spacing.sm,
                          backgroundColor: '#FFF3CD',
                          borderRadius: theme.borderRadius.sm,
                        }}>
                          <div style={{ color: debugStarredData.comparison.inGmailNotInDb.length > 0 ? 'red' : 'green' }}>
                            <strong>In Gmail, not in DB:</strong> {debugStarredData.comparison.inGmailNotInDb.length}
                            {debugStarredData.comparison.inGmailNotInDb.length > 0 && (
                              <div style={{ fontSize: '0.6rem' }}>{debugStarredData.comparison.inGmailNotInDb.join(', ')}</div>
                            )}
                          </div>
                          <div style={{ color: debugStarredData.comparison.inDbNotInGmail.length > 0 ? 'orange' : 'green' }}>
                            <strong>In DB, not in Gmail:</strong> {debugStarredData.comparison.inDbNotInGmail.length}
                            {debugStarredData.comparison.inDbNotInGmail.length > 0 && (
                              <div style={{ fontSize: '0.6rem' }}>{debugStarredData.comparison.inDbNotInGmail.join(', ')}</div>
                            )}
                          </div>
                          <div>
                            <strong>Process Tab Results:</strong> {debugStarredData.processTabResults}
                          </div>
                        </div>
                        
                        {debugStarredData.missingFromProcessTab.length > 0 && (
                          <div style={{ marginBottom: theme.spacing.md }}>
                            <h5 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: 'red' }}>⚠️ Missing from Process Tab:</h5>
                            {debugStarredData.missingFromProcessTab.map((item, idx) => (
                              <div key={idx} style={{ 
                                padding: theme.spacing.sm, 
                                backgroundColor: '#FFE6E6', 
                                border: '1px solid #F5C6CB',
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.xs,
                              }}>
                                <div><strong>Thread:</strong> {item.threadId}</div>
                                <div><strong>Reason:</strong> <span style={{ color: 'red' }}>{item.reason}</span></div>
                                <div><strong>Details:</strong> Stars: {item.details.starCount} | Emails: {item.details.emailCount} | In Gmail: {item.details.inGmail ? '✅' : '❌'} | Subject: {item.details.subject}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <details>
                          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                            All Starred Threads in DB ({debugStarredData.starredThreads.length})
                          </summary>
                          {debugStarredData.starredThreads.map((thread, idx) => (
                            <div key={idx} style={{ 
                              padding: theme.spacing.sm, 
                              backgroundColor: thread.issues.length > 0 ? '#FFE6E6' : '#D4EDDA',
                              border: `1px solid ${thread.issues.length > 0 ? '#F5C6CB' : '#C3E6CB'}`,
                              borderRadius: theme.borderRadius.sm,
                              marginBottom: theme.spacing.xs,
                            }}>
                              <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
                                <span><strong>Thread:</strong> {thread.threadId}</span>
                                <span><strong>Stars:</strong> {'⭐'.repeat(thread.starCount)}</span>
                                <span><strong>Emails:</strong> {thread.emailCount}</span>
                                <span><strong>Archived:</strong> {thread.isArchived ? '❌ YES' : '✅ NO'}</span>
                                <span><strong>In Gmail:</strong> {thread.inGmail ? '✅' : '❌'}</span>
                              </div>
                              <div style={{ fontSize: '0.65rem', color: theme.colors.text.secondary, marginTop: '2px' }}>
                                {thread.latestFrom}: {thread.latestSubject}
                              </div>
                              {thread.issues.length > 0 && (
                                <div style={{ color: 'red', marginTop: '4px' }}>
                                  <strong>Issues:</strong> {thread.issues.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </details>
                      </div>
                    )}
                  </div>
                  
                  {/* Orphan Emails Debug Section */}
                  <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, backgroundColor: '#fff', borderRadius: theme.borderRadius.md }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                      <h4 style={{ margin: 0 }}>🔗 Orphan Emails Debug (emails without thread link)</h4>
                      <button
                        onClick={fetchDebugOrphanEmails}
                        disabled={loadingOrphanData}
                        style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                          backgroundColor: theme.colors.primary.main,
                          color: 'white',
                          border: 'none',
                          borderRadius: theme.borderRadius.sm,
                          cursor: loadingOrphanData ? 'not-allowed' : 'pointer',
                          opacity: loadingOrphanData ? 0.6 : 1,
                        }}
                      >
                        {loadingOrphanData ? 'Loading...' : 'Fetch Orphan Data'}
                      </button>
                    </div>
                    
                    {debugOrphanData && (
                      <div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(4, 1fr)', 
                          gap: theme.spacing.sm, 
                          marginBottom: theme.spacing.md,
                          padding: theme.spacing.sm,
                          backgroundColor: debugOrphanData.orphanEmails > 0 ? '#FFE6E6' : '#E8F4FD',
                          borderRadius: theme.borderRadius.sm,
                        }}>
                          <div><strong>Total Emails:</strong> {debugOrphanData.totalEmailsInDb}</div>
                          <div><strong>With Thread ID:</strong> {debugOrphanData.emailsWithThreadId}</div>
                          <div style={{ color: debugOrphanData.orphanEmails > 0 ? 'red' : 'green', fontWeight: 'bold' }}>
                            <strong>Orphan Emails:</strong> {debugOrphanData.orphanEmails}
                          </div>
                          <div><strong>Threads in DB:</strong> {debugOrphanData.threadsInDb}</div>
                        </div>
                        
                        {debugOrphanData.orphanEmails > 0 && (
                          <div style={{ marginBottom: theme.spacing.md }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                              <h5 style={{ margin: 0, color: 'red' }}>⚠️ Orphan Emails (no emailThreadId):</h5>
                              <button
                                onClick={handleFixOrphanEmails}
                                disabled={fixingOrphans}
                                style={{
                                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                                  backgroundColor: '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: theme.borderRadius.sm,
                                  cursor: fixingOrphans ? 'not-allowed' : 'pointer',
                                  opacity: fixingOrphans ? 0.6 : 1,
                                }}
                              >
                                {fixingOrphans ? 'Fixing...' : '🔧 Fix Orphan Emails'}
                              </button>
                            </div>
                            {debugOrphanData.orphanEmailDetails.slice(0, 10).map((email, idx) => (
                              <div key={idx} style={{ 
                                padding: theme.spacing.sm, 
                                backgroundColor: '#FFE6E6', 
                                border: '1px solid #F5C6CB',
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.xs,
                              }}>
                                <div><strong>Email ID:</strong> {email.id} | <strong>Gmail Thread:</strong> {email.threadId} | <strong>DB Thread:</strong> {email.emailThreadId || 'NULL'}</div>
                                <div style={{ fontSize: '0.65rem', color: theme.colors.text.secondary }}>{email.from}: {email.subject}</div>
                              </div>
                            ))}
                            {debugOrphanData.orphanEmailDetails.length > 10 && (
                              <div style={{ color: theme.colors.text.secondary, fontStyle: 'italic' }}>
                                ... and {debugOrphanData.orphanEmailDetails.length - 10} more
                              </div>
                            )}
                          </div>
                        )}
                        
                        {debugOrphanData.threadsWithoutEmails.length > 0 && (
                          <details>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: theme.spacing.sm, color: 'orange' }}>
                              ⚠️ Threads Without Emails ({debugOrphanData.threadsWithoutEmails.length})
                            </summary>
                            {debugOrphanData.threadsWithoutEmails.map((thread, idx) => (
                              <div key={idx} style={{ 
                                padding: theme.spacing.sm, 
                                backgroundColor: '#FFF3CD',
                                border: '1px solid #FFEEBA',
                                borderRadius: theme.borderRadius.sm,
                                marginBottom: theme.spacing.xs,
                              }}>
                                <span><strong>DB ID:</strong> {thread.id} | <strong>Gmail Thread:</strong> {thread.threadId} | <strong>Stars:</strong> {thread.starCount} | <strong>Archived:</strong> {thread.isArchived ? 'YES' : 'NO'}</span>
                              </div>
                            ))}
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Current Tab Emails */}
                  <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0` }}>📧 Current Tab Emails ({emails.length})</h4>
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
                      {decrypting ? 'Decrypting emails...' : t('inbox.loadingEmails')}
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
                      {decrypting ? 'Decrypting emails...' : `Loading ${mode === 'process' ? 'starred' : 'unstarred'} emails...`}
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
                        <span 
                          style={{
                            fontSize: theme.typography.fontSize.xs,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            backgroundColor: priority.bg,
                            color: priority.color,
                            borderRadius: theme.borderRadius.full,
                            fontWeight: theme.typography.fontWeight.medium,
                            display: 'flex',
                            alignItems: 'center',
                            gap: theme.spacing.xs,
                            cursor: 'help',
                            position: 'relative',
                          }}
                          onMouseEnter={async () => {
                            if (email.isProcessingPriority) return;
                            setHoveredPriorityEmailId(email.id);
                            if (!loadingPriorityExplanation) {
                              setLoadingPriorityExplanation(true);
                              try {
                                const response = await axios.get(`${API_URL}/emails/${email.id}/priority-explanation`);
                                setPriorityExplanation(response.data);
                              } catch (error) {
                                console.error('Error fetching priority explanation:', error);
                              } finally {
                                setLoadingPriorityExplanation(false);
                              }
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredPriorityEmailId(null);
                            setPriorityExplanation(null);
                          }}
                        >
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
                          
                          {/* Priority Explanation Tooltip */}
                          {hoveredPriorityEmailId === email.id && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: '8px',
                                backgroundColor: theme.colors.background.paper,
                                border: `1px solid ${theme.colors.border.light}`,
                                borderRadius: theme.borderRadius.md,
                                padding: theme.spacing.md,
                                boxShadow: theme.shadows.lg,
                                zIndex: 1000,
                                minWidth: '300px',
                                maxWidth: '400px',
                                fontSize: theme.typography.fontSize.sm,
                                color: theme.colors.text.primary,
                                textAlign: 'left',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {loadingPriorityExplanation ? (
                                <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
                                  Loading...
                                </div>
                              ) : priorityExplanation ? (
                                <div>
                                  <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm, borderBottom: `1px solid ${theme.colors.border.light}`, paddingBottom: theme.spacing.xs }}>
                                    Priority Score: {priorityExplanation.score.toFixed(0)}
                                  </div>
                                  
                                  {/* Dimensions */}
                                  <div style={{ marginBottom: theme.spacing.sm }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                      <span>🔥 Urgency</span>
                                      <span style={{ fontWeight: 'bold' }}>{priorityExplanation.dimensions.urgency.score.toFixed(0)}</span>
                                    </div>
                                    {priorityExplanation.dimensions.urgency.reasons.length > 0 && (
                                      <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                                        {priorityExplanation.dimensions.urgency.reasons.slice(0, 2).join('; ')}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div style={{ marginBottom: theme.spacing.sm }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                      <span>🎯 Goal Alignment</span>
                                      <span style={{ fontWeight: 'bold' }}>{priorityExplanation.dimensions.goalAlignment.score.toFixed(0)}</span>
                                    </div>
                                    {priorityExplanation.dimensions.goalAlignment.reasons.length > 0 && (
                                      <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                                        {priorityExplanation.dimensions.goalAlignment.reasons.slice(0, 2).join('; ')}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div style={{ marginBottom: theme.spacing.sm }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                      <span>⭐ VIP Contact</span>
                                      <span style={{ fontWeight: 'bold' }}>{priorityExplanation.dimensions.vipContact.score.toFixed(0)}</span>
                                    </div>
                                    {priorityExplanation.dimensions.vipContact.reasons.length > 0 && (
                                      <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                                        {priorityExplanation.dimensions.vipContact.reasons.slice(0, 2).join('; ')}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Link to settings */}
                                  <div style={{ marginTop: theme.spacing.sm, paddingTop: theme.spacing.xs, borderTop: `1px solid ${theme.colors.border.light}`, textAlign: 'center' }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate('/settings');
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: theme.colors.primary.main,
                                        cursor: 'pointer',
                                        fontSize: theme.typography.fontSize.xs,
                                        textDecoration: 'underline',
                                      }}
                                    >
                                      Adjust context in Settings →
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', color: theme.colors.text.secondary }}>
                                  Hover to see details
                                </div>
                              )}
                            </div>
                          )}
                        </span>
                        
                        {/* Labels */}
                        {email.labels && email.labels.length > 0 && (
                          <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                            {email.labels
                              .filter(label => !['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT', 'SENT', 'DRAFT', 'TRASH', 'SPAM'].includes(label))
                              .map((label, i) => {
                                const displayLabel = label.startsWith('CATEGORY_') ? label.replace('CATEGORY_', '') : label;
                                const isCategory = label.startsWith('CATEGORY_');
                                return (
                                  <span key={i} style={{
                                    fontSize: theme.typography.fontSize.xs,
                                    padding: `2px ${theme.spacing.sm}`,
                                    backgroundColor: isCategory ? theme.colors.background.subtle : theme.colors.primary.subtle,
                                    color: isCategory ? theme.colors.text.secondary : theme.colors.primary.main,
                                    borderRadius: theme.borderRadius.sm,
                                    border: `1px solid ${isCategory ? theme.colors.border.light : 'transparent'}`,
                                    textTransform: isCategory ? 'capitalize' : 'none',
                                  }}>
                                    {displayLabel.toLowerCase()}
                                  </span>
                                );
                              })}
                          </div>
                        )}
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
                      marginBottom: theme.spacing.sm,
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

                    {/* Prioritization row */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: theme.spacing.xs,
                    }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: theme.spacing.sm,
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

                      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
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

                        {/* Block sender button */}
                        <button
                          onClick={(e) => handleBlockSender(email.id, e)}
                          title="Block sender"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            padding: '0 4px',
                            opacity: 0.6,
                          }}
                        >
                          🚫
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
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (snoozeInput[email.id]?.trim()) {
                                        handleSnooze(email.id);
                                      }
                                    }
                                    if (e.key === 'Escape') {
                                      setShowSnoozeInput(null);
                                      setSnoozeInput({ ...snoozeInput, [email.id]: '' });
                                    }
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
                                <button
                                  onClick={() => {
                                    if (snoozeInput[email.id]?.trim()) {
                                      handleSnooze(email.id);
                                    }
                                  }}
                                  disabled={!snoozeInput[email.id]?.trim()}
                                  style={{
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    borderRadius: theme.borderRadius.sm,
                                    backgroundColor: snoozeInput[email.id]?.trim() ? theme.colors.primary.main : theme.colors.background.subtle,
                                    color: snoozeInput[email.id]?.trim() ? 'white' : theme.colors.text.tertiary,
                                    border: 'none',
                                    cursor: snoozeInput[email.id]?.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: theme.typography.fontSize.xs,
                                    fontWeight: theme.typography.fontWeight.medium,
                                    opacity: snoozeInput[email.id]?.trim() ? 1 : 0.6,
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => {
                                    setShowSnoozeInput(null);
                                    setSnoozeInput({ ...snoozeInput, [email.id]: '' });
                                  }}
                                  style={{
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    borderRadius: theme.borderRadius.sm,
                                    backgroundColor: 'transparent',
                                    color: theme.colors.text.secondary,
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: theme.typography.fontSize.xs,
                                  }}
                                >
                                  Cancel
                                </button>
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

      {/* Block Sender Confirmation Modal */}
      <ConfirmModal
        isOpen={!!blockConfirmEmail}
        icon="🚫"
        title="Block Sender"
        message={`Block all future emails from ${blockConfirmEmail?.fromName || blockConfirmEmail?.from || 'this sender'}? This email and any future emails from them will be automatically archived.`}
        confirmLabel="Block Sender"
        cancelLabel="Cancel"
        onConfirm={confirmBlockSender}
        onCancel={() => setBlockConfirmEmail(null)}
      />

      {/* Star Discrepancy Modal */}
      {starDiscrepancyModal?.show && (
        <StarDiscrepancyModal
          emailId={starDiscrepancyModal.emailId}
          userStarCount={starDiscrepancyModal.userStarCount}
          predictedStarCount={starDiscrepancyModal.predictedStarCount}
          onClose={() => setStarDiscrepancyModal(null)}
          onSubmitted={() => {
            setStarDiscrepancyModal(null);
            fetchEmails();
          }}
        />
      )}
    </div>
  );
};

export default Inbox;
