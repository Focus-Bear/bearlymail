# Plan: fix(#1576) — Context analysis not using Lambda + SQS pipeline

**Issue:** #1576 — "Initial context analysis still really slow"
**Author:** Monk of Modularity (AI)
**Date:** 2026-03-30 (v3 — architecture rework, SQS out of database stack)

---

## Background

PR #1577 (v2) correctly fixed the root cause: ECS containers never received `CONTEXT_ANALYSIS_SQS_QUEUE_URL`, the Lambda path was dead code. The fix works and CI is green. However, Jeremy identified the CDK architecture as a **hack**: SQS queue creation was moved to `BearlyMailDatabaseStack` solely to break a circular CDK dependency. SQS doesn't semantically belong in a database stack.

This v3 plan fixes the architecture properly.

---

## The Circular Dependency (explained)

### Current dependency graph (v2 hack):

```
NetworkingStack ← DatabaseStack ← AppStack ← ContextAnalysisStack
                                      ↑              ↓
                                      └──────────────┘ (ecsTaskRoleArn)
```

The circular dep exists because:
1. **ContextAnalysisStack → AppStack**: needs `ecsTaskRole.roleArn` to call `queue.grantSendMessages(ecsTaskRole)`
2. **AppStack → ContextAnalysisStack**: needs `queueUrl` for ECS container environment

When SQS lived in ContextAnalysisStack, this was a cycle. The v2 hack "solved" it by moving SQS to DatabaseStack (both stacks already depend on it). This works but is semantically wrong — SQS queues aren't database resources.

### WHY does ContextAnalysisStack need ecsTaskRoleArn?

Only for **one line of code**:
```typescript
queue.grantSendMessages(ecsTaskRole);  // line ~88
```

This grants the ECS task role permission to send messages to the SQS queue. But this grant doesn't need to live in ContextAnalysisStack — **AppStack can grant itself SQS permissions using a deterministic queue ARN**.

---

## v3 Architecture: Invert the Dependency

### Key insight

If AppStack self-grants `sqs:SendMessage` permission using the deterministic FIFO queue ARN, ContextAnalysisStack no longer needs `ecsTaskRoleArn`. The dependency inverts:

```
NetworkingStack ← DatabaseStack ← ContextAnalysisStack ← AppStack
                       ↑                                      ↑
                  SecretsStack ─────────────────────────────────┘
```

- **ContextAnalysisStack** owns its SQS queue + DLQ (where they semantically belong)
- **ContextAnalysisStack** does NOT depend on AppStack (no more ecsTaskRoleArn)
- **AppStack** depends on ContextAnalysisStack (receives queueUrl as a prop)
- **No circular dependency**

### How AppStack self-grants SQS permissions

```typescript
// In bearlymail-stack.ts, after creating the task role:
const contextAnalysisQueueArn = `arn:aws:sqs:${this.region}:${this.account}:bearlymail-context-analysis.fifo`;
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: ['sqs:SendMessage', 'sqs:GetQueueUrl', 'sqs:GetQueueAttributes'],
  resources: [contextAnalysisQueueArn],
}));
```

The queue name `bearlymail-context-analysis.fifo` is deterministic (set via `queueName` in the CDK construct), so the ARN is stable and known at synth time.

Alternatively (and even cleaner), since AppStack will receive the queue URL as a prop from ContextAnalysisStack, we can also pass the queue construct itself and call `queue.grantSendMessages(taskRole)` inside AppStack. CDK handles the direction: **a downstream stack granting permissions to its own resources is fine** (the dependency flows AppStack → ContextAnalysisStack, and the grant creates an IAM policy in AppStack referencing a queue in ContextAnalysisStack — no cycle).

**Recommended approach: Pass the queue object to AppStack and call `grantSendMessages` there.**

---

## Detailed Changes

### 1. Move SQS queue + DLQ BACK to ContextAnalysisStack

**File: `infrastructure/lib/bearlymail-context-analysis-stack.ts`**

- Move SQS queue + DLQ creation back into this stack (they were originally here before the v2 hack)
- Remove `contextAnalysisQueue` and `contextAnalysisDlq` from props — these are now created locally
- Keep `ecsTaskRoleArn` REMOVED from props (the whole point)
- Export `queue`, `dlq`, and `queueUrl` as public stack properties

```typescript
export interface BearlyMailContextAnalysisStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  database: rds.IDatabaseInstance;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
  rdsProxy: rds.DatabaseProxy;
  rdsProxyEndpoint: string;
  rdsProxySecurityGroup: ec2.SecurityGroup;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  // NO ecsTaskRoleArn — AppStack self-manages SQS permissions
  // NO contextAnalysisQueue/Dlq — created locally
  alarmSnsTopicArn?: string;
}

export class BearlyMailContextAnalysisStack extends cdk.Stack {
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;
  public readonly queueUrl: string;
  // ...
}
```

### 2. Remove SQS resources from DatabaseStack

**File: `infrastructure/lib/bearlymail-database-stack.ts`**

- Remove SQS queue + DLQ creation
- Remove `contextAnalysisQueue`, `contextAnalysisDlq`, `contextAnalysisQueueUrl` properties
- Remove SQS-related CfnOutputs
- Remove `import * as sqs` (if no other SQS usage)
- Keep `lambdaSecurityGroup` and `rdsProxySecurityGroup` here (they genuinely relate to DB connectivity)

### 3. Update AppStack to receive queue from ContextAnalysisStack

**File: `infrastructure/lib/bearlymail-stack.ts`**

