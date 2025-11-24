import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface PriorityRule {
  ruleId: number;
  ruleType: string;
  conditionKey: string;
  conditionVal: string;
  priorityBoost: number;
}

interface UserContext {
  contextId: number;
  contextKey: string;
  contextValue: string;
  source: string;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [priorityRules, setPriorityRules] = useState<PriorityRule[]>([]);
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [batchHours, setBatchHours] = useState(6);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      console.error('Error updating batch hours:', error);
    }
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
          {priorityRules.length === 0 ? (
            <div style={{ color: theme.colors.text.secondary }}>
              No priority rules configured
            </div>
          ) : (
            <div>
              {priorityRules.map((rule) => (
                <div
                  key={rule.ruleId}
                  style={{
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.light}`,
                    borderRadius: theme.borderRadius.md,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  <div style={{ color: theme.colors.text.primary }}>
                    <strong>{rule.ruleType}</strong>: {rule.conditionKey} = {rule.conditionVal}
                  </div>
                  <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                    Priority boost: {rule.priorityBoost > 0 ? '+' : ''}{rule.priorityBoost}
                  </div>
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

