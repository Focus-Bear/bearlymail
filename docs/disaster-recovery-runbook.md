# BearlyMail Disaster Recovery Runbook

**Last Updated**: 2026-04-16
**Owner**: BearlyMail Engineering
**Compliance**: SAQ Q15, GAP-8
**Related**: [DR Test Log](./dr-test-log.md)

---

## RTO / RPO Summary

| Failure Scenario | RTO Target | RPO Target | Severity |
|---|---|---|---|
| ECS service crash (web or worker) | 5 min | 0 (stateless) | Medium |
| ECS task definition rollback | 15 min | 0 (stateless) | Medium |
| Database instance failure | 30 min | 5 min | High |
| Database corruption / bad migration | 2 h | 24 h | Critical |
| ECR image corrupted / deleted | 20 min | 0 (re-build from Git) | High |
| Secrets compromise (rotation) | 1 h | N/A | Critical |
| Frontend / CloudFront failure | 15 min | 0 (static assets) | Medium |
| Full region failure (ap-southeast-2 down) | 4 h | 24 h | Critical |
| Full stack deletion / rebuild | 4 h | 24 h | Critical |

> **Definitions**
> - **RTO** (Recovery Time Objective): maximum acceptable downtime.
> - **RPO** (Recovery Point Objective): maximum acceptable data loss measured in time.

---

## Infrastructure Reference

| Resource | Value |
|---|---|
| AWS Account | `789877399450` |
| Primary Region | `ap-southeast-2` (Sydney) |
| Domain | `app.bearlymail.com` |
| API Domain | `api.app.bearlymail.com` |
| ECS Cluster export | `BearlyMail-ECS-Cluster` |
| Web service export | `BearlyMail-Web-Service-Name` |
| Worker service export | `BearlyMail-Worker-Service-Name` |
| ECR repository | `bearlymail/server` |
| Database name | `bearlymail` |
| DB backup retention | 7 days |
| Deployment role | `arn:aws:iam::789877399450:role/BearlyMail-GitHubActions-DeploymentRole` |

Resolve live resource names at any time with:

```bash
# ECS cluster / services
ECS_CLUSTER=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-ECS-Cluster'].Value" \
  --output text --region ap-southeast-2)

WEB_SERVICE=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-Web-Service-Name'].Value" \
  --output text --region ap-southeast-2)

WORKER_SERVICE=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-Worker-Service-Name'].Value" \
  --output text --region ap-southeast-2)

# RDS instance
DB_INSTANCE=$(aws rds describe-db-instances \
  --query "DBInstances[?DBName=='bearlymail'].DBInstanceIdentifier" \
  --output text --region ap-southeast-2)
```

---

## Pre-Requisites for Recovery

Before executing any recovery procedure:

1. **AWS credentials**: Assume the deployment role or use an IAM user with equivalent permissions.
2. **AWS CLI**: v2+, configured for `ap-southeast-2`.
3. **GitHub access**: Ability to trigger the `Deploy` workflow manually (`workflow_dispatch`).
4. **Notify stakeholders**: Post in the engineering channel before starting recovery.
5. **Open the DR test log**: Record the incident date, scenario, and start time in `docs/dr-test-log.md`.

---

## Scenario 1 — ECS Service Crash

**Symptoms**: Health check endpoint (`/health`) unreachable; ECS service shows 0 running tasks.

**Cause**: Application exception, OOM kill, or container crash.

**Note**: ECS automatically restarts crashed tasks. This procedure is for cases where auto-restart loops or tasks fail to stabilise.

### Recovery Steps

```bash
# 1. Check task status and failure reason
aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$WEB_SERVICE" "$WORKER_SERVICE" \
  --region ap-southeast-2 \
  --query "services[*].{name:serviceName,running:runningCount,desired:desiredCount,events:events[:3]}"

# 2. View recent CloudWatch logs for the web service
aws logs tail /ecs/bearlymail/web \
  --since 30m \
  --region ap-southeast-2

# Worker logs
aws logs tail /ecs/bearlymail/worker \
  --since 30m \
  --region ap-southeast-2

# 3. Force a new deployment (pulls the existing :latest image, restarts tasks)
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

# 4. Wait for services to stabilise
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$WEB_SERVICE" "$WORKER_SERVICE" \
  --region ap-southeast-2

# 5. Verify health endpoint
curl -f https://api.app.bearlymail.com/health
```

