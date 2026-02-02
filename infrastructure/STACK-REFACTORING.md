# Stack Refactoring Summary

## What Changed

The infrastructure has been refactored from 2 monolithic stacks into 4 modular stacks:

### Before
1. **BearlyMailNetworkingStack**: VPC, Route53, Certificate
2. **BearlyMailStack**: Database, Secrets, ECS, S3, CloudFront (everything)

### After
1. **BearlyMailNetworkingStack**: VPC, Route53, Certificate (unchanged)
2. **BearlyMailSecretsStack**: Secrets Manager (database & app secrets)
3. **BearlyMailDatabaseStack**: RDS PostgreSQL
4. **BearlyMailStack**: ECS, S3, CloudFront, ALB

## Why This Change?

### Problem
- Every code change required redeploying the entire stack including database
- Database deployments take 10-15 minutes even when nothing changes
- Risk of accidentally modifying database during application updates
- Hard to troubleshoot when one component fails

### Solution
- Database and secrets are now separate, stable stacks
- Application stack can be redeployed independently (~5-8 min vs ~20-30 min)
- Clearer separation of concerns
- Safer updates with dependency checks

## Deployment Impact

### Initial Deployment
```bash
# Before: One long deployment
cdk deploy --all  # ~20-30 minutes

# After: Same, but with better visibility
cdk deploy --all  # ~20-30 minutes
# Or deploy individually to see progress:
cdk deploy BearlyMailNetworkingStack  # ~5-10 min
cdk deploy BearlyMailSecretsStack      # ~1 min
cdk deploy BearlyMailDatabaseStack     # ~10-15 min
cdk deploy BearlyMailStack             # ~5-8 min
```

### Iterative Development (the real benefit!)
```bash
# Before: Redeploy everything including database
cdk deploy BearlyMailStack  # ~20-30 minutes

# After: Only redeploy application
cdk deploy BearlyMailStack  # ~5-8 minutes
# Database and secrets stacks are untouched
```

## Migration from Old Structure

If you have existing stacks deployed:

### Option 1: Clean Deployment (Recommended)
1. Backup your database
2. Destroy old stacks: `cdk destroy --all`
3. Deploy new structure: `cdk deploy --all`
4. Restore database if needed

### Option 2: Manual Migration (Advanced)
1. Export database snapshot
2. Destroy old `BearlyMailStack`
3. Deploy new stacks:
   - `BearlyMailSecretsStack` (copy secrets manually)
   - `BearlyMailDatabaseStack` (restore from snapshot)
   - `BearlyMailStack`

## Stack Dependencies

```
BearlyMailNetworkingStack (independent)
        ↓
BearlyMailSecretsStack (independent)     BearlyMailDatabaseStack (needs VPC only; creates DB secret internally)
        ↓                                           ↓
        └─────────────── BearlyMailStack (needs VPC, certificate, database, dbSecret, appSecrets)
```

The database secret lives in BearlyMailDatabaseStack (not SecretsStack) to avoid a cyclic dependency: RDS attaches the secret to the instance, which would create SecretsStack → DatabaseStack while DatabaseStack → SecretsStack.

CDK handles these dependencies automatically via `addDependency()` calls.

## File Changes

### New Files
- `lib/bearlymail-secrets-stack.ts` - Secrets Manager stack
- `lib/bearlymail-database-stack.ts` - RDS PostgreSQL stack

### Modified Files
- `bin/app.ts` - Instantiates all 4 stacks with dependencies
- `lib/bearlymail-stack.ts` - Removed database and secrets, accepts them as props
- `README.md` - Updated with new stack structure
- `DEPLOYMENT.md` - Updated deployment instructions
- `SETUP.md` - Rewritten for new structure
- `TROUBLESHOOTING.md` - Added section for secrets JSON format errors

## Stack Outputs

### BearlyMailSecretsStack
- `AppSecretsArn` - ARN of application secrets

### BearlyMailDatabaseStack
- `DatabaseSecretArn` - ARN of database credentials secret
- `DatabaseEndpoint` - RDS instance hostname
- `DatabasePort` - RDS port (5432)
- `DatabaseName` - Database name (bearlymail)

### BearlyMailStack
- `LoadBalancerDNS` - ALB DNS for API
- `CloudFrontURL` - Frontend URL
- `FrontendBucketName` - S3 bucket name

## Benefits Summary

✅ **Faster iterations**: 5-8 min vs 20-30 min for application changes
✅ **Safer updates**: Database isolated from application changes
✅ **Better organization**: Clear separation of concerns
✅ **Easier troubleshooting**: Can identify which stack has issues
✅ **Cost visibility**: Can see costs per stack in CloudFormation

## Example Workflows

### Updating Application Code
```bash
# Make changes to server code
vim server/src/emails/emails.controller.ts

# Only redeploy application stack
cdk deploy BearlyMailStack  # ~5-8 minutes
```

### Updating Database Configuration
```bash
# Make changes to database config
vim infrastructure/lib/bearlymail-database-stack.ts

# Only redeploy database stack
cdk deploy BearlyMailDatabaseStack  # ~10-15 minutes
```

### Adding New Secrets
```bash
# Update secret value in AWS
aws secretsmanager put-secret-value --secret-id $APP_SECRETS_ARN --secret-string '{...}'

# Restart ECS tasks to pick up new secrets
aws ecs update-service --cluster BearlyMailCluster --service WebService --force-new-deployment
```

### Scaling ECS Services
```bash
# Change desired count in lib/bearlymail-stack.ts
# Only redeploy application stack
cdk deploy BearlyMailStack  # ~5-8 minutes
```

## Next Steps

1. Review updated documentation:
   - [README.md](./README.md) - Overview and architecture
   - [SETUP.md](./SETUP.md) - Quick setup guide
   - [DEPLOYMENT.md](./DEPLOYMENT.md) - Detailed deployment
   - [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues

2. If deploying fresh:
   - Follow [SETUP.md](./SETUP.md)

3. If migrating existing deployment:
   - Backup database first
   - Consider clean redeployment
