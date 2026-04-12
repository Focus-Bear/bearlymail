# Plan: Automated Email Workflows (#1483)

> **Status:** Planning  
> **Author:** Monk of Modularity (AI agent)  
> **Issue:** #1483 — New feature: automated workflows  
> **Created:** 2026-03-25

## Summary

Let users define natural-language **workflow rules** that trigger automatically when matching emails arrive. Each rule has a **condition** (email matching criteria) and one or more **actions** (MCP tool calls, auto-replies, Focus Bear task creation, etc.). The AI fills in template variables from email context at execution time.

**Example workflow:**

> **Condition:** Upwork billing summary email arrives  
> **Action:** Create a Focus Bear task — title: "Update Xero reconciliation for Upwork {date}", description filled intelligently by AI with category breakdowns and AUD conversion.

---

## 1. Data Model

### 1.1 `workflow_rule` Entity

```typescript
@Entity("workflow_rules")
export class WorkflowRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "text", transformer: encryptedColumnTransformer })
  name: string; // User-facing label, e.g. "Upwork → Focus Bear task"

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @Column({ type: "int", default: 0 })
  priority: number; // Lower = higher priority; first match wins

  // ── Condition ───────────────────────────────────────────────
  @Column({ type: "jsonb" })
  condition: WorkflowCondition;

  // ── Actions (ordered) ──────────────────────────────────────
  @Column({ type: "jsonb" })
  actions: WorkflowAction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 1.2 Condition Shape

```typescript
interface WorkflowCondition {
  /** Reuses existing pattern-matcher from summarization rules.
   *  Glob, regex, or substring. Empty array = match any. */
  fromPatterns: string[];
  subjectPatterns: string[];

  /** Optional: match on category assigned by the triage pipeline */
  categories?: string[];

  /** Optional: match on priority range (e.g. "high", "medium") */
  priorityLevels?: ("veryHigh" | "high" | "medium" | "low" | "veryLow")[];

  /** Natural-language condition evaluated by LLM when deterministic
   *  patterns are insufficient (e.g. "billing summary with line items").
   *  null = skip LLM check. */
  naturalLanguageCondition?: string | null;
}
```

**Design rationale:** Deterministic pattern matching (reusing `matchAny` from `server/src/summarization/pattern-matcher.ts`) runs first for speed and predictability. The optional `naturalLanguageCondition` is a second-pass LLM call only when patterns match, keeping token cost low.

### 1.3 Action Shape

```typescript
type WorkflowAction =
  | WorkflowActionReply
  | WorkflowActionMCPTool
  | WorkflowActionWebhook;

interface WorkflowActionBase {
  type: string;
  /** User-facing label */
  label?: string;
}

interface WorkflowActionReply extends WorkflowActionBase {
  type: "reply";
  /** Handlebars-style template. Variables: {{subject}}, {{from}}, {{date}}, {{summary}}, {{ai:...}} */
  templateBody: string;
}

interface WorkflowActionMCPTool extends WorkflowActionBase {
  type: "mcp_tool";
  /** MCP server identifier (e.g. "focus-bear", "xero") */
  serverId: string;
  /** Tool name as registered in MCP (e.g. "create-task") */
  toolName: string;
  /** Parameter template — values can include {{variable}} placeholders
   *  and {{ai:instruction}} for AI-generated content */
  parameters: Record<string, string>;
}