- Change prop from `contextAnalysisSqsQueueUrl: string` to `contextAnalysisQueue: sqs.Queue`
- Call `props.contextAnalysisQueue.grantSendMessages(taskRole)` inside AppStack
- Set `CONTEXT_ANALYSIS_SQS_QUEUE_URL: props.contextAnalysisQueue.queueUrl` on container environments

### 4. Rewire the stack graph in bin/bearlymail.ts

**File: `infrastructure/bin/bearlymail.ts`**

```typescript
// 4. Context Analysis Stack — BEFORE AppStack now
const contextAnalysisStack = new BearlyMailContextAnalysisStack(app, 'BearlyMailContextAnalysisStack', {
  env,
  description: 'BearlyMail - Context Analysis (SQS + Lambda + RDS Proxy)',
  vpc: networkingStack.vpc,
  database: databaseStack.database,
  dbSecret: databaseStack.dbSecret,
  appSecrets: secretsStack.appSecrets,
  rdsProxy: databaseStack.rdsProxy,
  rdsProxyEndpoint: databaseStack.rdsProxyEndpoint,
  rdsProxySecurityGroup: databaseStack.rdsProxySecurityGroup,
  lambdaSecurityGroup: databaseStack.lambdaSecurityGroup,
  // NO ecsTaskRoleArn — AppStack self-grants
});

contextAnalysisStack.addDependency(networkingStack);
contextAnalysisStack.addDependency(databaseStack);
contextAnalysisStack.addDependency(secretsStack);
// NOT appStack — dependency is inverted now

// 5. Application Stack — depends on ContextAnalysisStack
const appStack = new BearlyMailStack(app, 'BearlyMailStack', {
  env,
  description: 'BearlyMail - Application (ECS services, S3, CloudFront)',
  vpc: networkingStack.vpc,
  // ...existing props...
  contextAnalysisQueue: contextAnalysisStack.queue,  // queue object, not URL string
});

appStack.addDependency(networkingStack);
appStack.addDependency(secretsStack);
appStack.addDependency(databaseStack);
appStack.addDependency(contextAnalysisStack);  // NEW: appStack depends on contextAnalysisStack
```

### Stack deployment order (new):

1. NetworkingStack (VPC, Route53, certs)
2. SecretsStack (app secrets)
3. DatabaseStack (RDS, RDS Proxy, security groups)
4. **ContextAnalysisStack** (SQS queue + DLQ, Lambda, CloudWatch alarms) — MOVED UP
5. **AppStack** (ECS, S3, CloudFront) — now depends on ContextAnalysisStack
6. GitHubActionsStack (OIDC)

---

## CDK Migration Risk: SQS Queue Replacement

Moving the SQS queue from DatabaseStack to ContextAnalysisStack changes its CloudFormation logical ID and owning stack. **CloudFormation will want to delete and recreate the queue.**

### Mitigation

The queues already have `removalPolicy: RETAIN`, so:
1. CDK deploy removes them from DatabaseStack → CloudFormation marks for deletion → RETAIN policy keeps them alive
2. ContextAnalysisStack creates "new" queues with the same `queueName` → **CloudFormation will fail** because the name is taken

### Safe migration path

**Option A (recommended): Two-phase deployment**
1. First deploy: Remove queues from DatabaseStack (they survive due to RETAIN). Don't add to ContextAnalysisStack yet.
2. Manually delete the retained queues (they're empty, transient by nature)
3. Second deploy: ContextAnalysisStack creates fresh queues with same names

**Option B: Import existing resources**
Use `sqs.Queue.fromQueueArn()` in ContextAnalysisStack for the first deploy, then switch to `new sqs.Queue()` in a follow-up. More complex, less clean.

**Option C (simplest): Accept brief downtime**
Since context analysis is async and retries, a brief gap where the queue doesn't exist is acceptable. Deploy once, the old queue is retained, the new one fails to create (name conflict), manually delete the old one, re-deploy.

**→ Recommend Option A** for zero-risk migration.

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `infrastructure/lib/bearlymail-context-analysis-stack.ts` | Move SQS queue + DLQ back here; remove ecsTaskRoleArn prop | P0 |
| `infrastructure/lib/bearlymail-database-stack.ts` | Remove SQS queue + DLQ; clean up exports | P0 |
| `infrastructure/lib/bearlymail-stack.ts` | Accept queue object; call grantSendMessages locally | P0 |
| `infrastructure/bin/bearlymail.ts` | Reorder stacks; invert dependency direction | P0 |
| `infrastructure/DEPLOYMENT.md` | Document two-phase migration steps | P1 |

All other changes from v2 (removing feature flag, removing PgBoss fallback, env validation, etc.) remain correct and unchanged.

---

## Risk Assessment

- **Low risk:** The dependency inversion is a clean CDK pattern. No hacks, no hardcoded ARNs, no SSM bridges.
- **Migration risk:** Queue ownership change requires a two-phase deploy (see above). Mitigated by RETAIN policy + deterministic queue names.
- **Rollback:** If needed, move SQS back to DatabaseStack (revert to v2 hack). The architecture is easily reversible.

## Testing

1. `cdk synth` — verify no circular dependencies, correct stack ordering
2. `cdk diff` — verify SQS resources move between stacks as expected
3. Deploy Phase 1 (remove from DatabaseStack) → verify queues retained
4. Deploy Phase 2 (add to ContextAnalysisStack) → verify Lambda event source wired correctly
5. Trigger context analysis → verify SQS → Lambda → RDS pipeline works end-to-end
6. Check ECS container env vars include `CONTEXT_ANALYSIS_SQS_QUEUE_URL`
