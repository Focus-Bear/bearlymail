import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../theme/theme';
import { InfoTooltip } from '../components/InfoTooltip';
import { Sidebar } from '../components/inbox/Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { captureEvent } from '../utils/posthog';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface SummarizationRule {
  ruleId: string;
  whenToUse: string;
  howToSummarize: string;
  createdAt?: string;
}

interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: string;
}

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
  priority?: number; // 1 = top priority, 2 = medium, 3 = low (for WORKING_ON items)
  explanation?: string; // Explanation/rationale for why this context was identified
}

interface BatchSchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
  isEnabled: boolean;
  urgentBypassSchedule: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [summarizationRules, setSummarizationRules] = useState<SummarizationRule[]>([]);
  const [blockedSenders, setBlockedSenders] = useState<BlockedSender[]>([]);
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [batchSchedule, setBatchSchedule] = useState<BatchSchedule>({
    deliveryDays: [1, 2, 3, 4, 5], // Mon-Fri by default
    deliveryTimes: ['11:00', '15:00'], // 11am and 3pm by default (matches service default)
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isEnabled: true,
    urgentBypassSchedule: true,
  });
  const [newDeliveryTime, setNewDeliveryTime] = useState('');
  const [toneRules, setToneRules] = useState<string[]>(['Be concise', 'Use non-violent communication']);
  const [newToneRule, setNewToneRule] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [githubTokenSaved, setGithubTokenSaved] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ 
    show: boolean; 
    progress: { 
      current: number; 
      total: number; 
      message?: string; 
      threadCount?: number;
      analyzedCount?: number;
      stats?: {
        totalThreads: number;
        outboundEmails: number;
        threadsNeverOpened: number;
        threadsReadButNotReplied: number;
        vipContactsEvaluated: number;
      };
    } | null;
    error: string | null;
    isComplete: boolean;
  }>({ 
    show: false, 
    progress: null,
    error: null,
    isComplete: false,
  });
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasGoogleTokens, setHasGoogleTokens] = useState(false);
  
  // Summarization rules state
  const [newSummarizationWhen, setNewSummarizationWhen] = useState('');
  const [newSummarizationHow, setNewSummarizationHow] = useState('');
  const [editingSummarizationRule, setEditingSummarizationRule] = useState<string | null>(null);
  const [editSummarizationWhen, setEditSummarizationWhen] = useState('');
  const [editSummarizationHow, setEditSummarizationHow] = useState('');
  
  // New state for context editing
  const [newContextValue, setNewContextValue] = useState('');
  const [newContextPriority, setNewContextPriority] = useState<number>(2); // Default to medium priority
  const [addingContextType, setAddingContextType] = useState<string | null>(null);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [editContextValue, setEditContextValue] = useState('');
  const [editContextPriority, setEditContextPriority] = useState<number>(2);

  // Handle anchor scrolling when navigating with hash (from sidebar navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && !loading) {
        // Wait for content to load, then scroll
        setTimeout(() => {
          const element = document.getElementById(hash.substring(1));
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      }
    };
    
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [loading]);

  useEffect(() => {
    const hash = window.location.hash;
    captureEvent('settings_viewed', {
      section: hash ? hash.substring(1) : undefined,
    });
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sumRulesRes, contextRes, userRes, blockedRes, scheduleRes, googleAccountsRes] = await Promise.all([
        axios.get(`${API_URL}/summarize/rules`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/context`),
        axios.get(`${API_URL}/users/me`),
        axios.get(`${API_URL}/blocked-senders`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/batch-schedule`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/google-accounts`).catch(() => ({ data: [] })),
      ]);
      // eslint-disable-next-line id-denylist
      const sumRulesData = sumRulesRes.data;
      // eslint-disable-next-line id-denylist
      const blockedData = blockedRes.data;
      // eslint-disable-next-line id-denylist
      const scheduleData = scheduleRes.data;
      // eslint-disable-next-line id-denylist
      const googleAccountsData = googleAccountsRes.data;
      setSummarizationRules(sumRulesData);
      setBlockedSenders(blockedData);
      setContexts(contextRes.data);
      
      // Check if user has Google tokens from SSO login but no GoogleAccount entries
      const user = userRes.data;
      const hasTokens = !!(user.googleCalendarAccessToken || user.googleCalendarRefreshToken);
      setUserEmail(user.email);
      setHasGoogleTokens(hasTokens);
      
      // If user has tokens but no GoogleAccount entries, show their email as connected
      if (hasTokens && googleAccountsData.length === 0) {
        setGoogleAccounts([{
          id: 'sso-account',
          email: user.email,
          name: user.name || '',
          isPrimary: true,
          isSSO: true, // Mark as SSO account
        }]);
      } else {
        setGoogleAccounts(googleAccountsData);
      }
      
      // Always set batch schedule - use defaults from service if no data returned
      if (scheduleData) {
        setBatchSchedule({
          deliveryDays: scheduleRes.data.deliveryDays || [1, 2, 3, 4, 5],
          deliveryTimes: scheduleRes.data.deliveryTimes || ['11:00', '15:00'], // Match service default (3pm, not 4pm)
          timezone: scheduleRes.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          isEnabled: scheduleRes.data.isEnabled ?? true,
          urgentBypassSchedule: scheduleRes.data.urgentBypassSchedule ?? true,
        });
      } else {
        // If no schedule exists in DB, use defaults (service will return defaults but we handle null case)
        setBatchSchedule({
          deliveryDays: [1, 2, 3, 4, 5],
          deliveryTimes: ['11:00', '15:00'], // Match service default
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          isEnabled: true,
          urgentBypassSchedule: true,
        });
      }
      if (userRes.data.toneSettings?.rules) {
        setToneRules(userRes.data.toneSettings.rules);
      }
      setOpenAiApiKey('');
      setHasGithubToken(!!userRes.data.githubToken);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeContext = async () => {
    setAnalyzing(true);
    setAnalyzeProgress({ show: true, progress: { current: 0, total: 100, message: 'Starting analysis...' }, error: null, isComplete: false });
    try {
      await axios.post(`${API_URL}/context/analyze`);
      // Progress polling is handled by useEffect
    } catch (error: any) {
      console.error('Error starting context analysis:', error);
      setAnalyzing(false);
      setAnalyzeProgress({ 
        show: true, 
        progress: null,
        error: error.response?.data?.message || 'Failed to start analysis. Please try again.',
        isComplete: false,
      });
      // Hide error message after 10 seconds
      setTimeout(() => {
        setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false });
      }, 10000);
    }
  };

  // Helper function to get progress message
  const getProgressMessage = (current: number, total: number, message?: string): string => {
    if (message) return message;
    if (total === 0) return 'Starting analysis...';
    const percent = (current / total) * 100;
    
    if (percent < 30) return 'Fetching emails from your inbox...';
    if (percent < 40) return 'Identifying VIP contacts from starred emails...';
    if (percent < 75) return 'Analyzing email patterns with AI...';
    if (percent < 85) return 'Extracting common Q&A from your replies...';
    if (percent < 95) return 'Saving insights to your context...';
    if (percent < 100) return 'Finalizing analysis...';
    return 'Analysis complete!';
  };

  // Poll for analysis progress in background
  useEffect(() => {
    if (!analyzing) return;

    let retryCount = 0;
    let errorCount = 0;

    const progressInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/context/analyze-progress`);
        
        // Check for error state
        if (response.data.error) {
          clearInterval(progressInterval);
          setAnalyzing(false);
          setAnalyzeProgress({ 
            show: true, 
            progress: null,
            error: response.data.error.message || 'Analysis failed. Please try again.',
            isComplete: false,
          });
          // Hide error after 10 seconds
          setTimeout(() => {
            setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false });
          }, 10000);
          return;
        }
        
        if (response.data.progress) {
          const { current, total, message, threadCount, analyzedCount, stats } = response.data.progress;
          const isComplete = total > 0 && current >= total;
          // Reset error count on successful response
          errorCount = 0;
          retryCount = 0;
          
          setAnalyzeProgress({ 
            show: true, 
            progress: { 
              current, 
              total,
              message: message || getProgressMessage(current, total, message),
              threadCount,
              analyzedCount,
              stats: stats || undefined, // Ensure stats is included if available
            },
            error: null,
            isComplete,
          });
          
          // Check if completed
          if (isComplete) {
            clearInterval(progressInterval);
            setAnalyzing(false);
            // Wait a bit for backend to finish
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Refresh context data
            await fetchData();
            // Don't auto-close - let user dismiss manually
          }
        } else {
          // No progress data - wait a bit before assuming failure
          retryCount++;
          if (retryCount < 5) {
            return; // Continue polling
          }
          // After 5 retries with no progress, assume failure
          clearInterval(progressInterval);
          setAnalyzing(false);
          await fetchData();
          setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false });
        }
      } catch (error: any) {
        console.error('Error fetching analysis progress:', error);
        errorCount++;
        if (errorCount < 3) {
          return; // Continue polling for transient errors
        }
        // After 3 errors, stop polling and show error
        clearInterval(progressInterval);
        setAnalyzing(false);
        const errorMessage = error?.response?.data?.message || error?.message || 'Failed to fetch analysis progress. Please try again.';
        setAnalyzeProgress({ 
          show: true, // Keep popup open to show error
          progress: null, 
          error: errorMessage, 
          isComplete: false 
        });
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(progressInterval);
  }, [analyzing]);

  const handleAddContext = async () => {
    if (!newContextValue.trim() || !addingContextType) return;
    
    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const newContext: UserContext = {
      contextId: tempId,
      contextKey: addingContextType,
      contextValue: newContextValue.trim(),
      source: 'USER_EDITED',
      priority: addingContextType === 'WORKING_ON' ? newContextPriority : undefined,
    };
    setContexts(prev => [...prev, newContext]);
    setNewContextValue('');
    setNewContextPriority(2);
    setAddingContextType(null);
    
    try {
      const response = await axios.post(`${API_URL}/context`, {
        contextKey: addingContextType,
        contextValue: newContextValue.trim(),
        priority: addingContextType === 'WORKING_ON' ? newContextPriority : undefined,
      });
      // Replace temp with real ID
      setContexts(prev => prev.map(c => c.contextId === tempId ? { ...c, contextId: response.data.contextId } : c));
    } catch (error) {
      console.error('Error adding context:', error);
      // Revert on error
      setContexts(prev => prev.filter(c => c.contextId !== tempId));
    }
  };

  const handleUpdateContext = async () => {
    if (!editContextValue.trim() || !editingContextId) return;
    
    const contextToUpdate = contexts.find(c => c.contextId === editingContextId);
    
    // Optimistic update
    setContexts(prev => prev.map(c => 
      c.contextId === editingContextId 
        ? { ...c, contextValue: editContextValue.trim(), priority: editContextPriority }
        : c
    ));
    setEditingContextId(null);
    const savedValue = editContextValue;
    const savedPriority = editContextPriority;
    setEditContextValue('');
    setEditContextPriority(2);
    
    try {
      await axios.put(`${API_URL}/context/${editingContextId}`, {
        contextValue: savedValue.trim(),
        priority: contextToUpdate?.contextKey === 'WORKING_ON' ? savedPriority : undefined,
      });
    } catch (error) {
      console.error('Error updating context:', error);
      // Revert on error
      if (contextToUpdate) {
        setContexts(prev => prev.map(c => 
          c.contextId === editingContextId ? contextToUpdate : c
        ));
      }
    }
  };

  const handleDeleteContext = async (contextId: string) => {
    // Optimistic update - remove from UI immediately
    const deletedContext = contexts.find(c => c.contextId === contextId);
    setContexts(prev => prev.filter(c => c.contextId !== contextId));
    
    try {
      await axios.delete(`${API_URL}/context/${contextId}`);
    } catch (error) {
      console.error('Error deleting context:', error);
      // Revert on error
      if (deletedContext) {
        setContexts(prev => [...prev, deletedContext]);
      }
    }
  };

  const renderContextSection = (title: string, contextKey: string | string[], contexts: UserContext[], addLabel: string, tooltipContent?: string) => {
    const keys = Array.isArray(contextKey) ? contextKey : [contextKey];
    const filteredContexts = contexts.filter(c => keys.includes(c.contextKey));
    
    // Map internal keys to addable type (use first key if array)
    const addType = keys[0];

    return (
      <div style={{ marginBottom: theme.spacing.lg }}>
        <h3 style={{ 
          fontSize: theme.typography.fontSize.lg, 
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          borderBottom: `1px solid ${theme.colors.border.light}`,
          paddingBottom: theme.spacing.xs,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs
        }}>
          {title}
          {tooltipContent && <InfoTooltip content={tooltipContent} />}
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {filteredContexts.length > 0 ? (
            filteredContexts.map(context => (
              <div key={context.contextId} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.light}`
              }}>
                {editingContextId === context.contextId ? (
                  <div style={{ display: 'flex', flex: 1, gap: theme.spacing.sm }}>
                    <input
                      type="text"
                      value={editContextValue}
                      onChange={(e) => setEditContextValue(e.target.value)}
                      style={{
                        flex: 1,
                        padding: theme.spacing.xs,
                        borderRadius: theme.borderRadius.sm,
                        border: `1px solid ${theme.colors.border.medium}`
                      }}
                    />
                    <button onClick={handleUpdateContext} style={{ cursor: 'pointer', color: theme.colors.primary.main, border: 'none', background: 'none' }}>{t('common.save')}</button>
                    <button onClick={() => setEditingContextId(null)} style={{ cursor: 'pointer', color: theme.colors.text.secondary, border: 'none', background: 'none' }}>{t('common.cancel')}</button>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                          {context.contextKey === 'Q_AND_A' && context.contextValue.includes('|') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, width: '100%' }}>
                              {(() => {
                                const parts = context.contextValue.split(' | ');
                                const question = parts.find(part => part.startsWith('Q:'))?.replace('Q:', '').trim() || '';
                                const answer = parts.find(part => part.startsWith('A:'))?.replace('A:', '').trim() || '';
                                return (
                                  <>
                                    <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                                      Q: {question}
                                    </div>
                                    <div style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                                      A: {answer}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <span style={{ color: theme.colors.text.primary }}>{context.contextValue}</span>
                          )}
                          {context.source === 'AUTOGENERATED' && (
                            <span style={{ 
                              fontSize: theme.typography.fontSize.xs, 
                              color: theme.colors.text.tertiary,
                              backgroundColor: theme.colors.background.paper,
                              padding: '2px 6px',
                              borderRadius: theme.borderRadius.sm,
                              border: `1px solid ${theme.colors.border.light}`
                            }}>
                              {t('common.auto')}
                            </span>
                          )}
                        </div>
                        {context.explanation && (
                          <span style={{ 
                            fontSize: theme.typography.fontSize.xs, 
                            color: theme.colors.text.secondary,
                            fontStyle: 'italic',
                          }}>
                            {(() => {
                              // Parse translation key pattern: "key:param1:param2" or just plain text
                              if (context.explanation.includes(':')) {
                                const [key, ...params] = context.explanation.split(':');
                                try {
                                  // Try to translate with parameters
                                  if (key === 'vipContactStarredExplanation' && params[0]) {
                                    const count = parseInt(params[0], 10);
                                    return t('settings.contextExplanations.vipContactStarredExplanation', { 
                                      count,
                                      plural: count > 1 ? 's' : ''
                                    });
                                  }
                                  // Fallback: try to translate the key directly
                                  return t(`settings.contextExplanations.${key}`, params.reduce((acc, param, idx) => {
                                    acc[`param${idx}`] = param;
                                    return acc;
                                  }, {} as Record<string, string>));
                                } catch {
                                  // If translation fails, return the explanation as-is
                                  return context.explanation;
                                }
                              }
                              // If no translation key pattern, return as-is
                              return context.explanation;
                            })()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                      <button 
                        onClick={() => {
                          setEditingContextId(context.contextId);
                          setEditContextValue(context.contextValue);
                        }}
                        style={{ cursor: 'pointer', color: theme.colors.primary.main, border: 'none', background: 'none', fontSize: theme.typography.fontSize.sm }}
                      >
                        {t('common.edit')}
                      </button>
                      <button 
                        onClick={() => handleDeleteContext(context.contextId)}
                        style={{ cursor: 'pointer', color: theme.colors.accent.error, border: 'none', background: 'none', fontSize: theme.typography.fontSize.sm }}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
              No items yet.
            </div>
          )}

          {/* Add New Item Row */}
          {addingContextType === addType ? (
            <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
              <input
                type="text"
                value={newContextValue}
                onChange={(e) => setNewContextValue(e.target.value)}
                placeholder={t('settings.addContext.placeholder')}
                autoFocus
                style={{
                  flex: 1,
                  padding: theme.spacing.sm,
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${theme.colors.primary.main}`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddContext();
                  if (e.key === 'Escape') setAddingContextType(null);
                }}
              />
              <button 
                onClick={handleAddContext}
                disabled={!newContextValue.trim()}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: newContextValue.trim() ? 'pointer' : 'not-allowed',
                  opacity: newContextValue.trim() ? 1 : 0.6
                }}
              >
                {t('common.add')}
              </button>
              <button 
                onClick={() => {
                  setAddingContextType(null);
                  setNewContextValue('');
                }}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setAddingContextType(addType);
                setNewContextValue('');
              }}
              style={{
                alignSelf: 'flex-start',
                marginTop: theme.spacing.xs,
                background: 'transparent',
                border: `1px dashed ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                color: theme.colors.text.secondary,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs
              }}
            >
              <span>+</span> {addLabel}
            </button>
          )}
        </div>
      </div>
    );
  };

  const handleUpdateBatchSchedule = async () => {
    try {
      await axios.put(`${API_URL}/batch-schedule`, batchSchedule);
      alert(t('settings.batchScheduleUpdated') || 'Delivery schedule updated!');
    } catch (error) {
      console.error('Error updating batch schedule:', error);
      alert(t('settings.batchScheduleError') || 'Failed to update delivery schedule');
    }
  };

  const toggleDeliveryDay = (day: number) => {
    setBatchSchedule(prev => ({
      ...prev,
      deliveryDays: prev.deliveryDays.includes(day)
        ? prev.deliveryDays.filter(dayItem => dayItem !== day)
        : [...prev.deliveryDays, day].sort((a, b) => a - b),
    }));
  };

  const addDeliveryTime = () => {
    if (!newDeliveryTime || batchSchedule.deliveryTimes.includes(newDeliveryTime)) return;
    setBatchSchedule(prev => ({
      ...prev,
      deliveryTimes: [...prev.deliveryTimes, newDeliveryTime].sort(),
    }));
    setNewDeliveryTime('');
  };

  const removeDeliveryTime = (time: string) => {
    setBatchSchedule(prev => ({
      ...prev,
      deliveryTimes: prev.deliveryTimes.filter(t => t !== time),
    }));
  };

  const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const handleUpdateToneRules = async (newRules: string[]) => {
    try {
      await axios.put(`${API_URL}/users/me`, { toneSettings: { rules: newRules } });
      setToneRules(newRules);
    } catch (error) {
      console.error('Error updating tone rules:', error);
      alert(t('settings.toneRulesError'));
    }
  };

  const handleAddToneRule = () => {
    if (!newToneRule.trim()) return;
    handleUpdateToneRules([...toneRules, newToneRule.trim()]);
    setNewToneRule('');
  };

  const handleRemoveToneRule = (index: number) => {
    const newRules = [...toneRules];
    newRules.splice(index, 1);
    handleUpdateToneRules(newRules);
  };

  const handleSaveApiKey = async () => {
    if (!openAiApiKey.trim()) {
      alert(t('settings.enterApiKey'));
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: openAiApiKey.trim() });
      setApiKeySaved(true);
      setOpenAiApiKey('');
      setTimeout(() => setApiKeySaved(false), 3000);
    } catch (error) {
      console.error('Error saving API key:', error);
      alert(t('settings.apiKeyError'));
    }
  };

  const handleRemoveApiKey = async () => {
    if (!window.confirm(t('settings.confirmRemoveKey'))) {
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: null });
      setOpenAiApiKey('');
      setShowApiKey(false);
      alert(t('settings.keyRemoved'));
    } catch (error) {
      console.error('Error removing API key:', error);
      alert(t('settings.keyRemoveError'));
    }
  };

  const handleSaveGithubToken = async () => {
    if (!githubToken.trim()) {
      alert('Please enter a GitHub token');
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { githubToken: githubToken.trim() });
      setGithubTokenSaved(true);
      setGithubToken('');
      setHasGithubToken(true);
      setTimeout(() => setGithubTokenSaved(false), 3000);
    } catch (error) {
      console.error('Error saving GitHub token:', error);
      alert('Failed to save GitHub token');
    }
  };

  const handleRemoveGithubToken = async () => {
    if (!window.confirm('Are you sure you want to remove your GitHub token?')) {
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { githubToken: null });
      setGithubToken('');
      setShowGithubToken(false);
      setHasGithubToken(false);
      alert('GitHub token removed');
    } catch (error) {
      console.error('Error removing GitHub token:', error);
      alert('Failed to remove GitHub token');
    }
  };

  // Summarization rule handlers
  const handleAddSummarizationRule = async () => {
    if (!newSummarizationWhen.trim() || !newSummarizationHow.trim()) return;
    
    try {
      await axios.post(`${API_URL}/summarize/rules`, {
        whenToUse: newSummarizationWhen.trim(),
        howToSummarize: newSummarizationHow.trim(),
      });
      setNewSummarizationWhen('');
      setNewSummarizationHow('');
      await fetchData();
    } catch (error) {
      console.error('Error adding summarization rule:', error);
    }
  };

  const handleEditSummarizationRule = (rule: SummarizationRule) => {
    setEditingSummarizationRule(rule.ruleId);
    setEditSummarizationWhen(rule.whenToUse);
    setEditSummarizationHow(rule.howToSummarize);
  };

  const handleSaveSummarizationRule = async (ruleId: string) => {
    try {
      await axios.put(`${API_URL}/summarize/rules/${ruleId}`, {
        whenToUse: editSummarizationWhen,
        howToSummarize: editSummarizationHow,
      });
      setEditingSummarizationRule(null);
      await fetchData();
    } catch (error) {
      console.error('Error updating summarization rule:', error);
    }
  };

  const handleDeleteSummarizationRule = async (ruleId: string) => {
    // Optimistic update
    const deletedRule = summarizationRules.find(r => r.ruleId === ruleId);
    setSummarizationRules(prev => prev.filter(r => r.ruleId !== ruleId));
    
    try {
      await axios.delete(`${API_URL}/summarize/rules/${ruleId}`);
    } catch (error) {
      console.error('Error deleting summarization rule:', error);
      if (deletedRule) {
        setSummarizationRules(prev => [...prev, deletedRule]);
      }
    }
  };

  const handleUnblockSender = async (id: string) => {
    // Optimistic update
    const deletedSender = blockedSenders.find(sender => sender.id === id);
    setBlockedSenders(prev => prev.filter(sender => sender.id !== id));
    
    try {
      await axios.delete(`${API_URL}/blocked-senders/${id}`);
    } catch (error) {
      console.error('Error unblocking sender:', error);
      if (deletedSender) {
        setBlockedSenders(prev => [...prev, deletedSender]);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} logout={logout} />
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl, position: 'relative' }}>
        {/* Analysis progress notification */}
        {analyzeProgress.show && (
          <div style={{
            position: 'fixed',
            top: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing.lg,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            minWidth: '300px',
            maxWidth: '500px',
            zIndex: 2000,
            border: `1px solid ${analyzeProgress.error ? theme.colors.accent.error : theme.colors.border.light}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
              <div style={{ flex: 1 }}>
                {analyzeProgress.error ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        color: theme.colors.accent.error,
                        fontSize: '20px',
                      }}>
                        ⚠️
                      </div>
                      <h3 style={{ 
                        color: theme.colors.accent.error,
                        fontSize: theme.typography.fontSize.base,
                        fontWeight: theme.typography.fontWeight.semibold,
                        margin: 0,
                      }}>
                        Analysis Failed
                      </h3>
                    </div>
                    <p style={{
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.primary,
                      margin: 0,
                      lineHeight: 1.5,
                    }}>
                      {analyzeProgress.error}
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                      {!analyzeProgress.isComplete && (
                        <div style={{
                          width: '12px',
                          height: '12px',
                          border: `2px solid ${theme.colors.primary.main}`,
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                      )}
                      <h3 style={{ 
                        color: theme.colors.text.primary,
                        fontSize: theme.typography.fontSize.base,
                        fontWeight: theme.typography.fontWeight.semibold,
                        margin: 0,
                      }}>
                        {analyzeProgress.isComplete ? 'Analysis Complete' : t('settings.analyzing')}
                      </h3>
                    </div>
                    {analyzeProgress.progress && (
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
                            width: `${(analyzeProgress.progress.current / analyzeProgress.progress.total) * 100}%`,
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
                          {analyzeProgress.progress.message || 
                           `${analyzeProgress.progress.current}% complete`}
                        </p>
                        {/* Show summary if complete OR if progress is 100% and stats exist (fallback) */}
                        {((analyzeProgress.isComplete || (analyzeProgress.progress && analyzeProgress.progress.current === analyzeProgress.progress.total)) && analyzeProgress.progress?.stats) && (
                          <div style={{
                            fontSize: theme.typography.fontSize.xs,
                            color: theme.colors.text.secondary,
                            margin: `${theme.spacing.sm} 0 0 0`,
                            padding: theme.spacing.sm,
                            backgroundColor: theme.colors.background.subtle,
                            borderRadius: theme.borderRadius.md,
                          }}>
                            <div style={{ marginBottom: theme.spacing.xs, fontWeight: theme.typography.fontWeight.semibold }}>
                              Analysis Summary:
                            </div>
                            <div style={{ lineHeight: 1.6 }}>
                              <div>• {analyzeProgress.progress.stats.totalThreads || 0} email threads analyzed</div>
                              <div>• {analyzeProgress.progress.stats.outboundEmails || 0} outbound emails analyzed</div>
                              <div>• {analyzeProgress.progress.stats.threadsNeverOpened || 0} threads never opened (low priority)</div>
                              <div>• {analyzeProgress.progress.stats.threadsReadButNotReplied || 0} threads read but not replied (medium priority)</div>
                              <div>• {analyzeProgress.progress.stats.vipContactsEvaluated || 0} contacts evaluated as VIPs</div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false })}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: theme.colors.text.secondary,
                  cursor: 'pointer',
                  padding: '0',
                  marginLeft: theme.spacing.md,
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xl }}>
          <h1 style={{
            color: theme.colors.text.primary,
            margin: 0,
            fontSize: theme.typography.fontSize['3xl'],
          }}>
            {t('settings.title')}
          </h1>
          <Link
            to="/help/settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: theme.colors.background.subtle,
              color: theme.colors.text.secondary,
              textDecoration: 'none',
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.bold,
              transition: theme.transitions.default,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
              e.currentTarget.style.color = theme.colors.primary.main;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
              e.currentTarget.style.color = theme.colors.text.secondary;
            }}
            title={t('help.title')}
          >
            ?
          </Link>
        </div>

        {/* Email Delivery - Parent section */}
        <div id="email-delivery" style={{
          marginBottom: theme.spacing.xl,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.semibold,
          }}>
            Email Delivery
          </h2>

          {/* Google Accounts Section */}
          <div id="google-accounts" style={{
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            marginBottom: theme.spacing.lg,
            border: `1px solid ${theme.colors.border.medium}`,
          }}>
            <h3 style={{
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.lg,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.semibold,
            }}>
              Gmail Accounts
            </h3>
          
          {googleAccounts.length === 0 ? (
            <div style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.md,
              marginBottom: theme.spacing.md,
            }}>
              <p style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.base,
              }}>
                No Gmail accounts connected. Connect a Gmail account to start using BearlyMail.
              </p>
              <button
                onClick={() => {
                  window.location.href = `${API_URL}/google-accounts/connect`;
                }}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                }}
              >
                Connect Gmail Account
              </button>
            </div>
          ) : (
            <>
              {googleAccounts.map((account) => (
                <div
                  key={account.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.md,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  <div>
                    <div style={{
                      fontWeight: theme.typography.fontWeight.semibold,
                      color: theme.colors.text.primary,
                      marginBottom: theme.spacing.xs,
                    }}>
                      {account.email}
                      {account.isPrimary && (
                        <span style={{
                          marginLeft: theme.spacing.sm,
                          fontSize: theme.typography.fontSize.xs,
                          color: theme.colors.primary.main,
                          backgroundColor: `${theme.colors.primary.main}20`,
                          padding: '2px 6px',
                          borderRadius: theme.borderRadius.sm,
                        }}>
                          Primary
                        </span>
                      )}
                      {account.isSSO && (
                        <span style={{
                          marginLeft: theme.spacing.sm,
                          fontSize: theme.typography.fontSize.xs,
                          color: theme.colors.accent.info,
                          backgroundColor: `${theme.colors.accent.info}20`,
                          padding: '2px 6px',
                          borderRadius: theme.borderRadius.sm,
                        }}>
                          SSO Login
                        </span>
                      )}
                    </div>
                    {account.name && (
                      <div style={{
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.secondary,
                      }}>
                        {account.name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                    {!account.isSSO && !account.isPrimary && (
                      <button
                        onClick={async () => {
                          try {
                            await axios.post(`${API_URL}/google-accounts/${account.id}/set-primary`);
                            await fetchData();
                          } catch (error) {
                            console.error('Error setting primary account:', error);
                          }
                        }}
                        style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: 'transparent',
                          color: theme.colors.primary.main,
                          border: `1px solid ${theme.colors.primary.main}`,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.sm,
                          cursor: 'pointer',
                        }}
                      >
                        Set Primary
                      </button>
                    )}
                    {!account.isSSO && (
                      <button
                        onClick={async () => {
                          if (window.confirm('Are you sure you want to disconnect this Gmail account?')) {
                            try {
                              await axios.delete(`${API_URL}/google-accounts/${account.id}`);
                              await fetchData();
                            } catch (error) {
                              console.error('Error disconnecting account:', error);
                            }
                          }
                        }}
                        style={{
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: 'transparent',
                          color: theme.colors.accent.error,
                          border: `1px solid ${theme.colors.accent.error}`,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.sm,
                          cursor: 'pointer',
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  window.location.href = `${API_URL}/google-accounts/connect`;
                }}
                style={{
                  marginTop: theme.spacing.md,
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.primary.main,
                  border: `1px solid ${theme.colors.primary.main}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                + Connect Another Gmail Account
              </button>
            </>
          )}
          </div>
        <div id="guide-our-ai" style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: '80px',
          }}>
            Guide our AI
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.base,
          }}>
            Configure how the AI understands your context and writing style to provide better email prioritization and drafting assistance.
          </p>

          {/* How I write emails - moved under Guide our AI */}
          <div id="tone-settings" style={{
            marginBottom: theme.spacing.xl,
            paddingTop: theme.spacing.lg,
            borderTop: `1px solid ${theme.colors.border.light}`,
          }}>
            <h3 style={{
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.lg,
            }}>
              {t('settings.howIWrite')}
            </h3>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}>
            {t('settings.toneConfig')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {toneRules.map((rule, index) => {
              // Parse email ID from rule if present (format: "... (email <id>)")
              const emailIdMatch = rule.match(/\(email ([a-f0-9-]+)\)/i);
              const emailId = emailIdMatch ? emailIdMatch[1] : null;
              const displayRule = emailId ? rule.replace(/ \(email [a-f0-9-]+\)/i, '') : rule;
              
              return (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.borderRadius.md }}>
                <span>
                  {displayRule}
                  {emailId && (
                    <a 
                      href={`/email/${emailId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        marginLeft: theme.spacing.xs, 
                        color: theme.colors.primary.main,
                        fontSize: '0.85em',
                        textDecoration: 'none'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      (view email)
                    </a>
                  )}
                </span>
                <button
                  onClick={() => handleRemoveToneRule(index)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: theme.colors.accent.error,
                    cursor: 'pointer',
                  }}
                >
                  {t('common.remove')}
                </button>
              </div>
            );
            })}
            <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
              <input
                type="text"
                value={newToneRule}
                onChange={(e) => setNewToneRule(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToneRule()}
                placeholder={t('settings.addRulePlaceholder')}
                style={{
                  flex: 1,
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                }}
              />
              <button
                onClick={handleAddToneRule}
                disabled={!newToneRule.trim()}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.secondary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: newToneRule.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {t('settings.addRule')}
              </button>
            </div>
          </div>
          </div>
          {/* End How I write emails section */}

          {/* User Context - moved under Guide our AI */}
          <div id="context" style={{
            marginTop: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            borderTop: `1px solid ${theme.colors.border.light}`,
          }}>
            <h3 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.lg,
              marginBottom: theme.spacing.sm,
            }}>
              {t('settings.contextAboutMeTitle')}
            </h3>
            <p style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.base,
              marginBottom: theme.spacing.md,
              lineHeight: theme.typography.lineHeight.relaxed,
            }}>
              {t('settings.contextAboutMe.description1')}{' '}
              <Link 
                to="/help/context#what-is-context" 
                style={{
                  color: theme.colors.primary.main,
                  textDecoration: 'underline',
                }}
              >
                {t('settings.contextAboutMe.learnMore')}
              </Link>
            </p>
            <p style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.base,
              marginBottom: theme.spacing.lg,
              lineHeight: theme.typography.lineHeight.relaxed,
            }}>
              {t('settings.contextAboutMe.description2')}
            </p>
            <div style={{ 
              backgroundColor: theme.colors.background.subtle, 
              padding: theme.spacing.md, 
              borderRadius: theme.borderRadius.md,
              marginBottom: theme.spacing.lg,
              border: `1px solid ${theme.colors.border.light}`,
            }}>
              <div style={{ 
                fontSize: theme.typography.fontSize.sm, 
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.xs,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                💡 {t('settings.contextAboutMe.impactTitle')}
              </div>
              <div style={{ 
                fontSize: theme.typography.fontSize.sm, 
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.sm,
              }}>
                {t('settings.contextAboutMe.impactDescription')}
              </div>
              <Link 
                to="/help/context" 
                style={{
                  color: theme.colors.primary.main,
                  fontSize: theme.typography.fontSize.sm,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {t('settings.contextAboutMe.learnMore')} →
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.sm }}>
              <button
                onClick={handleAnalyzeContext}
                disabled={analyzing}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: analyzing ? theme.colors.background.subtle : theme.colors.secondary.main,
                  color: analyzing ? theme.colors.text.secondary : 'white',
                  border: analyzing ? `1px solid ${theme.colors.border.medium}` : 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: analyzing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                {analyzing && (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: `2px solid ${theme.colors.text.secondary}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                )}
                {analyzing ? t('settings.analyzing') : t('settings.analyzeEmails')}
              </button>
            </div>
            
            {contexts.length === 0 && (
              <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                {t('settings.noContext')}
              </div>
            )}

            {renderContextSection(
              t('settings.contextSections.vip'), 
              'VIP_CONTACT', 
              contexts, 
              t('settings.addContext.vip'),
              t('settings.contextTypes.tooltip.vip')
            )}
            {renderContextSection(
              t('settings.contextSections.userInfo'), 
              'USER_INFO', 
              contexts, 
              t('settings.addContext.userInfo'),
              t('settings.contextTypes.tooltip.userInfo')
            )}
            {renderContextSection(
              t('settings.contextSections.projects'), 
              ['CURRENT_TOPIC', 'PROJECT_NAME', 'WORKING_ON'], 
              contexts, 
              t('settings.addContext.projects'),
              t('settings.contextTypes.tooltip.projects')
            )}
            {renderContextSection(
              t('settings.contextSections.urgent'), 
              'URGENT', 
              contexts, 
              t('settings.addContext.urgent'),
              t('settings.contextTypes.tooltip.urgent')
            )}
            {renderContextSection(
              t('settings.contextSections.notImportant'), 
              'NOT_IMPORTANT', 
              contexts, 
              t('settings.addContext.notImportant'),
              t('settings.contextTypes.tooltip.notImportant')
            )}
            {renderContextSection(
              'Q&A', 
              'Q_AND_A', 
              contexts, 
              'Add common Q&A',
              t('settings.contextTypes.tooltip.qanda')
            )}
            {renderContextSection(
              t('settings.contextSections.other'), 
              ['OTHER', 'COLLEAGUE_NAME', 'COMMON_PHRASE'], 
              contexts, 
              t('settings.addContext.placeholder'),
              t('settings.contextTypes.tooltip.other')
            )}
          </div>
          {/* End User Context section */}
        </div>
        {/* End Guide our AI section */}

        {/* OpenAI API Key */}
        <div id="api-key" style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: '80px', // Offset for sticky nav
          }}>
            {t('settings.openAiTitle')}
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}>
            {t('settings.openAiDesc')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={openAiApiKey}
                onChange={(e) => setOpenAiApiKey(e.target.value)}
                placeholder="sk-..."
                style={{
                  flex: 1,
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.background.default,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {showApiKey ? t('settings.hide') : t('settings.show')}
              </button>
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md }}>
              <button
                onClick={handleSaveApiKey}
                disabled={!openAiApiKey.trim()}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: openAiApiKey.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: openAiApiKey.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {apiKeySaved ? t('settings.saved') : t('settings.saveApiKey')}
              </button>
              <button
                onClick={handleRemoveApiKey}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.accent.error,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                {t('settings.removeKey')}
              </button>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  color: theme.colors.primary.main,
                  textDecoration: 'underline',
                  fontSize: theme.typography.fontSize.sm,
                  alignSelf: 'center',
                }}
              >
                {t('settings.getKey')}
              </a>
            </div>
          </div>
        </div>

        {/* GitHub Integration */}
        <div id="github-integration" style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: '80px',
          }}>
            GitHub Integration
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Connect your GitHub account to automatically detect and display issue and pull request status in emails. 
            You'll need a fine-grained personal access token with <code>Issues: Read</code> and <code>Pull requests: Read</code> permissions.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {hasGithubToken && (
              <div style={{
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.accent.success + '20',
                border: `1px solid ${theme.colors.accent.success}`,
                borderRadius: theme.borderRadius.md,
                color: theme.colors.accent.success,
                fontSize: theme.typography.fontSize.sm,
              }}>
                ✓ GitHub token is configured
              </div>
            )}
            <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
              <input
                type={showGithubToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="github_pat_..."
                style={{
                  flex: 1,
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={() => setShowGithubToken(!showGithubToken)}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.background.default,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {showGithubToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md }}>
              <button
                onClick={handleSaveGithubToken}
                disabled={!githubToken.trim()}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: githubToken.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: githubToken.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {githubTokenSaved ? 'Saved!' : 'Save Token'}
              </button>
              {hasGithubToken && (
                <button
                  onClick={handleRemoveGithubToken}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    backgroundColor: theme.colors.accent.error,
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                  }}
                >
                  Remove Token
                </button>
              )}
              <a
                href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-fine-grained-personal-access-token"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  color: theme.colors.primary.main,
                  textDecoration: 'underline',
                  fontSize: theme.typography.fontSize.sm,
                  alignSelf: 'center',
                }}
              >
                How to create a token
              </a>
            </div>
          </div>
        </div>

          {/* Email Delivery Schedule - under Email Delivery */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.xl,
            marginBottom: theme.spacing.lg,
            boxShadow: theme.shadows.md,
          }}>
            <h3 id="email-batching" style={{
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.xl,
              scrollMarginTop: '80px', // Offset for sticky nav
            }}>
              {t('settings.emailBatching') || 'Email Delivery Schedule'}
            </h3>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Non-urgent emails will be batched and delivered at these scheduled times. Urgent emails always come through immediately.
          </p>

          {/* Delivery Days */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <label style={{ 
              color: theme.colors.text.primary, 
              fontWeight: theme.typography.fontWeight.medium,
              display: 'block',
              marginBottom: theme.spacing.sm,
            }}>
              Delivery Days
            </label>
            <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              {DAY_NAMES.map((name, index) => (
                <button
                  key={index}
                  onClick={() => toggleDeliveryDay(index)}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    backgroundColor: batchSchedule.deliveryDays.includes(index) 
                      ? theme.colors.primary.main 
                      : theme.colors.background.subtle,
                    color: batchSchedule.deliveryDays.includes(index) 
                      ? 'white' 
                      : theme.colors.text.secondary,
                    border: `1px solid ${batchSchedule.deliveryDays.includes(index) 
                      ? theme.colors.primary.main 
                      : theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontWeight: theme.typography.fontWeight.medium,
                    transition: theme.transitions.fast,
                    minWidth: '50px',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <p style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
              marginTop: theme.spacing.xs,
            }}>
              Select which days you want to receive email batches. Unselected days will have no deliveries.
            </p>
          </div>

          {/* Delivery Times */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <label style={{ 
              color: theme.colors.text.primary, 
              fontWeight: theme.typography.fontWeight.medium,
              display: 'block',
              marginBottom: theme.spacing.sm,
            }}>
              Delivery Times
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
              {batchSchedule.deliveryTimes.map((time) => (
                <div
                  key={time}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    backgroundColor: theme.colors.primary.subtle,
                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.primary.light}`,
                  }}
                >
                  <span style={{ 
                    color: theme.colors.primary.dark,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}>
                    {formatTime12h(time)}
                  </span>
                  <button
                    onClick={() => removeDeliveryTime(time)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.colors.primary.dark,
                      cursor: 'pointer',
                      padding: '2px',
                      fontSize: theme.typography.fontSize.sm,
                      lineHeight: 1,
                    }}
                    title="Remove time"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
              <input
                type="time"
                value={newDeliveryTime}
                onChange={(e) => setNewDeliveryTime(e.target.value)}
                style={{
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                }}
              />
              <button
                onClick={addDeliveryTime}
                disabled={!newDeliveryTime}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: newDeliveryTime ? theme.colors.secondary.main : theme.colors.background.subtle,
                  color: newDeliveryTime ? 'white' : theme.colors.text.disabled,
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: newDeliveryTime ? 'pointer' : 'not-allowed',
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                Add Time
              </button>
            </div>
          </div>

          {/* Timezone Display */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <label style={{ 
              color: theme.colors.text.secondary, 
              fontSize: theme.typography.fontSize.sm,
            }}>
              Timezone: {batchSchedule.timezone}
            </label>
          </div>

          {/* Save Button */}
          <button
            onClick={handleUpdateBatchSchedule}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {t('common.save')}
          </button>
        </div>

        {/* Summarization Rules */}
        <div id="summarization" style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: '80px', // Offset for sticky nav
          }}>
            {t('settings.summarizationRules')}
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}>
            {t('settings.summarizationRulesDesc')}
          </p>
          
          {/* Add New Rule Form */}
          <div style={{
            padding: theme.spacing.lg,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.background.subtle,
            marginBottom: theme.spacing.lg,
          }}>
            <h3 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.base }}>
              {t('settings.addSummarizationRule')}
            </h3>
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                {t('settings.whenToUse')}
              </label>
              <input
                type="text"
                value={newSummarizationWhen}
                onChange={(e) => setNewSummarizationWhen(e.target.value)}
                placeholder={t('settings.whenToUsePlaceholder')}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                }}
              />
            </div>
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                {t('settings.howToSummarize')}
              </label>
              <textarea
                value={newSummarizationHow}
                onChange={(e) => setNewSummarizationHow(e.target.value)}
                placeholder={t('settings.howToSummarizePlaceholder')}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  resize: 'vertical',
                }}
              />
            </div>
            <button
              onClick={handleAddSummarizationRule}
              disabled={!newSummarizationWhen.trim() || !newSummarizationHow.trim()}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: newSummarizationWhen.trim() && newSummarizationHow.trim() ? theme.colors.primary.main : theme.colors.background.subtle,
                color: newSummarizationWhen.trim() && newSummarizationHow.trim() ? 'white' : theme.colors.text.tertiary,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: newSummarizationWhen.trim() && newSummarizationHow.trim() ? 'pointer' : 'not-allowed',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('settings.addRule')}
            </button>
          </div>

          {/* Existing Rules */}
          {summarizationRules.length === 0 ? (
            <div style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              border: `2px dashed ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
            }}>
              {t('settings.noSummarizationRules')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              {summarizationRules.map((rule) => (
                <div
                  key={rule.ruleId}
                  style={{
                    padding: theme.spacing.lg,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: theme.colors.background.default,
                  }}
                >
                  {editingSummarizationRule === rule.ruleId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                      <div>
                        <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                          {t('settings.whenToUse')}
                        </label>
                        <input
                          type="text"
                          value={editSummarizationWhen}
                          onChange={(e) => setEditSummarizationWhen(e.target.value)}
                          style={{
                            width: '100%',
                            padding: theme.spacing.sm,
                            border: `1px solid ${theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.md,
                            fontSize: theme.typography.fontSize.sm,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ color: theme.colors.text.secondary, display: 'block', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                          {t('settings.howToSummarize')}
                        </label>
                        <textarea
                          value={editSummarizationHow}
                          onChange={(e) => setEditSummarizationHow(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            padding: theme.spacing.sm,
                            border: `1px solid ${theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.md,
                            fontSize: theme.typography.fontSize.sm,
                            resize: 'vertical',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                        <button
                          onClick={() => handleSaveSummarizationRule(rule.ruleId)}
                          style={{
                            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                            backgroundColor: theme.colors.primary.main,
                            color: 'white',
                            border: 'none',
                            borderRadius: theme.borderRadius.md,
                            cursor: 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                          }}
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditingSummarizationRule(null)}
                          style={{
                            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                            backgroundColor: 'transparent',
                            color: theme.colors.text.secondary,
                            border: `1px solid ${theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.md,
                            cursor: 'pointer',
                            fontSize: theme.typography.fontSize.sm,
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            color: theme.colors.text.primary,
                            fontSize: theme.typography.fontSize.base,
                            fontWeight: theme.typography.fontWeight.medium,
                            marginBottom: theme.spacing.xs,
                          }}>
                            📋 {rule.whenToUse}
                          </div>
                          <div style={{
                            color: theme.colors.text.secondary,
                            fontSize: theme.typography.fontSize.sm,
                            marginBottom: theme.spacing.xs,
                          }}>
                            → {rule.howToSummarize}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                          <button
                            onClick={() => handleEditSummarizationRule(rule)}
                            style={{
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              backgroundColor: 'transparent',
                              color: theme.colors.primary.main,
                              border: `1px solid ${theme.colors.primary.main}`,
                              borderRadius: theme.borderRadius.sm,
                              cursor: 'pointer',
                              fontSize: theme.typography.fontSize.xs,
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteSummarizationRule(rule.ruleId)}
                            style={{
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              backgroundColor: 'transparent',
                              color: theme.colors.accent.error,
                              border: `1px solid ${theme.colors.accent.error}`,
                              borderRadius: theme.borderRadius.sm,
                              cursor: 'pointer',
                              fontSize: theme.typography.fontSize.xs,
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocked Senders */}
        <div id="blocked-senders" style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: '80px', // Offset for sticky nav
          }}>
            🚫 Blocked Senders
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Emails from blocked senders are automatically archived and won't appear in your inbox. They're labeled "blocked-by-bearlymail" and won't be summarized.
          </p>
          
          {blockedSenders.length === 0 ? (
            <div style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              border: `2px dashed ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
            }}>
              No blocked senders. You can block senders from the inbox by clicking "Block sender" on any email.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {blockedSenders.map((sender) => (
                <div
                  key={sender.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  <div>
                    <div style={{
                      color: theme.colors.text.primary,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}>
                      {sender.senderName || sender.email}
                    </div>
                    {sender.senderName && (
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                      }}>
                        {sender.email}
                      </div>
                    )}
                    {sender.reason && (
                      <div style={{
                        color: theme.colors.text.tertiary,
                        fontSize: theme.typography.fontSize.xs,
                        marginTop: theme.spacing.xs,
                      }}>
                        Reason: {sender.reason}
                      </div>
                    )}
                    <div style={{
                      color: theme.colors.text.tertiary,
                      fontSize: theme.typography.fontSize.xs,
                      marginTop: theme.spacing.xs,
                    }}>
                      Blocked {new Date(sender.blockedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblockSender(sender.id)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.accent.error,
                      border: `1px solid ${theme.colors.accent.error}`,
                      borderRadius: theme.borderRadius.md,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
        {/* End Email Delivery section */}
      </div>
    </div>
  );
};

export default Settings;