interface WorkflowActionWebhook extends WorkflowActionBase {
  type: "webhook";
  url: string;
  method: "POST" | "PUT";
  headers?: Record<string, string>;
  bodyTemplate: string; // JSON template with {{variables}}
}
```

### 1.4 `workflow_execution_log` Entity

```typescript
@Entity("workflow_execution_logs")
export class WorkflowExecutionLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  workflowRuleId: string;

  @Column()
  userId: string;

  @Column()
  emailThreadId: string;

  @Column({ type: "varchar", length: 20 })
  status: "pending" | "running" | "success" | "partial_failure" | "failed";

  @Column({ type: "jsonb", nullable: true })
  actionResults: Array<{
    actionIndex: number;
    status: "success" | "failed" | "skipped";
    output?: unknown;
    error?: string;
    durationMs: number;
  }>;

  @Column({ type: "jsonb", nullable: true })
  resolvedVariables: Record<string, string>; // For debugging/audit

  @CreateDateColumn()
  executedAt: Date;
}
```

### 1.5 Migration

Single migration adds `workflow_rules` and `workflow_execution_logs` tables. No changes to existing tables — workflows are a parallel system to the auto-responder, not a modification of it.

---

## 2. Email Processing Pipeline Integration

### 2.1 Current Flow (simplified)

```
Gmail/O365 sync → saveEmail → queuePostSaveJobs()
  ├─ GENERATE_SUMMARY job
  ├─ REFINE_PRIORITY (via batch buffer)
  ├─ AUTO_RESPONDER job
  ├─ FETCH_GITHUB_METADATA job
  └─ GENERATE_SUGGESTED_REPLIES (if starred)
```

### 2.2 Where Workflows Hook In

Workflows evaluate **after triage is complete** (summary + priority + category assigned), similar to `AUTO_RESPONDER`. A new PgBoss job `EVALUATE_WORKFLOWS` is queued from `queueThreadLevelJobs()` in `EmailLifecycleService`:

```
queueThreadLevelJobs()
  ├─ existing: FETCH_GITHUB_METADATA
  ├─ existing: AUTO_RESPONDER
  └─ NEW: EVALUATE_WORKFLOWS   ← depends on summary + priority being done
```

**Important:** `EVALUATE_WORKFLOWS` must wait for summary/priority to be available. Two approaches:

1. **Delayed start (MVP):** Queue with `startAfter: 60` seconds, then verify summary exists before running. If not ready, re-queue with backoff (max 3 retries). Simple, uses existing PgBoss patterns.
2. **Event-driven (future):** Emit a `triage.complete` event after summary + priority are both done. Workflows subscribe to this event. Cleaner but requires adding an event bus.

**MVP recommendation:** Option 1 (delayed start). It matches the existing auto-responder pattern and doesn't require new infrastructure.

### 2.3 Evaluation Flow

```
EVALUATE_WORKFLOWS job received
  │
  ├─ Load thread + latest email (decrypted from, subject, body, summary)
  ├─ Load thread's category + priority
  ├─ Load user's enabled workflow rules (sorted by priority)
  │
  ├─ For each rule:
  │   ├─ Check deterministic conditions (fromPatterns, subjectPatterns, categories, priorityLevels)
  │   │   └─ Uses existing matchAny() from pattern-matcher.ts
  │   ├─ If deterministic match AND naturalLanguageCondition exists:
  │   │   └─ LLM call to verify (new operation: LLM_OP_EVALUATE_WORKFLOW_CONDITION)
  │   ├─ If match confirmed:
  │   │   ├─ Resolve template variables (§3)
  │   │   ├─ Execute actions sequentially (§4)
  │   │   ├─ Log execution to workflow_execution_logs
  │   │   └─ STOP (first-match-wins) or continue (configurable per rule)
  │   └─ If no match: next rule
  │
  └─ Done
