import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';

import { MCPServerManager } from './MCPServerManager';
import {
  MCPServerConfig,
  MCPServerPurpose,
  WorkflowExecutionLog,
  WorkflowRule,
  WorkflowRuleFormValues,
} from './types';
import { WorkflowEditor } from './WorkflowEditor';
import { WorkflowExecutionHistory } from './WorkflowExecutionHistory';
import { WorkflowsList } from './WorkflowsList';

/**
 * Main settings section for automated email workflows.
 * Placed between Auto-Responder and Integrations in the settings page.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
export const WorkflowsSection: React.FC = () => {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [mcpServers, setMCPServers] = useState<MCPServerConfig[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMCP, setShowMCP] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, serversRes] = await Promise.all([
        axios.get<WorkflowRule[]>(`${API_URL}/workflows`),
        axios.get<MCPServerConfig[]>(`${API_URL}/mcp-servers`),
      ]);
      setRules(rulesRes.data);
      setMCPServers(serversRes.data);
    } catch {
      setError('Failed to load workflows. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadExecutions = useCallback(async () => {
    try {
      const res = await axios.get<WorkflowExecutionLog[]>(`${API_URL}/workflows/executions/all`);
      setExecutions(res.data);
    } catch {
      // non-fatal: execution history is best-effort
    }
  }, []);

  useEffect(() => {
    if (showHistory) {
      void loadExecutions();
    }
  }, [showHistory, loadExecutions]);

  // ── Workflow CRUD ─────────────────────────────────────────────────────────────

  const handleSave = async (values: WorkflowRuleFormValues) => {
    if (editingRule) {
      await axios.put(`${API_URL}/workflows/${editingRule.id}`, values);
    } else {
      await axios.post(`${API_URL}/workflows`, values);
    }
    setEditorOpen(false);
    setEditingRule(null);
    await loadData();
  };

  const handleToggle = async (id: string) => {
    try {
      await axios.patch(`${API_URL}/workflows/${id}/toggle`);
      await loadData();
    } catch {
      setError('Failed to toggle workflow. Please try again.');
    }
  };

  const handleEdit = (rule: WorkflowRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this workflow rule?')) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/workflows/${id}`);
      await loadData();
    } catch {
      setError('Failed to delete workflow. Please try again.');
    }
  };

  const handleAddNew = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  // ── MCP server management ─────────────────────────────────────────────────────

  const handleAddMCPServer = async (
    name: string,
    serverUrl: string,
    apiKey: string | undefined,
    purpose: MCPServerPurpose
  ) => {
    await axios.post(`${API_URL}/mcp-servers`, { name, serverUrl, apiKey, purpose });
    await loadData();
  };

  const handleRemoveMCPServer = async (id: string) => {
    await axios.delete(`${API_URL}/mcp-servers/${id}`);
    await loadData();
  };

  const handleRefreshMCPServer = async (id: string) => {
    try {
      await axios.post(`${API_URL}/mcp-servers/${id}/refresh`);
      await loadData();
    } catch {
      setError('Failed to refresh MCP server tools. Please try again.');
    }
  };

  const handleTestMCPServer = async (id: string) => {
    const res = await axios.post<{ ok: boolean; toolCount: number }>(`${API_URL}/mcp-servers/${id}/test`);
    return res.data;
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      id="workflows"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: theme.spacing.lg,
        }}
      >
        <div>
          <h2 style={{ ...theme.typography.heading.h2, margin: 0 }}>Workflows</h2>
          <p style={{ ...theme.typography.body.medium, color: theme.colors.text.secondary, marginTop: 4 }}>
            Automate actions when matching emails arrive — create Focus Bear tasks, send replies, call webhooks, and
            more.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddNew}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: theme.colors.primary.main,
            color: theme.colors.background.paper,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          + Add Workflow
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            background: theme.colors.error.light,
            borderRadius: 6,
            color: theme.colors.error.dark,
            fontSize: 13,
            marginBottom: theme.spacing.md,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: theme.colors.text.secondary }}>Loading workflows…</p>
      ) : (
        <WorkflowsList rules={rules} onToggle={handleToggle} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      {/* MCP Servers */}
      <div style={{ marginTop: theme.spacing.xl }}>
        <button
          type="button"
          onClick={() => setShowMCP(!showMCP)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.text.primary,
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {showMCP ? '▲' : '▼'} MCP Server Connections
          {mcpServers.length > 0 && (
            <span style={{ fontSize: 12, color: theme.colors.text.secondary, fontWeight: 400 }}>
              ({mcpServers.length} server{mcpServers.length !== 1 ? 's' : ''} connected)
            </span>
          )}
        </button>
        {showMCP && (
          <div style={{ marginTop: theme.spacing.md }}>
            <MCPServerManager
              servers={mcpServers}
              onAdd={handleAddMCPServer}
              onRemove={handleRemoveMCPServer}
              onRefresh={handleRefreshMCPServer}
              onTest={handleTestMCPServer}
            />
          </div>
        )}
      </div>

      {/* Execution history */}
      <div style={{ marginTop: theme.spacing.lg }}>
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.text.primary,
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
          }}
        >
          {showHistory ? '▲' : '▼'} Recent Execution History
        </button>
        {showHistory && (
          <div style={{ marginTop: theme.spacing.md }}>
            <WorkflowExecutionHistory logs={executions} loading={loading} />
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editorOpen && (
        <WorkflowEditor
          rule={editingRule}
          mcpServers={mcpServers}
          onSave={handleSave}
          onCancel={() => {
            setEditorOpen(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
};