**Escalation**: If the service fails to stabilise after step 4, proceed to [Scenario 2 — ECS Task Definition Rollback](#scenario-2--ecs-task-definition-rollback).

---

## Scenario 2 — ECS Task Definition Rollback

**Symptoms**: New deployment introduced a regression; service starts but returns errors or crashes.

### Recovery Steps

```bash
# 1. List recent task definition revisions
aws ecs list-task-definitions \
  --family-prefix BearlyMailStack \
  --sort DESC \
  --region ap-southeast-2

# 2. Identify the last known-good revision (e.g., revision 42)
GOOD_REVISION="arn:aws:ecs:ap-southeast-2:789877399450:task-definition/BearlyMailStack-WebTaskDefinition:42"

# 3. Update the web service to use the previous task definition
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --task-definition "$GOOD_REVISION" \
  --region ap-southeast-2

# 4. Optionally roll back the worker too
GOOD_WORKER_REVISION="arn:aws:ecs:ap-southeast-2:789877399450:task-definition/BearlyMailStack-WorkerTaskDefinition:42"
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --task-definition "$GOOD_WORKER_REVISION" \
  --region ap-southeast-2

# 5. Wait and verify
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$WEB_SERVICE" "$WORKER_SERVICE" \
  --region ap-southeast-2

curl -f https://api.app.bearlymail.com/health
```

**Alternative (preferred)**: Revert the bad commit on `main` and re-trigger the `Deploy` workflow via GitHub Actions — this rebuilds the Docker image and re-deploys cleanly.

---

## Scenario 3 — Database Instance Failure

**Symptoms**: All API calls return 5xx; ECS logs show `ECONNREFUSED` or `ETIMEDOUT` to the RDS endpoint.

**Note**: The current deployment is single-AZ (`multiAz: false`). A hardware failure requires waiting for AWS to restore the instance or restoring from a snapshot. Enabling Multi-AZ reduces RTO to ~2 minutes with automatic failover.

### Recovery Steps

```bash
# 1. Check RDS instance status
DB_INSTANCE=$(aws rds describe-db-instances \
  --query "DBInstances[?DBName=='bearlymail'].DBInstanceIdentifier" \
  --output text --region ap-southeast-2)

aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE" \
  --region ap-southeast-2 \
  --query "DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address,AZ:AvailabilityZone}"

# 2. If status is "failed" or "incompatible-restore", restore from the latest snapshot:
LATEST_SNAPSHOT=$(aws rds describe-db-snapshots \
  --db-instance-identifier "$DB_INSTANCE" \
  --query "reverse(sort_by(DBSnapshots, &SnapshotCreateTime))[0].DBSnapshotIdentifier" \
  --output text --region ap-southeast-2)

echo "Latest snapshot: $LATEST_SNAPSHOT"

# 3. Restore to a new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier bearlymail-restored \
  --db-snapshot-identifier "$LATEST_SNAPSHOT" \
  --db-instance-class <original-instance-class> \
  --no-publicly-accessible \
  --region ap-southeast-2

# NOTE: Replace <original-instance-class> with the actual class used by the
# production instance (e.g. db.t4g.small, db.t4g.medium). Check current class:
#   aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE" \
#     --query "DBInstances[0].DBInstanceClass" --output text --region ap-southeast-2

# 4. Wait for the restored instance to be available (≈15-20 min)
aws rds wait db-instance-available \
  --db-instance-identifier bearlymail-restored \
  --region ap-southeast-2

# 5. Update the CDK stack to point to the new instance endpoint, OR
#    update the ECS task environment variable DB_HOST directly:
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier bearlymail-restored \
  --query "DBInstances[0].Endpoint.Address" \
  --output text --region ap-southeast-2)

echo "New DB endpoint: $NEW_ENDPOINT"
# Update DB_HOST in the CDK stack props or create a new task definition revision
# pointing to the new endpoint, then force a new ECS deployment.

# 6. Run database migrations against the restored instance
#    Trigger the migration ECS task:
MIGRATION_TASK_ARN=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-Migration-Task-ARN'].Value" \
  --output text --region ap-southeast-2)

SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=tag:aws-cdk:subnet-type,Values=Private" \
  --query 'Subnets[*].SubnetId' \
  --output text --region ap-southeast-2 | tr '\t' ',')

MIGRATION_SG=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-Migration-SG-ID'].Value" \
  --output text --region ap-southeast-2)

TASK_ARN=$(aws ecs run-task \
  --cluster "$ECS_CLUSTER" \
  --task-definition "$MIGRATION_TASK_ARN" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$MIGRATION_SG],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' \
  --output text --region ap-southeast-2)

aws ecs wait tasks-stopped \
  --cluster "$ECS_CLUSTER" \
  --tasks "$TASK_ARN" \
  --region ap-southeast-2

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$ECS_CLUSTER" \
  --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' \
  --output text --region ap-southeast-2)

echo "Migration exit code: $EXIT_CODE"
```

**Post-recovery**: After confirming the restored instance is healthy, update the CDK stack to remove the original failed instance and rename the restored instance.

---

## Scenario 4 — Database Corruption / Bad Migration

**Symptoms**: Data is inconsistent, queries return unexpected results, or a migration partially failed.

**Warning**: This restores the database to a point in time — **any data written after that snapshot will be lost**.

### Recovery Steps

```bash
# 1. Stop all ECS services to prevent further writes
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --desired-count 0 \
  --region ap-southeast-2

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --desired-count 0 \
  --region ap-southeast-2

# 2. List available snapshots (most recent first)
aws rds describe-db-snapshots \
  --db-instance-identifier "$DB_INSTANCE" \
  --query "reverse(sort_by(DBSnapshots, &SnapshotCreateTime))[*].{ID:DBSnapshotIdentifier,Time:SnapshotCreateTime,Status:Status}" \
  --output table --region ap-southeast-2

# 3. Restore from the chosen snapshot (replace SNAPSHOT_ID)
SNAPSHOT_ID="<chosen-snapshot-id>"

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier bearlymail-recovery \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --db-instance-class <original-instance-class> \
  --no-publicly-accessible \
  --region ap-southeast-2

aws rds wait db-instance-available \
  --db-instance-identifier bearlymail-recovery \
  --region ap-southeast-2

# 4. Run migrations against the recovered instance
#    (Use the migration ECS task — see Scenario 3, step 6)

# 5. Verify data integrity
#    Connect to the DB and run spot-check queries to confirm data is consistent.

# 6. Restore ECS services
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --desired-count 1 \
  --region ap-southeast-2

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --desired-count 1 \
  --region ap-southeast-2
```

---

## Scenario 5 — ECR Image Corrupted or Deleted

**Symptoms**: ECS tasks fail to start with `CannotPullContainerError`.

### Recovery Steps

```bash
# Option A: Re-trigger the Deploy workflow (preferred)
# Go to GitHub Actions → Deploy → Run workflow → select branch 'main'
# This rebuilds and pushes the Docker image, then re-deploys ECS.

# Option B: Manual rebuild and push
# (Run on a machine with Docker, git, and AWS CLI configured)

git clone https://github.com/Focus-Bear/BearlyMail.git
cd BearlyMail

# Log in to ECR
AWS_ACCOUNT="789877399450"
AWS_REGION="ap-southeast-2"
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build and push
IMAGE_URI="$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/bearlymail/server"
docker build --platform linux/amd64 -t "$IMAGE_URI:latest" ./server
docker push "$IMAGE_URI:latest"

# Force ECS re-deployment
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$WEB_SERVICE" "$WORKER_SERVICE" \
  --region ap-southeast-2
```

---

## Scenario 6 — Secrets Compromise

**Symptoms**: Suspected or confirmed exposure of `ENCRYPTION_KEY`, `JWT_SECRET`, database credentials, or third-party API keys.

**Warning**: Rotating `ENCRYPTION_KEY` requires re-encrypting all data in the database. This is a major operation — coordinate carefully.

### Recovery Steps

```bash
# 1. Immediately revoke / rotate the compromised secret in AWS Secrets Manager
SECRET_ARN=$(aws secretsmanager list-secrets \
  --query "SecretList[?Name=='BearlyMailAppSecrets'].ARN" \
  --output text --region ap-southeast-2)

# Rotate database credentials (RDS Secrets Manager auto-rotation)
DB_SECRET_ARN=$(aws cloudformation list-exports \
  --query "Exports[?Name=='BearlyMail-DB-Secret-ARN'].Value" \
  --output text --region ap-southeast-2)

aws secretsmanager rotate-secret \
  --secret-id "$DB_SECRET_ARN" \
  --region ap-southeast-2

# 2. For JWT_SECRET: safely update only the compromised field in Secrets Manager.
#    IMPORTANT: put-secret-value replaces the ENTIRE secret JSON. Always read the
#    current value first and merge in only the fields you are rotating.

CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --query "SecretString" \
  --output text --region ap-southeast-2)

# Merge the new JWT_SECRET into the existing secret JSON (requires jq):
UPDATED_SECRET=$(echo "$CURRENT_SECRET" | jq --arg v "<new-random-secret>" '. + {JWT_SECRET: $v}')

aws secretsmanager put-secret-value \
  --secret-id "$SECRET_ARN" \
  --secret-string "$UPDATED_SECRET" \
  --region ap-southeast-2

# Alternatively, use the AWS Console → Secrets Manager → BearlyMailAppSecrets
# → "Retrieve secret value" → "Edit" to update only the specific key/value pair.
# This avoids any risk of accidentally overwriting unrelated fields.

# 3. Force new ECS deployments to pick up the new secrets
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WEB_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$WORKER_SERVICE" \
  --force-new-deployment \
  --region ap-southeast-2

# 4. Invalidate all existing JWT sessions
#    Set needsRelogin=true on all users via direct DB update (requires DB access):
#    UPDATE users SET "needsRelogin" = true;

# 5. If ENCRYPTION_KEY was compromised:
#    a. Generate a new 64-character hex key
NEW_KEY=$(openssl rand -hex 32)
echo "New ENCRYPTION_KEY: $NEW_KEY"
#    b. Decrypt all existing data with the old key and re-encrypt with the new key.
#       This requires a custom migration script — engage senior engineering before proceeding.

# 6. Revoke compromised third-party API keys (Google, OpenAI, Gemini, GitHub) in their respective portals.

# 7. If GitHub credentials were compromised, rotate the OIDC role or GitHub App secrets.
```

---

## Scenario 7 — Frontend / CloudFront Failure

**Symptoms**: `app.bearlymail.com` returns 5xx or is unreachable; API (`api.app.bearlymail.com`) is still responding.

### Recovery Steps

```bash
# 1. Check CloudFront distribution status
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='BearlyMail frontend distribution'].Id" \
  --output text --region ap-southeast-2)

aws cloudfront get-distribution \
  --id "$DISTRIBUTION_ID" \
  --query "Distribution.{Status:Status,DomainName:DomainName}" \
  --region ap-southeast-2

# 2. Check the S3 origin bucket
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text --region ap-southeast-2)

aws s3 ls "s3://$BUCKET_NAME" --region ap-southeast-2

# 3. If the S3 bucket is empty or corrupted, re-deploy the frontend:
#    Trigger Deploy workflow on GitHub Actions (it re-uploads to S3 and invalidates CloudFront)
#    OR manually:

cd client
npm ci
VITE_API_URL=https://api.app.bearlymail.com npm run build

aws s3 sync build/ "s3://$BUCKET_NAME" --delete --region ap-southeast-2

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region ap-southeast-2

# 4. Verify the site loads
curl -I https://app.bearlymail.com
```

---

## Scenario 8 — Full Region Failure (ap-southeast-2 Down)

**Note**: BearlyMail does not currently have a secondary region configured. This procedure covers a manual rebuild in an alternate region (`ap-southeast-1` Singapore used as example).

**RTO**: ~4 hours | **RPO**: Up to 24 hours (last daily RDS snapshot)

### Recovery Steps

1. **Declare incident** and communicate ETA to users.

2. **Copy the latest RDS snapshot to the failover region**:

```bash
LATEST_SNAPSHOT=$(aws rds describe-db-snapshots \
  --db-instance-identifier "$DB_INSTANCE" \
  --query "reverse(sort_by(DBSnapshots, &SnapshotCreateTime))[0].DBSnapshotIdentifier" \
  --output text --region ap-southeast-2)

aws rds copy-db-snapshot \
  --source-db-snapshot-identifier \
    "arn:aws:rds:ap-southeast-2:789877399450:snapshot:$LATEST_SNAPSHOT" \
  --target-db-snapshot-identifier bearlymail-failover \
  --region ap-southeast-1
```

3. **Copy ECR image to the failover region** (or rebuild from Git if ECR is unavailable):

```bash
# Pull and re-push to ap-southeast-1
docker pull 789877399450.dkr.ecr.ap-southeast-2.amazonaws.com/bearlymail/server:latest
# Re-tag and push to ap-southeast-1 ECR
```

4. **Deploy CDK stacks in the failover region**:

```bash
cd infrastructure
# Update env.region in bin/app.ts to 'ap-southeast-1'
cdk deploy --all --require-approval never --region ap-southeast-1
```

5. **Restore the database from the copied snapshot** (see Scenario 3, steps 3-5).

6. **Run migrations**:

```bash
# Trigger migration ECS task in ap-southeast-1
```

7. **Update DNS**: Change Route53 records to point to the new ALB/CloudFront in `ap-southeast-1`.

8. **Verify the application is operational** via the health endpoint.

---

## Scenario 9 — Full Stack Deletion / Rebuild from Scratch

**When used**: Catastrophic CDK stack deletion, account compromise requiring clean rebuild, or onboarding to a new AWS account.

### Recovery Steps

1. **Restore secrets**: Re-enter all application secrets into AWS Secrets Manager using the values from your secure offline backup (1Password, LastPass, etc.).

2. **Deploy all stacks in order** (mirrors the `bin/app.ts` dependency order):

```bash
cd infrastructure
npm ci

# Deploy in strict order — each stack depends on the previous
cdk deploy BearlyMailNetworkingStack --require-approval never
cdk deploy BearlyMailSecretsStack --require-approval never
cdk deploy BearlyMailDatabaseStack --require-approval never
cdk deploy BearlyMailContextAnalysisStack --require-approval never
cdk deploy BearlyMailEmailPrioritisationStack --require-approval never
cdk deploy BearlyMailStack --require-approval never
cdk deploy BearlyMailGitHubActionsStack --require-approval never
```

3. **Restore the database** from the most recent snapshot (see Scenario 3).

4. **Run migrations** (see Scenario 3, step 6).

5. **Build and push the Docker image** (see Scenario 5).

6. **Deploy the frontend** (see Scenario 7, step 3).

7. **Verify all services** via health checks and smoke tests.

---

## Post-Incident Checklist

After any recovery:

- [ ] Confirm `/health` endpoint returns 200
- [ ] Verify a sample user can log in
- [ ] Verify email sync is processing (check worker logs)
- [ ] Check CloudWatch alarms are cleared
- [ ] Record incident in `docs/dr-test-log.md` (even if unplanned)
- [ ] Write a blameless post-mortem within 48 hours for Critical/High incidents
- [ ] Update this runbook if any step was inaccurate or missing
- [ ] Review whether the RTO/RPO targets were met; update the table at the top if needed

---

## Quarterly DR Exercise Schedule

DR exercises must be performed **every quarter** to validate that recovery procedures work and that RTO/RPO targets are achievable.

| Quarter | Target Date | Scenario | Lead Engineer |
|---|---|---|---|
| Q1 (Jan–Mar) | Last Thursday of March | Scenario 1: ECS restart + Scenario 7: Frontend redeploy | Rotate |
| Q2 (Apr–Jun) | Last Thursday of June | Scenario 2: Task definition rollback | Rotate |
| Q3 (Jul–Sep) | Last Thursday of September | Scenario 4: DB restore from snapshot (staging) | Rotate |
| Q4 (Oct–Dec) | Last Thursday of December | Scenario 5: ECR rebuild + Scenario 3: DB failover (staging) | Rotate |

### How to Conduct a DR Exercise

1. **Pre-exercise** (1 week before):
   - Notify the team of the planned exercise window (30-min maintenance window).
   - Identify the scenario and assign a lead engineer.
   - Ensure staging environment mirrors production as closely as possible.

2. **During the exercise**:
   - Start a timer at the moment the scenario begins.
   - Execute the recovery steps exactly as written in this runbook.
   - Note any steps that are inaccurate, ambiguous, or missing.
   - Record actual recovery time vs. RTO target.

3. **Post-exercise** (within 48 hours):
   - Log the exercise in `docs/dr-test-log.md`.
   - Open GitHub issues for any runbook inaccuracies found.
   - Update this runbook with corrections.
   - Report results to the team.

---

## CloudWatch Alarms to Monitor

The following alarms indicate conditions that may require DR intervention:

| Alarm | Threshold | Action |
|---|---|---|
| ECS web service running tasks < 1 | 5 minutes | Scenario 1 |
| ECS worker service running tasks < 1 | 5 minutes | Scenario 1 |
| RDS CPU > 90% | 10 minutes | Investigate; may precede Scenario 3 |
| RDS `DatabaseConnections` = 0 (with tasks running) | 2 minutes | Scenario 3 |
| RDS free storage < 5 GB | Immediate | Scale up storage |
| 5xx error rate on ALB > 5% | 5 minutes | Scenario 1 or 2 |
| CloudFront 5xx rate > 5% | 5 minutes | Scenario 7 |

---

## Contacts

| Role | Responsibility |
|---|---|
| On-call engineer | First responder for all P1/P2 incidents |
| AWS Support | Infrastructure issues (open a case at console.aws.amazon.com/support) |
| Zoho Cliq `#bearlymail-backend` | Primary incident communication channel |

---

*This document must be reviewed and updated after every DR exercise and after any significant infrastructure change. See [DR Test Log](./dr-test-log.md) for exercise history.*