```

### 2.4 Singleton / Dedup

Use PgBoss `singletonKey: workflow-eval-${emailThreadId}` to prevent duplicate evaluations when multiple emails arrive in rapid succession for the same thread. Only the latest email in the thread triggers evaluation.

---

## 3. Template Variable Resolution

### 3.1 Built-in Variables

| Variable          | Source                         | Example                                    |
| ----------------- | ------------------------------ | ------------------------------------------ |
| `{{from}}`        | Email `from` field             | `billing@upwork.com`                       |
| `{{fromName}}`    | Email `fromName` field         | `Upwork`                                   |
| `{{subject}}`     | Email `subject`                | `Your Weekly Billing Summary`              |
| `{{date}}`        | Email received date (ISO)      | `2026-03-25`                               |
| `{{date:format}}` | Formatted date (dayjs)         | `{{date:MMMM D, YYYY}}` → `March 25, 2026` |
| `{{summary}}`     | LLM-generated email summary    | `Upwork billing for the week of...`        |
| `{{body}}`        | Cleaned email body (truncated) | First 2000 chars of cleaned body           |
| `{{category}}`    | Assigned email category        | `Billing`                                  |
| `{{priority}}`    | Priority level                 | `high`                                     |
| `{{threadId}}`    | Email thread ID                | `uuid`                                     |

### 3.2 AI-Generated Variables (`{{ai:...}}`)

For dynamic content that requires intelligence:

```
{{ai:Summarise spending per category of freelancer (frontend, mobile app). Calculate totals in AUD using current USD→AUD rate.}}
```

**Resolution process:**

1. Extract all `{{ai:...}}` placeholders from action parameters
2. Build a single LLM prompt that includes:
   - The email body/summary as context
   - Each AI instruction as a numbered task
   - Request structured JSON output: `{ "1": "result", "2": "result" }`
3. New LLM operation: `LLM_OP_RESOLVE_WORKFLOW_VARIABLES`
4. Parse response, substitute into templates
5. If any AI variable fails to resolve → log warning, use fallback text `[AI could not resolve: <instruction>]`

**Token budget:** Cap email body context at 4000 tokens. AI instructions typically small. Total per workflow execution: ~5-8K tokens (Sonnet-class model sufficient).

### 3.3 Variable Resolution Service

```typescript
@Injectable()
export class WorkflowVariableResolver {
  constructor(private llmCoreService: LLMCoreService) {}

  async resolve(
    template: Record<string, string>,
    context: WorkflowContext,
  ): Promise<Record<string, string>> {
    // 1. Substitute built-in variables
    // 2. Collect {{ai:...}} placeholders
    // 3. If any AI placeholders, make single LLM call
    // 4. Return fully-resolved template
  }
}
```

---

## 4. MCP Tool Invocation

### 4.1 Current State

BearlyMail has **no existing MCP integration**. There are no MCP-related files in the codebase. This is new infrastructure.

### 4.2 MCP Client Architecture

```
WorkflowExecutionService
  └─ MCPClientManager (new)
       ├─ Manages connections to user-configured MCP servers
       ├─ Discovers available tools per server
       ├─ Invokes tools with resolved parameters
       └─ Handles auth (API keys stored encrypted per-user)
```

**Key design decisions:**

1. **Server-side MCP client:** MCP tools are called from the backend (not the browser). This enables async execution from PgBoss jobs without requiring the user's browser to be open.

2. **MCP server registry:** New entity `mcp_server_config`:

```typescript
@Entity("mcp_server_configs")
export class MCPServerConfig {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ type: "text", transformer: encryptedColumnTransformer })
  name: string; // "Focus Bear", "Xero", etc.

  @Column({ type: "text", transformer: encryptedColumnTransformer })
  serverUrl: string; // MCP server endpoint

  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  apiKey: string | null; // Encrypted auth credential

  @Column({ type: "jsonb", nullable: true })
  cachedTools: Array<{
    name: string;
    description: string;
    inputSchema: object;
  }>;

  @Column({ type: "timestamp", nullable: true })
  toolsCachedAt: Date;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

3. **Tool discovery:** On connect/refresh, fetch tool list from MCP server's `tools/list` endpoint. Cache in `cachedTools` column. UI shows available tools when configuring workflow actions.

4. **Execution:** Use the MCP SDK (`@modelcontextprotocol/sdk`) to call `tools/call` with resolved parameters. Timeout per tool call: 30 seconds. Retry: 1 attempt for transient failures.

### 4.3 Focus Bear Integration (Primary Use Case)

Focus Bear exposes an MCP server at `https://api.focusbear.io/mcp`. Available tools include `create-task`. The workflow action for the Upwork example:

```json
{
  "type": "mcp_tool",
  "serverId": "<focus-bear-config-id>",
  "toolName": "create-task",
  "parameters": {
    "title": "Update Xero reconciliation for Upwork {{date:MMMM YYYY}}",
    "description": "{{ai:Summarise the spending per category of freelancer (frontend, mobile app). Calculate totals per category in AUD using the current USD to AUD exchange rate (Upwork uses USD).}}"
  }
}
```

