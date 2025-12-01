import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface PriorityRule {
  ruleId: string;
  ruleType: string;
  conditionKey: string;
  conditionVal: string;
  priorityBoost: number;
  createdAt?: string;
}

interface UserContext {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source: string;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [priorityRules, setPriorityRules] = useState<PriorityRule[]>([]);
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [batchHours, setBatchHours] = useState(6);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editRuleBoost, setEditRuleBoost] = useState<number>(0);
  const [editRuleDescription, setEditRuleDescription] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rulesRes, contextRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/priority/rules`),
        axios.get(`${API_URL}/context`),
        axios.get(`${API_URL}/users/me`),
      ]);
      setPriorityRules(rulesRes.data);
      setContexts(contextRes.data);
      if (userRes.data.batchDeliveryHours) {
        setBatchHours(userRes.data.batchDeliveryHours);
      }
      // Note: API key is encrypted and not returned from the server for security
      // User must enter it fresh if they want to update it
      setOpenAiApiKey('');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeContext = async () => {
    try {
      await axios.post(`${API_URL}/context/analyze`);
      fetchData();
    } catch (error) {
      console.error('Error analyzing context:', error);
    }
  };

  const handleUpdateBatchHours = async () => {
    try {
      await axios.put(`${API_URL}/users/me`, { batchDeliveryHours: batchHours });
      alert('Batch hours updated successfully');
    } catch (error) {
      console.error('Error updating batch hours:', error);
      alert('Failed to update batch hours');
    }
  };

  const handleSaveApiKey = async () => {
    if (!openAiApiKey.trim()) {
      alert('Please enter an OpenAI API key');
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: openAiApiKey.trim() });
      setApiKeySaved(true);
      setOpenAiApiKey('');
      setTimeout(() => setApiKeySaved(false), 3000);
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key');
    }
  };

  const handleRemoveApiKey = async () => {
    if (!window.confirm('Are you sure you want to remove your OpenAI API key? You will use the system default key.')) {
      return;
    }

    try {
      await axios.put(`${API_URL}/users/me`, { openAiApiKey: null });
      setOpenAiApiKey('');
      setShowApiKey(false);
      alert('API key removed successfully');
    } catch (error) {
      console.error('Error removing API key:', error);
      alert('Failed to remove API key');
    }
  };

  const handleEditRule = (rule: PriorityRule) => {
    setEditingRule(rule.ruleId);
    setEditRuleBoost(rule.priorityBoost);
    setEditRuleDescription(rule.conditionVal || '');
  };

  const handleSaveRule = async (ruleId: string) => {
    try {
      await axios.put(`${API_URL}/priority/rules/${ruleId}`, {
        priorityBoost: editRuleBoost,
        conditionVal: editRuleDescription,
      });
      setEditingRule(null);
      await fetchData();
    } catch (error) {
      console.error('Error updating rule:', error);
      alert('Failed to update rule');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete this priority rule?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/priority/rules/${ruleId}`);
      await fetchData();
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Failed to delete rule');
    }
  };

  const formatRuleDescription = (rule: PriorityRule): string => {
    if (rule.conditionKey === 'naturalLanguage') {
      return rule.conditionVal;
    }
    
    if (rule.conditionKey === 'from') {
      return `Emails from ${rule.conditionVal}`;
    }
    
    if (rule.conditionKey === 'subject') {
      return `Emails with subject containing "${rule.conditionVal}"`;
    }
    
    return `${rule.conditionKey}: ${rule.conditionVal}`;
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
    }}>
      <div style={{
        width: '250px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.lg,
      }}>
        <button
          onClick={() => navigate('/inbox')}
          style={{
            width: '100%',
            padding: theme.spacing.md,
            marginBottom: theme.spacing.md,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
          }}
        >
          ← Back to Inbox
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl }}>
        <h1 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xl,
          fontSize: theme.typography.fontSize['3xl'],
        }}>
          Settings
        </h1>

        {/* OpenAI API Key */}
        <div style={{
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
          }}>
            OpenAI API Key (Optional)
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Use your own OpenAI API key for AI features. If not provided, the system default key will be used. Your key is encrypted and stored securely.
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
                {showApiKey ? 'Hide' : 'Show'}
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
                {apiKeySaved ? '✓ Saved' : 'Save API Key'}
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
                Remove Key
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
                Get API Key →
              </a>
            </div>
          </div>
        </div>

        {/* Batch Delivery Settings */}
        <div style={{
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
          }}>
            Email Batching
          </h2>
          <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
            <label style={{ color: theme.colors.text.primary }}>
              Hide non-urgent emails for (hours):
            </label>
            <input
              type="number"
              value={batchHours}
              onChange={(e) => setBatchHours(parseInt(e.target.value))}
              style={{
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                width: '100px',
              }}
            />
            <button
              onClick={handleUpdateBatchHours}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Priority Rules */}
        <div style={{
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
          }}>
            Prioritization Rules
          </h2>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.sm,
          }}>
            These rules help prioritize your emails. Rules are automatically created based on your behavior (starring emails) or you can create them manually.
          </p>
          {priorityRules.length === 0 ? (
            <div style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
              border: `2px dashed ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
            }}>
              No priority rules yet. Star emails to help the system learn your priorities!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              {priorityRules.map((rule) => (
                <div
                  key={rule.ruleId}
                  style={{
                    padding: theme.spacing.lg,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    backgroundColor: theme.colors.background.default,
                  }}
                >
                  {editingRule === rule.ruleId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                      <div>
                        <label style={{ color: theme.colors.text.primary, display: 'block', marginBottom: theme.spacing.xs }}>
                          Rule Description:
                        </label>
                        <textarea
                          value={editRuleDescription}
                          onChange={(e) => setEditRuleDescription(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            padding: theme.spacing.sm,
                            border: `1px solid ${theme.colors.border.medium}`,
                            borderRadius: theme.borderRadius.md,
                            fontFamily: theme.typography.fontFamily,
                            fontSize: theme.typography.fontSize.sm,
                            resize: 'vertical',
                          }}
                          placeholder="Describe when this rule applies..."
                        />
                      </div>
                      <div>
                        <label style={{ color: theme.colors.text.primary, display: 'block', marginBottom: theme.spacing.xs }}>
                          Priority Boost: {editRuleBoost > 0 ? '+' : ''}{editRuleBoost}
                        </label>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          value={editRuleBoost}
                          onChange={(e) => setEditRuleBoost(parseInt(e.target.value))}
                          style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                          <span>Low Priority (-30)</span>
                          <span>High Priority (+30)</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                        <button
                          onClick={() => handleSaveRule(rule.ruleId)}
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
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
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
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: theme.spacing.sm,
                            marginBottom: theme.spacing.xs,
                          }}>
                            <div style={{
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              backgroundColor: rule.ruleType === 'IMPLICIT_BEHAVIOR' 
                                ? theme.colors.secondary.main 
                                : theme.colors.primary.main,
                              color: 'white',
                              borderRadius: theme.borderRadius.sm,
                              fontSize: theme.typography.fontSize.xs,
                              fontWeight: theme.typography.fontWeight.medium,
                            }}>
                              {rule.ruleType === 'IMPLICIT_BEHAVIOR' ? 'AI Learned' : 'Manual'}
                            </div>
                            <div style={{
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              backgroundColor: rule.priorityBoost > 0 
                                ? 'rgba(34, 197, 94, 0.1)' 
                                : rule.priorityBoost < 0 
                                ? 'rgba(239, 68, 68, 0.1)' 
                                : 'rgba(107, 114, 128, 0.1)',
                              color: rule.priorityBoost > 0 
                                ? '#22c55e' 
                                : rule.priorityBoost < 0 
                                ? '#ef4444' 
                                : '#6b7280',
                              borderRadius: theme.borderRadius.sm,
                              fontSize: theme.typography.fontSize.xs,
                              fontWeight: theme.typography.fontWeight.semibold,
                            }}>
                              {rule.priorityBoost > 0 ? '+' : ''}{rule.priorityBoost} Priority
                            </div>
                          </div>
                          <div style={{
                            color: theme.colors.text.primary,
                            fontSize: theme.typography.fontSize.base,
                            fontWeight: theme.typography.fontWeight.medium,
                            marginBottom: theme.spacing.xs,
                          }}>
                            {formatRuleDescription(rule)}
                          </div>
                          {rule.createdAt && (
                            <div style={{
                              color: theme.colors.text.tertiary,
                              fontSize: theme.typography.fontSize.xs,
                            }}>
                              Created {new Date(rule.createdAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                          <button
                            onClick={() => handleEditRule(rule)}
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
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.ruleId)}
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
                            Delete
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

        {/* User Context */}
        <div style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.md,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <h2 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.xl,
            }}>
              Learned Context
            </h2>
            <button
              onClick={handleAnalyzeContext}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.secondary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
              }}
            >
              Analyze Emails
            </button>
          </div>
          {contexts.length === 0 ? (
            <div style={{ color: theme.colors.text.secondary }}>
              No context learned yet. Click "Analyze Emails" to learn from your email history.
            </div>
          ) : (
            <div>
              {contexts.map((context) => (
                <div
                  key={context.contextId}
                  style={{
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.light}`,
                    borderRadius: theme.borderRadius.md,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  <div style={{ color: theme.colors.text.primary }}>
                    <strong>{context.contextKey}</strong>: {context.contextValue}
                  </div>
                  <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                    Source: {context.source}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;

