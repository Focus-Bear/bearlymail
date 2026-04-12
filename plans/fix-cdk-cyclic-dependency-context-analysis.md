# Fix: CDK Cyclic Dependency Between DatabaseStack and ContextAnalysisStack

**Date:** 2026-03-29  
**Author:** Captain Codebeard (AI agent)  
**PR:** `openclaw/fix-cdk-cyclic-dependency-context-analysis`

## Problem

CDK deployment fails with:

```
ValidationError: 'BearlyMailContextAnalysisStack' depends on 'BearlyMailDatabaseStack'.
Adding this dependency (BearlyMailDatabaseStack -> BearlyMailContextAnalysisStack/LambdaSecurityGroup/Resource.GroupId)
would create a cyclic reference.
```

## Root Cause

In `bearlymail-context-analysis-stack.ts`:

```typescript
rdsProxySecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), ...)
```

- `rdsProxySecurityGroup` is owned by `DatabaseStack`
- `lambdaSecurityGroup` is owned by `ContextAnalysisStack`

CDK synthesizes cross-stack ingress rules by injecting the source SG's `GroupId` into the
target SG's stack template. This creates:

- `ContextAnalysisStack` → `DatabaseStack` (explicit `addDependency`)
- `DatabaseStack` → `ContextAnalysisStack/LambdaSecurityGroup/GroupId` (CDK cross-stack ref)

A → B and B → A = **cycle**.

## Fix

Move `LambdaSecurityGroup` creation into `DatabaseStack` (alongside `rdsProxySecurityGroup`).
Since both SGs now live in the same stack, the ingress rule is a local reference — no
cross-stack reference is synthesized, no cycle.

### Changes

**`infrastructure/lib/bearlymail-database-stack.ts`**

- Added `public readonly lambdaSecurityGroup: ec2.SecurityGroup` property
- Created `LambdaSecurityGroup` construct in the constructor
- Added `rdsProxySecurityGroup.addIngressRule(lambdaSecurityGroup, ...)` here (same stack)

**`infrastructure/lib/bearlymail-context-analysis-stack.ts`**

- Added `lambdaSecurityGroup: ec2.ISecurityGroup` to props interface
- Removed local `LambdaSecurityGroup` creation block
- Removed `rdsProxySecurityGroup.addIngressRule(...)` call (now in DatabaseStack)
- Uses `props.lambdaSecurityGroup` for the Lambda function's `securityGroups`

**`infrastructure/bin/app.ts`**

- Passes `lambdaSecurityGroup: databaseStack.lambdaSecurityGroup` when constructing
  `BearlyMailContextAnalysisStack`

## Risk Assessment

**Low** — No behavioral change. The security group rules are identical; only ownership
and instantiation location changed. Lambda connectivity to RDS Proxy is unaffected.

## Verification

`npx aws-cdk@latest synth BearlyMailContextAnalysisStack` completes successfully with no
cyclic reference error. TypeScript compiles with `tsc --noEmit` with zero errors.