---

## 5. Workflow Execution Service

### 5.1 Core Service

```typescript
@Injectable()
export class WorkflowExecutionService {
  constructor(
    private variableResolver: WorkflowVariableResolver,
    private mcpClientManager: MCPClientManager,
    private emailProviderManager: EmailProviderManager,
    // ...repos
  ) {}

  async executeWorkflow(
    rule: WorkflowRule,
    context: WorkflowContext,
  ): Promise<WorkflowExecutionResult> {
    const log = new WorkflowExecutionLog();
    log.status = "running";

    for (const [i, action] of rule.actions.entries()) {
      try {
        const result = await this.executeAction(action, context);
        log.actionResults.push({
          actionIndex: i,
          status: "success",
          ...result,
        });
      } catch (error) {
        log.actionResults.push({
          actionIndex: i,
          status: "failed",
          error: error.message,
        });
        // Continue with remaining actions (partial failure is OK)
      }
    }

    log.status = log.actionResults.every((r) => r.status === "success")
      ? "success"
      : "partial_failure";
    return log;
  }

  private async executeAction(action: WorkflowAction, ctx: WorkflowContext) {
    switch (action.type) {
      case "reply":
        return this.executeReply(action, ctx);
      case "mcp_tool":
        return this.executeMCPTool(action, ctx);
      case "webhook":
        return this.executeWebhook(action, ctx);
    }
  }
}
```

### 5.2 PgBoss Processor

```typescript
// New job name: EVALUATE_WORKFLOWS
// worker in WorkflowProcessor (similar to AutoResponderProcessor)
@Injectable()
export class WorkflowProcessor implements OnModuleInit {
  async onModuleInit() {
    await this.boss.work(
      JOB_NAMES.EVALUATE_WORKFLOWS,
      { teamConcurrency: 5 },
      async (job) => {
        const { userId, emailThreadId } = job.data;
        // Load rules, evaluate conditions, execute matching workflow
      },
    );
  }
}
```

---

## 6. UI: Create & Manage Workflows

### 6.1 Settings Page Section

New section in Settings page: **"Workflows"** (between Auto-Responder and Integrations).

**Components:**

```
WorkflowsSection
  ├─ WorkflowsList          — List of user's rules with toggle, edit, delete
  ├─ WorkflowEditor         — Modal/drawer for creating/editing a rule
  │   ├─ ConditionBuilder   — Pattern inputs + natural language condition
  │   ├─ ActionBuilder      — Add/reorder actions (reply, MCP tool, webhook)
  │   │   ├─ ReplyActionForm
  │   │   ├─ MCPToolActionForm  — Server picker → Tool picker → Parameter mapping
  │   │   └─ WebhookActionForm
  │   └─ WorkflowPreview    — Shows what would happen for a sample email
  ├─ MCPServerManager       — Connect/disconnect MCP servers (in Integrations section)
  └─ WorkflowExecutionHistory — Recent execution logs per workflow
```

### 6.2 UX Flow: Creating a Workflow

1. Click "Add Workflow" → opens WorkflowEditor
2. **Name:** Free text (e.g. "Upwork billing → Focus Bear")
3. **When (condition):**
   - From patterns: tag-style input (e.g. `*@upwork.com`)
   - Subject patterns: tag-style input (e.g. `billing summary`)
   - Category filter: multi-select from user's categories
   - (Advanced) Natural language: textarea for LLM-evaluated conditions
