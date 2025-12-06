import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { theme } from '../theme/theme';
import { humanizeTimestamp } from '../utils/dateUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  priorityScore: number;
  isRead: boolean;
  receivedAt: string;
  summary?: string | null;
  isProcessingSummary?: boolean;
}


const EmailDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]); // All emails in thread
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set()); // Track which thread items are expanded
  const [noteContent, setNoteContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryType, setSummaryType] = useState<string>('tldr');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [customRule, setCustomRule] = useState({ whenToUse: '', howToSummarize: '' });
  const [customRules, setCustomRules] = useState<Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>>([]);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [snoozeInput, setSnoozeInput] = useState<string>('');
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [actionItems, setActionItems] = useState<Array<{ id?: string; description: string; isCompleted: boolean; source: string }>>([]);
  const [newActionItem, setNewActionItem] = useState('');
  const [replyOptions, setReplyOptions] = useState<Array<{ label: string; text: string }> | null>(null);
  const [selectedReplyOption, setSelectedReplyOption] = useState<number>(0);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll'>('reply');
  const [replyRecipients, setReplyRecipients] = useState<string>('');
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [toneCheckResult, setToneCheckResult] = useState<{ isOk: boolean; suggestions: string[]; revisedText?: string } | null>(null);
  const [checkingTone, setCheckingTone] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const [animationClass, setAnimationClass] = useState<string | null>(null);
  const [priorityExplanation, setPriorityExplanation] = useState<{ score: number; breakdown: Array<{ factor: string; value: number; description: string }> } | null>(null);
  const [showPriorityExplanation, setShowPriorityExplanation] = useState(false);

  const triggerAnimation = (type: 'send' | 'archive') => {
    const animations = type === 'send' 
      ? ['animate-fly-out-right', 'animate-fly-out-up'] 
      : ['animate-poof', 'animate-fly-out-right'];
    const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
    setAnimationClass(randomAnimation);
    return new Promise(resolve => setTimeout(resolve, 800)); // Wait for animation
  };

  const fetchCustomRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/summarize/rules`);
      setCustomRules(response.data);
      return response.data; // Return data for chaining
    } catch (error) {
      console.error('Error fetching custom rules:', error);
      return [];
    }
  }, []);

  const handleUseCustomRule = useCallback(async (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => {
    if (!id) return;
    setIsGeneratingSummary(true);
    setSummaryType(rule.ruleId ? `custom-${rule.ruleId}` : 'custom');
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, {
        type: 'custom',
        customPrompt: rule.howToSummarize,
      });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id]);

  const handleSummarize = useCallback(async (type: string) => {
    if (!id) return;
    setIsGeneratingSummary(true);
    setSummaryType(type);
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, { type });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id]);

  const fetchEmail = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/${id}`);
      const emailData = response.data;
      setEmail(emailData);
      
      // Update summary from email data if available (don't overwrite if we already have one)
      if (emailData.summary && !summary) {
        setSummary(emailData.summary);
      }
      
      // Mark as read in parallel, don't wait for it
      axios.put(`${API_URL}/emails/${id}/read`).catch(err => console.error('Error marking as read:', err));
      
      // Request job acceleration for this email (priority processing)
      axios.post(`${API_URL}/emails/${id}/accelerate`).catch(err => 
        console.debug('Job acceleration not available:', err.message)
      );
      
      return emailData;
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  }, [id, summary]);

  const fetchThreadEmails = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/thread`);
      setThreadEmails(response.data || []);
    } catch (error) {
      console.error('Error fetching thread emails:', error);
      setThreadEmails([]);
    }
  }, [id]);

  const fetchNote = useCallback(async () => {
    if (!email?.threadId) return;
    try {
      const response = await axios.get(`${API_URL}/notes/thread/${email.threadId}`);
      if (response.data) {
        setNoteContent(response.data.content);
        setNotesCollapsed(false); // Expand if note exists
      } else {
        setNotesCollapsed(true); // Collapse if empty
      }
    } catch (error) {
      // Note might not exist
      setNotesCollapsed(true);
    }
  }, [email?.threadId]);

  const fetchActionItems = useCallback(async () => {
    if (!email?.id) return;
    try {
      const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
      setActionItems(response.data);
    } catch (error) {
      console.error('Error fetching action items:', error);
    }
  }, [email?.id]);

  useEffect(() => {
    if (id) {
      fetchCustomRules().then((rules) => {
        // Fetch email after rules are loaded
        fetchEmail().then((emailData) => {
           if (emailData && !emailData.summary && !emailData.isProcessingSummary && !isGeneratingSummary) {
             const rulesList = rules || [];
             const defaultType = rulesList.length > 0 
               ? `custom-${rulesList[0].ruleId}` 
          : 'tldr';
             
             // We can't call hooks here, but we can call the callbacks
        if (defaultType.startsWith('custom-')) {
          const ruleId = defaultType.split('-')[1];
                const rule = rulesList.find((r: any) => r.ruleId === ruleId);
          if (rule) {
            handleUseCustomRule(rule);
          } else {
            handleSummarize('tldr');
          }
        } else {
          handleSummarize(defaultType);
        }
           } else if (emailData && emailData.summary) {
        setSummary(emailData.summary);
              setSummaryType('tldr');
              setSummaryCollapsed(false);
           }
        });
      });
    }
  }, [id, fetchCustomRules, fetchEmail, handleUseCustomRule, handleSummarize, isGeneratingSummary]);

  useEffect(() => {
    if (email?.threadId) {
      fetchNote();
      fetchThreadEmails();
      // Fetch action items, and if none exist, auto-extract them
      const fetchAndAutoExtract = async () => {
        try {
          const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
          setActionItems(response.data);
          
          // Auto-extract if no action items exist and email has a body
          if (response.data.length === 0 && email.body) {
            try {
              const extractResponse = await axios.post(`${API_URL}/llm/extract-actions`, { emailBody: email.body });
              if (extractResponse.data && extractResponse.data.length > 0) {
                const newItems = extractResponse.data.map((item: any) => ({
                  description: item.description,
                  isCompleted: false,
                  source: 'llm',
                }));
                await Promise.all(newItems.map((item: any) => 
                  axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
                ));
                // Fetch the saved items
                const updatedResponse = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
                setActionItems(updatedResponse.data);
              }
            } catch (extractError) {
              console.error('Error auto-extracting actions:', extractError);
            }
          }
    } catch (error) {
          console.error('Error fetching action items:', error);
        }
      };
      fetchAndAutoExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.threadId, email?.id, email?.body]);
  
  useEffect(() => {
    if (email?.id && threadEmails.length > 0) {
      // Sort by receivedAt descending to get most recent first
      const sorted = [...threadEmails].sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
      const mostRecentId = sorted[0]?.id;
      
      // Expand the current email (or most recent if current not found) initially
      const emailToExpand = email.id || mostRecentId;
      setExpandedThreadItems(new Set(emailToExpand ? [emailToExpand] : []));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.id, threadEmails.length]); // threadEmails intentionally excluded to prevent re-running on content changes

  /**
   * Remove email signature from text (works for both plain text and HTML)
   */
  const removeSignature = (content: string, isHtml: boolean = false): string => {
    if (!content) return '';
    
    if (isHtml) {
      // For HTML, look for signature patterns directly in HTML structure
      const htmlSignaturePatterns = [
        // Look for structured signatures like RMIT with privacy statements
        /(<div[^>]*>[\s\S]*?(?:RESEARCH CONTRACTS|Privacy Statement|www\.rmit\.edu\.au|RMIT values your privacy)[\s\S]*?<\/div>)/i,
        // Look for signature blocks with common closings
        /(<p[^>]*>[\s\S]*?(?:Best regards|Kind regards|Regards|Thanks|Thank you|Cheers|Sincerely|Yours truly|Warm regards|Best|All the best)[\s\S]*?<\/p>)/i,
        // Look for signature dividers
        /(<div[^>]*>[\s\S]*?--\s*<\/div>)/i,
        /(<p[^>]*>[\s\S]*?--\s*<\/p>)/i,
        // Look for mobile signatures
        /(<div[^>]*>[\s\S]*?(?:Sent from my|Get Outlook for|Sent from Mail|Sent from iPhone|Sent from iPad)[\s\S]*?<\/div>)/i,
      ];
      
      let cutoffIndex = content.length;
      
      for (const pattern of htmlSignaturePatterns) {
        const match = content.match(pattern);
        if (match && match.index !== undefined) {
          const index = match.index;
          // Only cut if there's meaningful content before (at least 200 chars)
          if (index > 200 && index < cutoffIndex) {
            cutoffIndex = index;
          }
        }
      }
      
      // Also check plain text representation for additional patterns
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const text = tempDiv.textContent || tempDiv.innerText || '';
      
      const textSignaturePatterns = [
        /\n\n--\s*$/m,
        /\n\n-{3,}\s*$/m,
        /\n\nRESEARCH CONTRACTS TEAM[\s\S]*?Privacy[\s\S]*$/i,
        /\n\n(Best regards?|Kind regards?|Regards?|Thanks?|Thank you|Cheers?|Sincerely|Yours truly|Warm regards?|Best|All the best)[\s\S]*$/i,
        /\n\nRMIT[\s\S]*?(Privacy|www\.rmit\.edu\.au)[\s\S]*$/i,
      ];
      
      for (const pattern of textSignaturePatterns) {
        const match = text.match(pattern);
        if (match && match.index !== undefined) {
          // Find the corresponding position in HTML (approximate)
          const textBeforeSig = text.substring(0, match.index);
          const htmlPos = content.indexOf(textBeforeSig.slice(-100)); // Look for last 100 chars of text
          if (htmlPos > 200 && htmlPos < cutoffIndex) {
            cutoffIndex = htmlPos;
          }
        }
      }
      
      if (cutoffIndex < content.length) {
        return content.substring(0, cutoffIndex).trim();
      }
      
      return content;
    } else {
      // Plain text signature removal
      const signaturePatterns = [
        /\n\n--\s*$/m,
        /\n\n-{3,}\s*$/m,
        /\n\n_{3,}\s*$/m,
        /\n\n(Best regards?|Kind regards?|Regards?|Thanks?|Thank you|Cheers?|Sincerely|Yours truly|Warm regards?|Best|All the best)[\s\S]*$/i,
        /\n\n(Sent from my|Get Outlook for|Sent from Mail|Sent from iPhone|Sent from iPad)[\s\S]*$/i,
        /\n\nRESEARCH CONTRACTS TEAM[\s\S]*?Privacy[\s\S]*$/i,
        /\n\nRMIT[\s\S]*?(Privacy|www\.rmit\.edu\.au)[\s\S]*$/i,
      ];
      
      let cutoffIndex = content.length;
      
      for (const pattern of signaturePatterns) {
        const match = content.match(pattern);
        if (match && match.index !== undefined) {
          const index = match.index;
          if (index > 100 && index < cutoffIndex) {
            cutoffIndex = index;
          }
        }
      }
      
      if (cutoffIndex < content.length) {
        return content.substring(0, cutoffIndex).trim();
      }
    }
    
    return content;
  };

  const extractCleanBody = (emailBody: string, htmlBody?: string): string => {
    if (!emailBody && !htmlBody) return '';
    
    // Prefer plain text body, fallback to HTML
    let content = emailBody || '';
    const isHtml = !!htmlBody;
    
    if (htmlBody && !emailBody) {
      // Convert HTML to text for cleaning
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlBody;
      content = tempDiv.textContent || tempDiv.innerText || '';
    }
    
    // Remove quoted replies
    const quotePatterns = [
      /^On\s+.*?\s+wrote:.*$/m,
      /^From:.*$/m,
      /^Sent:.*$/m,
      /^To:.*$/m,
      /^Subject:.*$/m,
      /^>+.*$/gm,
      /^-----Original Message-----.*$/m,
      /^_{32,}$/m,
    ];
    
    for (const pattern of quotePatterns) {
      content = content.replace(pattern, '');
    }
    
    // Remove signatures
    content = removeSignature(content, false);
    
    return content.replace(/\n{3,}/g, '\n\n').trim();
  };

  const toggleThreadItem = (emailId: string) => {
    setExpandedThreadItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) { newSet.delete(emailId); } else { newSet.add(emailId); }
      return newSet;
    });
  };

  const handleFetchPriorityExplanation = async () => {
    if (!id) return;
    if (priorityExplanation) {
      setShowPriorityExplanation(true);
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/priority-explanation`);
      setPriorityExplanation(response.data);
      setShowPriorityExplanation(true);
    } catch (error) {
      console.error('Error fetching priority explanation:', error);
    }
  };

  const handleExtractActions = async () => {
    if (!id || !email?.body) return;
    setIsGeneratingSummary(true);
    try {
      const response = await axios.post(`${API_URL}/llm/extract-actions`, { emailBody: email.body });
      const newItems = response.data.map((item: any) => ({
        description: item.description,
        isCompleted: false,
        source: 'llm',
      }));
      await Promise.all(newItems.map((item: any) => 
        axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
      ));
      fetchActionItems();
    } catch (error) {
      console.error('Error extracting actions:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleAddActionItem = async () => {
    if (!newActionItem.trim() || !email?.id) return;
    try {
      await axios.post(`${API_URL}/action-items`, {
        description: newActionItem,
        emailId: email.id,
        emailThreadId: email.threadId,
        source: 'user',
      });
      setNewActionItem('');
      fetchActionItems();
    } catch (error) {
      console.error('Error adding action item:', error);
    }
  };

  const handleToggleActionItem = async (itemId: string, completed: boolean) => {
    try {
      setActionItems(prev => prev.map(item => item.id === itemId ? { ...item, isCompleted: completed } : item));
      await axios.put(`${API_URL}/action-items/${itemId}`, { isCompleted: completed });
    } catch (error) {
      console.error('Error toggling action item:', error);
      fetchActionItems();
    }
  };

  const handleSaveNote = async () => {
    if (!email) return;
    try {
      await axios.post(`${API_URL}/notes/thread/${email.threadId}`, { content: noteContent });
      await fetchNote();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleCreateCustomRule = async () => {
    try {
      await axios.post(`${API_URL}/summarize/rules`, customRule);
      await fetchCustomRules();
      setShowRuleModal(false);
      if (id) {
        await handleUseCustomRule(customRule);
      }
      setCustomRule({ whenToUse: '', howToSummarize: '' });
    } catch (error) {
      console.error('Error creating rule:', error);
    }
  };

  const handleOpenReplyComposer = (mode: 'reply' | 'replyAll') => {
    setReplyMode(mode);
    setShowReplyComposer(true);
    setDraft('');
    setToneCheckResult(null);
    // Set default recipients based on mode
    if (email) {
      if (mode === 'replyAll') {
        // Include original sender and any CC recipients
        const recipients = [email.from];
        // TODO: Add CC recipients when available
        setReplyRecipients(recipients.join(', '));
      } else {
        setReplyRecipients(email.from);
      }
    }
    // Start generating replies immediately
    handleGenerateDraft();
  };

  const handleGenerateDraft = async () => {
    if (!id || !email) return;
    setLoadingReplies(true);
    try {
      const response = await axios.post(`${API_URL}/llm/suggest-replies`, {
        originalEmail: {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        }
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Add "Custom" option at the end
        const optionsWithCustom = [
          ...response.data,
          { label: 'Custom', text: '' }
        ];
        setReplyOptions(optionsWithCustom);
        setDraft(response.data[0].text);
        setSelectedReplyOption(0);
      } else {
        // Fallback: just show custom option
        setReplyOptions([{ label: 'Custom', text: '' }]);
        setDraft('');
        setSelectedReplyOption(0);
      }
    } catch (error) {
      console.error('Error generating draft:', error);
      // On error, still show the composer with custom option
      setReplyOptions([{ label: 'Custom', text: '' }]);
      setDraft('');
      setSelectedReplyOption(0);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSendReply = async () => {
    if (!id || !draft) return;
    
    // Auto-check tone before sending
    setCheckingTone(true);
    try {
      const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, { text: draft });
      setToneCheckResult(toneResponse.data);
      
      // If tone check fails, don't send - let user review
      if (!toneResponse.data.isOk) {
        setCheckingTone(false);
        return;
      }
    } catch (error) {
      console.error('Error checking tone:', error);
      // Continue with send if tone check fails
    } finally {
      setCheckingTone(false);
    }
    
    setSending(true);
    try {
      await axios.post(`${API_URL}/replies/send/${id}`, { 
        reply: draft,
        recipients: replyRecipients,
        replyAll: replyMode === 'replyAll',
      });
      setDraft(null);
      setShowReplyComposer(false);
      await triggerAnimation('send');
      alert(t('emailDetail.replySentSuccess'));
      navigate('/inbox');
    } catch (error: any) {
      console.error('Error sending reply:', error);
      alert(error.response?.data?.message || t('emailDetail.replySentError'));
    } finally {
      setSending(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    await triggerAnimation('archive');
    navigate('/inbox');
    axios.put(`${API_URL}/emails/${id}/archive`).catch(error => {
      console.error('Error archiving email:', error);
    });
  };

  const handleSnooze = async () => {
    if (!id || !snoozeInput.trim()) return;
    const duration = snoozeInput.trim();
    setSnoozeInput('');
    setShowSnoozeInput(false);
    navigate('/inbox');
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
      console.error('Error snoozing email:', error);
    });
  };

  const ActionButton: React.FC<{ 
    onClick: () => void, 
    label: string, 
    variant?: 'primary' | 'secondary' | 'info', 
    icon?: string 
  }> = ({ onClick, label, variant = 'secondary', icon }) => {
    let bg = theme.colors.background.default;
    let color = theme.colors.text.primary;
    let hoverBg = theme.colors.border.light;

    if (variant === 'primary') {
      bg = theme.colors.primary.main;
      color = 'white';
      hoverBg = theme.colors.primary.dark;
    } else if (variant === 'info') {
      bg = theme.colors.accent.info;
      color = 'white';
      hoverBg = theme.colors.primary.dark;
    }

    return (
      <button
        onClick={onClick}
        disabled={isGeneratingSummary}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: bg,
          color: color,
          border: 'none',
          borderRadius: theme.borderRadius.full,
          cursor: isGeneratingSummary ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          transition: theme.transitions.fast,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          opacity: isGeneratingSummary ? 0.7 : 1,
          boxShadow: theme.shadows.sm,
        }}
        onMouseEnter={(e) => !isGeneratingSummary && (e.currentTarget.style.backgroundColor = hoverBg)}
        onMouseLeave={(e) => !isGeneratingSummary && (e.currentTarget.style.backgroundColor = bg)}
      >
        {icon && <span>{icon}</span>}
        {label}
      </button>
    );
  };

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
        {t('emailDetail.loadingEmail')}
      </div>
    );
  }

  if (!email) {
    return <div>{t('emailDetail.emailNotFound')}</div>;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
      position: 'relative', // For animation overlay
    }}>
      {animationClass && (
        <div className={animationClass} style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: theme.colors.background.paper,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '5rem' }}>
            {animationClass.includes('poof') ? '💨' : '✈️'}
          </div>
        </div>
      )}
      {/* Back Navigation */}
      <div style={{
        width: '80px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: theme.spacing.xl,
      }}>
        <button
          onClick={() => navigate('/inbox')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border.medium}`,
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            transition: theme.transitions.fast,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.background.default}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Back to Inbox"
        >
          ⬅️
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing['2xl'] }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Private Notes & Action Items Section */}
          <div style={{ marginBottom: theme.spacing.xl }}>
            {/* Private Notes (Collapsible) */}
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.xl,
              padding: theme.spacing.lg,
              boxShadow: theme.shadows.sm,
              marginBottom: theme.spacing.md,
              border: `1px solid ${theme.colors.border.light}`,
            }}>
              <div 
                onClick={() => setNotesCollapsed(!notesCollapsed)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <h3 style={{
                  color: theme.colors.text.primary,
                  margin: 0,
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.semibold,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}>
                  📝 {t('emailDetail.privateNotes')}
                </h3>
                <span style={{ color: theme.colors.text.secondary }}>
                  {notesCollapsed ? '▼' : '▲'}
                </span>
              </div>
              
              {!notesCollapsed && (
                <div className="animate-fade-in" style={{ marginTop: theme.spacing.md }}>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder={t('emailDetail.privateNotesPlaceholder')}
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: theme.spacing.md,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.base,
                      fontFamily: theme.typography.fontFamily,
                      marginBottom: theme.spacing.md,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ActionButton label={t('emailDetail.saveNote')} onClick={handleSaveNote} variant="primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Action Items */}
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.xl,
              padding: theme.spacing.lg,
              boxShadow: theme.shadows.sm,
              border: `1px solid ${theme.colors.border.light}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                <h3 style={{
                  color: theme.colors.text.primary,
                  margin: 0,
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.semibold,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}>
                  ✅ {t('emailDetail.actionItems')}
                </h3>
                <button
                  onClick={handleExtractActions}
                  disabled={isGeneratingSummary}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: theme.colors.primary.main,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  {isGeneratingSummary ? t('emailDetail.extracting') : `✨ ${t('emailDetail.suggestActions')}`}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {actionItems.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={(e) => handleToggleActionItem(item.id, e.target.checked)}
                      style={{ marginTop: '4px', cursor: 'pointer' }}
                    />
                    <span style={{ 
                      flex: 1,
                      textDecoration: item.isCompleted ? 'line-through' : 'none',
                      color: item.isCompleted ? theme.colors.text.tertiary : theme.colors.text.primary,
                    }}>
                      {item.description}
                      {item.source === 'llm' && (
                        <span style={{ 
                          fontSize: '0.7rem', 
                          backgroundColor: theme.colors.primary.subtle, 
                          color: theme.colors.primary.main,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          marginLeft: theme.spacing.sm,
                        }}>{t('emailDetail.aiBadge')}</span>
                      )}
                    </span>
                  </div>
                ))}
                
                {/* Add new task */}
                <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  <input
                    type="text"
                    value={newActionItem}
                    onChange={(e) => setNewActionItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddActionItem()}
                    placeholder={t('emailDetail.addTaskPlaceholder')}
                    style={{
                      flex: 1,
                      padding: theme.spacing.sm,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  />
                  <button
                    onClick={handleAddActionItem}
                    disabled={!newActionItem.trim()}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                      backgroundColor: theme.colors.background.subtle,
                      color: theme.colors.text.primary,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      cursor: newActionItem.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {t('common.add')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Email Card */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.xl,
            padding: theme.spacing['2xl'],
            boxShadow: theme.shadows.md,
            marginBottom: theme.spacing.xl,
          }}>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <h1 style={{
                fontSize: theme.typography.fontSize['3xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
                lineHeight: theme.typography.lineHeight.tight,
              }}>
                📧 {email.subject}
              </h1>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.border.light}`, paddingBottom: theme.spacing.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: theme.colors.primary.subtle,
                    color: theme.colors.primary.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: theme.typography.fontWeight.bold,
                    fontSize: theme.typography.fontSize.lg,
                  }}>
                    {(email.fromName || email.from)[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                      👤 {email.fromName || email.from}
                    </div>
                    <div 
                      style={{ 
                        fontSize: theme.typography.fontSize.sm, 
                        color: theme.colors.text.primary,
                        opacity: 0.8,
                      }}
                      title={new Date(email.receivedAt).toLocaleString(undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short',
                      })}
                    >
                      {humanizeTimestamp(email.receivedAt)}
                    </div>
                  </div>
                </div>
                <div 
                  onClick={handleFetchPriorityExplanation}
                  style={{ 
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`, 
                  backgroundColor: theme.colors.background.default, 
                  borderRadius: theme.borderRadius.full,
                  fontSize: theme.typography.fontSize.xs,
                  fontWeight: theme.typography.fontWeight.medium,
                    color: theme.colors.text.secondary,
                    cursor: 'pointer',
                    position: 'relative', // For popup positioning
                  }}
                  title={t('emailDetail.clickToSeeScore')}
                >
                  {t('emailDetail.priorityScore', { score: email.priorityScore.toFixed(0) })}
                  
                  {/* Priority Explanation Popup */}
                  {showPriorityExplanation && priorityExplanation && (
                    <div 
                      onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: theme.spacing.sm,
                        backgroundColor: theme.colors.background.paper,
                        borderRadius: theme.borderRadius.md,
                        boxShadow: theme.shadows.lg,
                        padding: theme.spacing.lg,
                        zIndex: 1000,
                        width: '300px',
                        border: `1px solid ${theme.colors.border.light}`,
                        cursor: 'default',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                        <h4 style={{ margin: 0, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold }}>
                          {t('emailDetail.scoreBreakdown')}
                        </h4>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPriorityExplanation(false);
                          }}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                        >
                          ×
                        </button>
                </div>
                      
                      <div style={{ marginBottom: theme.spacing.md }}>
                        {priorityExplanation.breakdown.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.xs, fontSize: theme.typography.fontSize.sm }}>
                            <span title={item.description} style={{ cursor: 'help', borderBottom: '1px dotted #ccc' }}>
                              {item.factor}
                            </span>
                            <span style={{ fontWeight: item.value > 0 ? 'bold' : 'normal', color: item.value > 0 ? theme.colors.accent.success || 'green' : 'inherit' }}>
                              {item.value > 0 ? '+' : ''}{item.value}
                            </span>
                          </div>
                        ))}
                        <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <span>{t('emailDetail.totalScore')}</span>
                          <span>{priorityExplanation.score}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/settings');
                        }}
                        style={{
                          width: '100%',
                          padding: theme.spacing.sm,
                          backgroundColor: theme.colors.primary.subtle,
                          color: theme.colors.primary.main,
                          border: 'none',
                          borderRadius: theme.borderRadius.sm,
                          cursor: 'pointer',
                          fontSize: theme.typography.fontSize.xs,
                          fontWeight: theme.typography.fontWeight.medium,
                        }}
                      >
                        ⚙️ {t('emailDetail.tweakRules')}
                      </button>
                    </div>
                  )}
                  
                  {/* Backdrop to close popup */}
                  {showPriorityExplanation && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPriorityExplanation(false);
                      }}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999,
                        cursor: 'default',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons: Reply, Archive, Snooze */}
            <div style={{
              marginBottom: theme.spacing.xl,
              display: 'flex',
              gap: theme.spacing.md,
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              {/* Reply buttons */}
              <button
                onClick={() => handleOpenReplyComposer('reply')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↩️</span>
                {t('emailDetail.reply')}
              </button>
              <button
                onClick={() => handleOpenReplyComposer('replyAll')}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.background.subtle,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↩️↩️</span>
                {t('emailDetail.replyAll')}
              </button>
              <button
                onClick={() => {
                  // TODO: Implement Forward
                  alert(t('emailDetail.forwardSoon'));
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.background.subtle,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↪️</span>
                {t('emailDetail.forward')}
              </button>
              
              <div style={{ width: '1px', height: '24px', backgroundColor: theme.colors.border.medium }} />
              
              {/* Snooze */}
              {showSnoozeInput ? (
                <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder={t('emailDetail.snoozePlaceholder')}
                    value={snoozeInput}
                    onChange={(e) => setSnoozeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSnooze();
                      if (e.key === 'Escape') {
                        setShowSnoozeInput(false);
                        setSnoozeInput('');
                      }
                    }}
                    autoFocus
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      border: `1px solid ${theme.colors.primary.main}`,
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.fontSize.sm,
                      width: '120px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSnooze}
                    disabled={!snoozeInput.trim()}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      cursor: snoozeInput.trim() ? 'pointer' : 'not-allowed',
                      fontSize: theme.typography.fontSize.sm,
                      opacity: snoozeInput.trim() ? 1 : 0.6,
                    }}
                  >
                    {t('emailDetail.snooze')}
                  </button>
                  <button
                    onClick={() => {
                      setShowSnoozeInput(false);
                      setSnoozeInput('');
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSnoozeInput(true)}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                    backgroundColor: 'transparent',
                    color: theme.colors.text.secondary,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontWeight: theme.typography.fontWeight.medium,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                  }}
                >
                  <span>📥</span>
                  {t('emailDetail.snooze')}
                </button>
              )}
              
              {/* Archive */}
              <button
                onClick={handleArchive}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>📦</span>
                {t('emailDetail.archive')}
              </button>
            </div>

            {/* Reply Composer - appears right after action buttons */}
            {showReplyComposer && (
              <div className="animate-fade-in" style={{
                marginTop: theme.spacing.lg,
                marginBottom: theme.spacing.xl,
                padding: theme.spacing.xl,
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.lg,
                border: `1px solid ${theme.colors.primary.light}`,
                boxShadow: theme.shadows.md,
              }}>
                {/* Header with close button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                    <span style={{ fontSize: '1.2rem' }}>✍️</span>
                    <strong style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.lg }}>
                      {replyMode === 'replyAll' ? t('emailDetail.replyAll') : t('emailDetail.reply')}
                    </strong>
                  </div>
                  <button
                    onClick={() => {
                      setShowReplyComposer(false);
                      setDraft('');
                      setReplyOptions(null);
                      setToneCheckResult(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.colors.text.secondary,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.lg,
                      padding: theme.spacing.xs,
                    }}
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                {/* Recipients field */}
                <div style={{ marginBottom: theme.spacing.md }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: theme.typography.fontSize.sm, 
                    color: theme.colors.text.secondary,
                    marginBottom: theme.spacing.xs,
                  }}>
                    To:
                  </label>
                  <input
                    type="text"
                    value={replyRecipients}
                    onChange={(e) => setReplyRecipients(e.target.value)}
                    style={{
                      width: '100%',
                      padding: theme.spacing.sm,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.sm,
                      outline: 'none',
                    }}
                    placeholder="recipient@example.com"
                  />
                </div>

                {/* Reply option tabs - cleaner layout */}
                {(loadingReplies || (replyOptions && replyOptions.length > 0)) && (
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <label style={{ 
                      display: 'block', 
                      fontSize: theme.typography.fontSize.sm, 
                      color: theme.colors.text.secondary,
                      marginBottom: theme.spacing.xs,
                    }}>
                      Suggested replies:
                    </label>
                    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                      {loadingReplies ? (
                        <span style={{ 
                          color: theme.colors.text.secondary, 
                          fontSize: theme.typography.fontSize.sm,
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          padding: theme.spacing.sm,
                        }}>
                          <span style={{
                            display: 'inline-block',
                            width: '12px',
                            height: '12px',
                            border: `2px solid ${theme.colors.primary.main}`,
                            borderTop: '2px solid transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                          }} />
                          Generating...
                        </span>
                      ) : replyOptions && replyOptions.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedReplyOption(idx);
                            setDraft(option.text);
                          }}
                          title={option.text.substring(0, 100) + '...'}
                          style={{
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            backgroundColor: selectedReplyOption === idx ? theme.colors.primary.main : theme.colors.background.subtle,
                            color: selectedReplyOption === idx ? 'white' : theme.colors.text.primary,
                            border: `1px solid ${selectedReplyOption === idx ? theme.colors.primary.main : theme.colors.border.light}`,
                            borderRadius: theme.borderRadius.md,
                            fontSize: theme.typography.fontSize.xs,
                            fontWeight: theme.typography.fontWeight.medium,
                            cursor: 'pointer',
                            transition: theme.transitions.fast,
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <textarea
                  value={draft || ''}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    // Switch to Custom tab when user types
                    if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
                      const customIdx = replyOptions.findIndex(o => o.label === 'Custom');
                      if (customIdx >= 0) setSelectedReplyOption(customIdx);
                    }
                  }}
                  placeholder={loadingReplies ? "Generating reply suggestions..." : "Type your reply here..."}
                  disabled={loadingReplies}
                  style={{
                    width: '100%',
                    minHeight: '200px',
                    padding: theme.spacing.lg,
                    border: `1px solid ${toneCheckResult && !toneCheckResult.isOk ? theme.colors.accent.error : theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.fontSize.base,
                    opacity: loadingReplies ? 0.6 : 1,
                    fontFamily: theme.typography.fontFamily,
                    lineHeight: theme.typography.lineHeight.relaxed,
                    backgroundColor: theme.colors.background.subtle,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />

                {/* Tone Check Result */}
                {toneCheckResult && !toneCheckResult.isOk && (
                  <div style={{
                    marginTop: theme.spacing.md,
                    padding: theme.spacing.md,
                    backgroundColor: '#FEF2F2',
                    border: `1px solid ${theme.colors.accent.error}`,
                    borderRadius: theme.borderRadius.md,
                  }}>
                    <div style={{ color: theme.colors.accent.error, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
                      ⚠️ {t('emailDetail.toneCheckIssues')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: theme.spacing.lg, color: theme.colors.text.primary }}>
                      {toneCheckResult.suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                    {toneCheckResult.revisedText && (
                      <div style={{ marginTop: theme.spacing.md }}>
                        <div style={{ fontWeight: 'bold', fontSize: theme.typography.fontSize.sm }}>{t('emailDetail.suggestedRevision')}</div>
                        <div style={{ 
                          padding: theme.spacing.sm, 
                          backgroundColor: 'white', 
                          border: '1px dashed #FCA5A5',
                          marginTop: theme.spacing.xs,
                          fontSize: theme.typography.fontSize.sm,
                        }}>
                          {toneCheckResult.revisedText}
                        </div>
                        <button
                          onClick={() => setDraft(toneCheckResult.revisedText || '')}
                          style={{
                            marginTop: theme.spacing.xs,
                            fontSize: theme.typography.fontSize.xs,
                            color: theme.colors.accent.error,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {t('emailDetail.useRevision')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {toneCheckResult && toneCheckResult.isOk && (
                  <div style={{
                    marginTop: theme.spacing.md,
                    padding: theme.spacing.sm,
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #10B981',
                    borderRadius: theme.borderRadius.md,
                    color: '#047857',
                    fontSize: theme.typography.fontSize.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                  }}>
                    <span>✅</span> {t('emailDetail.toneCheckPassed')}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.md, alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setShowReplyComposer(false);
                      setDraft('');
                      setReplyOptions(null);
                      setToneCheckResult(null);
                    }}
                    disabled={sending || checkingTone}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.medium,
                      cursor: (sending || checkingTone) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSendReply}
                    disabled={sending || checkingTone || !draft?.trim()}
                    style={{
                      padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
                      backgroundColor: (sending || checkingTone || !draft?.trim()) ? theme.colors.border.medium : theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.semibold,
                      cursor: (sending || checkingTone || !draft?.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (sending || checkingTone || !draft?.trim()) ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                    }}
                  >
                    {checkingTone ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          border: '2px solid white',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        Checking tone...
                      </>
                    ) : sending ? (
                      <>📤 {t('emailDetail.sending')}</>
                    ) : (
                      <>📤 {t('emailDetail.sendReply')}</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* AI Output Area - Always show, even when empty */}
            <div className="animate-fade-in" style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: theme.spacing.xl,
              borderRadius: theme.borderRadius.lg,
              marginBottom: theme.spacing.xl,
              borderLeft: `4px solid ${theme.colors.primary.main}`,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: summaryCollapsed ? 0 : theme.spacing.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                  <span>🤖</span>
                  <strong style={{ color: theme.colors.primary.dark }}>{t('emailDetail.aiSummary')}</strong>
                  <button
                    onClick={() => setSummaryCollapsed(!summaryCollapsed)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      padding: theme.spacing.xs,
                    }}
                    title={summaryCollapsed ? t('emailDetail.expandSummary') : t('emailDetail.collapseSummary')}
                  >
                    {summaryCollapsed ? '▶' : '▼'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                  <select
                    value={summaryType}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setShowRuleModal(true);
                      } else if (e.target.value.startsWith('custom-')) {
                        const ruleId = e.target.value.split('-')[1];
                        const rule = customRules.find(r => r.ruleId === ruleId);
                        if (rule) {
                          handleUseCustomRule(rule);
                        }
                      } else {
                        handleSummarize(e.target.value);
                      }
                    }}
                    disabled={isGeneratingSummary}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.sm,
                      backgroundColor: 'white',
                      cursor: isGeneratingSummary ? 'wait' : 'pointer',
                    }}
                  >
                    <option value="tldr">TL;DR</option>
                    <option value="bullet-points">Key Points</option>
                    <option value="action-items">Action Items</option>
                    <option value="sender-request">Sender Request</option>
                    {customRules.length > 0 && (
                      <>
                        <optgroup label="Custom Rules">
                          {customRules.map((rule) => (
                            <option key={rule.ruleId} value={`custom-${rule.ruleId}`}>
                              {rule.whenToUse}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    )}
                    <option value="custom">{t('emailDetail.createCustomRule')}...</option>
                  </select>
                  {isGeneratingSummary && (
                    <span style={{
                      display: 'inline-block',
                      width: '16px',
                      height: '16px',
                      border: `2px solid ${theme.colors.primary.main}`,
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                  )}
                </div>
              </div>
              {!summaryCollapsed && (
                <>
              {(isGeneratingSummary || email?.isProcessingSummary) ? (
                <div style={{
                  padding: theme.spacing.xl,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '24px',
                    height: '24px',
                    border: `3px solid ${theme.colors.primary.main}`,
                    borderTop: '3px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: theme.spacing.md,
                  }} />
                  <div>✨ {t('emailDetail.generatingSummary')}</div>
                </div>
              ) : summary ? (
                <div style={{ whiteSpace: 'pre-wrap', color: theme.colors.text.primary, lineHeight: theme.typography.lineHeight.relaxed }}>
                  {summary}
                </div>
              ) : (
                <div style={{
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                  fontStyle: 'italic',
                }}>
                  📝 {t('emailDetail.noSummary')}
                </div>
              )}
                </>
              )}
            </div>

            {/* Threaded Email View */}
            {threadEmails.length > 0 ? (
              <div style={{ marginBottom: theme.spacing.xl }}>
                <h3 style={{
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.primary,
                  marginBottom: theme.spacing.lg,
                }}>
                  💬 {t('emailDetail.thread')} ({threadEmails.length} {threadEmails.length === 1 ? t('emailDetail.message') : t('emailDetail.messages')})
                </h3>
                {threadEmails.map((threadEmail, index) => {
                  const isExpanded = expandedThreadItems.has(threadEmail.id);
                  const isCurrentEmail = threadEmail.id === email.id;
                  const cleanBody = extractCleanBody(threadEmail.body, (threadEmail as any).htmlBody);
                  const cleanHtmlBody = (threadEmail as any).htmlBody ? removeSignature((threadEmail as any).htmlBody, true) : null;
                  
                  return (
                    <div
                      key={threadEmail.id}
                      style={{
                        marginBottom: theme.spacing.lg,
                        border: isCurrentEmail ? `2px solid ${theme.colors.primary.main}` : `1px solid ${theme.colors.border.light}`,
                        borderRadius: theme.borderRadius.lg,
                        overflow: 'hidden',
                        backgroundColor: isCurrentEmail ? theme.colors.primary.subtle : theme.colors.background.paper,
                      }}
                    >
                      {/* Email Header (always visible) */}
                      <div
                        onClick={() => toggleThreadItem(threadEmail.id)}
                        style={{
                          padding: theme.spacing.md,
                          cursor: 'pointer',
                          backgroundColor: isCurrentEmail ? theme.colors.primary.light : theme.colors.background.subtle,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontWeight: theme.typography.fontWeight.semibold,
                            color: theme.colors.text.primary,
                            marginBottom: theme.spacing.xs,
                          }}>
                            {threadEmail.fromName || threadEmail.from}
                          </div>
                          <div 
                            style={{
                              fontSize: theme.typography.fontSize.sm,
                              color: theme.colors.text.primary, // Better contrast
                              opacity: 0.8,
                            }}
                            title={new Date(threadEmail.receivedAt).toLocaleString(undefined, {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              timeZoneName: 'short',
                            })}
                          >
                            {humanizeTimestamp(threadEmail.receivedAt)}
                          </div>
                        </div>
                        <div style={{
                          fontSize: theme.typography.fontSize.sm,
                          color: theme.colors.text.secondary,
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: theme.colors.background.paper,
                          borderRadius: theme.borderRadius.md,
                        }}>
                          {isExpanded ? '▼' : '▶'}
                        </div>
                      </div>
                      
                      {/* Email Body (expandable) */}
                      {isExpanded ? (
                        <div style={{
                          padding: theme.spacing.lg,
                          color: theme.colors.text.primary,
                          lineHeight: '1.8',
                          fontSize: theme.typography.fontSize.lg,
                          fontWeight: theme.typography.fontWeight.normal,
                        }}>
                          {cleanHtmlBody || (threadEmail as any).htmlBody ? (
                            <div 
                              style={{
                                maxWidth: '100%',
                                overflow: 'auto',
                                isolation: 'isolate',
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(
                                  (cleanHtmlBody || (threadEmail as any).htmlBody).replace(/<style([^>]*)>/gi, '<style$1 scoped>'),
                                  {
                                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'img', 'table', 'tr', 'td', 'th', 'style'],
                                    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped'],
                                    ALLOW_DATA_ATTR: false,
                                  }
                                )
                              }} 
                            />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                              {cleanBody || threadEmail.body}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          padding: theme.spacing.md,
                          color: theme.colors.text.secondary,
                          fontSize: theme.typography.fontSize.base,
                          fontStyle: 'italic',
                          lineHeight: '1.6',
                        }}>
                          {cleanBody.substring(0, 100)}...
                          {cleanBody.length > 100 && (
                            <span style={{ color: theme.colors.primary.main }}> ({t('emailDetail.clickToExpand')})</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single Email View (fallback if thread not loaded) */
              <div style={{
                color: theme.colors.text.primary,
                lineHeight: '1.8',
                fontSize: theme.typography.fontSize.lg,
                marginBottom: theme.spacing.xl,
              }}>
                {email.htmlBody ? (
                  <div 
                    style={{
                      // Scope CSS to prevent conflicts
                      maxWidth: '100%',
                      overflow: 'auto',
                      // Prevent CSS from affecting the page
                      isolation: 'isolate',
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(
                        removeSignature(email.htmlBody, true).replace(/<style([^>]*)>/gi, '<style$1 scoped>'),
                        {
                          // Allow style tags but scope them
                          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'img', 'table', 'tr', 'td', 'th', 'style'],
                          ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped'],
                          // Keep relative URLs safe
                          ALLOW_DATA_ATTR: false,
                        }
                      )
                    }} 
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {extractCleanBody(email.body) || email.body}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Rule Modal */}
      {showRuleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing['2xl'],
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            maxWidth: '600px',
            width: '90%',
          }}>
            <h2 style={{
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.primary,
            }}>
              {t('emailDetail.createCustomRule')}
            </h2>
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{
                display: 'block',
                marginBottom: theme.spacing.xs,
                color: theme.colors.text.primary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                {t('emailDetail.whenToUseLabel')}
              </label>
              <textarea
                value={customRule.whenToUse}
                onChange={(e) => setCustomRule({ ...customRule, whenToUse: e.target.value })}
                placeholder={t('emailDetail.whenToUsePlaceholder')}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily,
                }}
              />
            </div>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <label style={{
                display: 'block',
                marginBottom: theme.spacing.xs,
                color: theme.colors.text.primary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                {t('emailDetail.howToSummarizeLabel')}
              </label>
              <textarea
                value={customRule.howToSummarize}
                onChange={(e) => setCustomRule({ ...customRule, howToSummarize: e.target.value })}
                placeholder={t('emailDetail.howToSummarizePlaceholder')}
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setCustomRule({ whenToUse: '', howToSummarize: '' });
                }}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  await handleCreateCustomRule();
                }}
                disabled={!customRule.whenToUse || !customRule.howToSummarize}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: customRule.whenToUse && customRule.howToSummarize ? theme.colors.primary.main : theme.colors.border.dark,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: customRule.whenToUse && customRule.howToSummarize ? 'pointer' : 'not-allowed',
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {t('emailDetail.createAndUse')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailDetail;