4. **Then (actions):**
   - "Add action" dropdown: Reply | MCP Tool | Webhook
   - For MCP Tool: Select server → Select tool → Map parameters (shows tool's input schema, user fills values with `{{variable}}` syntax and `{{ai:...}}` for AI-generated content)
   - Drag to reorder
5. **Test:** "Preview with email" — select an existing email thread to see what variables resolve to
6. **Save**

### 6.3 Natural Language Workflow Creation (Future)

Allow users to describe workflows in plain English:

> "When I get an Upwork billing email, create a Focus Bear task to reconcile Xero"

LLM parses this into a `WorkflowCondition` + `WorkflowAction[]` and shows it for confirmation. This is a v2 feature — MVP uses the structured form.

---

## 7. API Endpoints

### 7.1 Workflow CRUD

```
GET    /api/workflows                    → List user's workflow rules
POST   /api/workflows                    → Create new workflow rule
GET    /api/workflows/:id                → Get workflow rule details
PUT    /api/workflows/:id                → Update workflow rule
DELETE /api/workflows/:id                → Delete workflow rule
PATCH  /api/workflows/:id/toggle         → Enable/disable workflow
PUT    /api/workflows/reorder            → Update priority ordering
```

### 7.2 MCP Server Management

```
GET    /api/mcp-servers                  → List user's configured MCP servers
POST   /api/mcp-servers                  → Add MCP server
DELETE /api/mcp-servers/:id              → Remove MCP server
POST   /api/mcp-servers/:id/refresh      → Re-fetch tool list
GET    /api/mcp-servers/:id/tools        → Get cached tool list
POST   /api/mcp-servers/:id/test         → Test connection
```

### 7.3 Execution Logs

```
GET    /api/workflows/:id/executions     → Execution history for a workflow
GET    /api/workflow-executions           → All executions (paginated)
```

### 7.4 Preview / Test

```
POST   /api/workflows/preview            → Evaluate conditions against a thread, resolve variables (dry run)
```

---

## 8. Module Structure

```
server/src/workflows/
  ├─ workflows.module.ts
  ├─ workflows.controller.ts           — REST endpoints
  ├─ workflows.service.ts              — CRUD + rule matching
  ├─ workflow-execution.service.ts     — Executes matched workflows
  ├─ workflow-processor.ts             — PgBoss job worker
  ├─ workflow-variable-resolver.ts     — Template variable resolution + AI
  ├─ types/
  │   └─ workflow.types.ts             — All type definitions
  └─ __tests__/
      ├─ workflows.service.spec.ts
      ├─ workflow-execution.service.spec.ts
      └─ workflow-variable-resolver.spec.ts

server/src/mcp/
  ├─ mcp.module.ts
  ├─ mcp-client-manager.service.ts     — Manages MCP server connections
  ├─ mcp-servers.controller.ts         — REST endpoints for server config
  ├─ mcp-servers.service.ts            — CRUD for MCP server configs
  └─ __tests__/
      └─ mcp-client-manager.spec.ts

server/src/database/entities/
  ├─ workflow-rule.entity.ts
  ├─ workflow-execution-log.entity.ts
  └─ mcp-server-config.entity.ts

client/src/components/settings/workflows/
  ├─ WorkflowsSection.tsx
  ├─ WorkflowsList.tsx
  ├─ WorkflowEditor.tsx
  ├─ ConditionBuilder.tsx
  ├─ ActionBuilder.tsx
  ├─ MCPToolActionForm.tsx
  ├─ WorkflowPreview.tsx
  └─ WorkflowExecutionHistory.tsx

client/src/components/settings/integrations/
  └─ MCPServerManager.tsx              — Added to existing integrations section
```

---

## 9. MVP Scope vs. Future

### MVP (Phase 1)

| Feature                  | Details                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| Workflow CRUD            | Create, edit, delete, enable/disable rules                       |
| Deterministic conditions | `fromPatterns`, `subjectPatterns`, `categories` via `matchAny()` |
| MCP tool actions         | Connect servers, discover tools, invoke with resolved params     |
| Built-in variables       | `{{from}}`, `{{subject}}`, `{{date}}`, `{{summary}}`, `{{body}}` |
| AI variables             | `{{ai:...}}` resolved via single LLM call                        |
| Execution logging        | Full audit trail per execution                                   |
| Basic UI                 | Settings page section with structured form                       |
| Focus Bear integration   | Primary use case: create tasks from emails                       |

**Estimated effort:** ~3-4 weeks (2 devs), split:

- Backend entities + migration + CRUD: 3 days
- Workflow evaluation pipeline + PgBoss integration: 3 days
- MCP client infrastructure: 4 days
- Variable resolution + AI: 3 days
- Frontend UI: 5 days
- Testing + polish: 3 days

### Phase 2 (Future)

| Feature                            | Details                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| Natural language conditions        | LLM-evaluated `naturalLanguageCondition`                         |
| Reply actions                      | Auto-reply with templated content                                |
| Webhook actions                    | POST to arbitrary endpoints                                      |
| Natural language workflow creation | "Describe your workflow" → auto-generates rule                   |
| Multi-match mode                   | Option to run multiple matching workflows (not just first-match) |
| Workflow chaining                  | Output of one action feeds into next                             |
| Conditional actions                | If/else within action sequences                                  |
| Rate limiting                      | Per-workflow execution limits                                    |
| Workflow sharing                   | Export/import workflow templates                                 |
| Execution notifications            | Pusher events when workflows fire                                |

### Phase 3 (Longer Term)

| Feature                | Details                                      |
| ---------------------- | -------------------------------------------- |
| Scheduled workflows    | Time-based triggers (not just email arrival) |
| Cross-thread workflows | Aggregate patterns across multiple emails    |
| Workflow marketplace   | Community-shared workflow templates          |
| OAuth-based MCP auth   | Beyond API keys                              |

---

## 10. Risks & Mitigations

| Risk                                                        | Impact                                   | Mitigation                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| LLM hallucination in AI variables                           | Wrong data in Focus Bear tasks           | Show preview before enabling; execution log for audit; user can review executions                            |
| MCP server downtime                                         | Actions fail silently                    | Retry once; log failures prominently; Pusher notification on failure                                         |
| Token cost from LLM condition checks                        | Expensive at scale                       | Deterministic patterns filter first; LLM only on pattern-matched emails; cap at 1 LLM call per workflow eval |
| Race condition: workflow runs before summary/priority ready | Condition check fails or uses stale data | Delayed job start (60s) + retry with backoff; verify summary exists before evaluating                        |
| Security: arbitrary webhook URLs                            | Data exfiltration                        | MVP: no webhook action (Phase 2); validate URLs when added                                                   |
| Encryption: workflow rules contain user email patterns      | Privacy concern                          | All text columns use `encryptedColumnTransformer` (existing pattern)                                         |

---

## 11. Testing Strategy

1. **Unit tests:**
   - `WorkflowVariableResolver` — built-in + AI variable substitution
   - Condition matching (reuses `matchAny` tests + new category/priority tests)
   - Action execution (mocked MCP client, mocked email provider)

2. **Integration tests:**
   - Full pipeline: email arrives → workflow evaluates → action executes
   - MCP server config CRUD
   - Execution log queries

3. **E2E / Manual:**
   - Create workflow via UI → trigger with test email → verify Focus Bear task created
   - Disabled workflow doesn't fire
   - First-match-wins ordering

---

## 12. Dependencies

- `@modelcontextprotocol/sdk` — MCP client library (new dependency)
- `dayjs` — already in use for date formatting
- `handlebars` — already referenced in auto-responder templates (reuse for variable substitution)
- PgBoss — existing job queue infrastructure

No new infrastructure required. PostgreSQL, PgBoss, existing LLM service, existing encryption — all in place.

---

## 13. Open Questions

1. **Should workflows and auto-responder coexist or should auto-responder become a special case of workflows?** Recommendation: keep them separate for MVP. Auto-responder has its own complex logic (classification, Q&A, templates). Long-term, auto-responder could be migrated to a built-in workflow template.

2. **Should MCP server management be a shared module or workflow-specific?** Recommendation: shared module (`server/src/mcp/`). Other features (suggested actions, reply composer) may want MCP access in the future.

3. **Execution concurrency:** Should multiple workflows be able to match the same email? MVP: first-match-wins (simpler, prevents duplicate actions). Future: configurable per-rule `continueOnMatch` flag.

4. **Approval mode:** Should users have an option to require manual approval before a workflow executes? Useful for high-stakes actions. Could be a Phase 2 feature with Pusher-based "approve/reject" UI.
