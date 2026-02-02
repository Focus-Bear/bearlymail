# BearlyMail AWS Infrastructure

AWS CDK infrastructure for deploying BearlyMail to AWS.

## Architecture

The infrastructure is split into **4 separate stacks** for faster, more modular deployments:

1. **BearlyMailNetworkingStack**: VPC, Route53, SSL Certificate
2. **BearlyMailSecretsStack**: Secrets Manager (database credentials, API keys)
3. **BearlyMailDatabaseStack**: RDS PostgreSQL
4. **BearlyMailStack**: ECS Fargate, S3, CloudFront, ALB

### Why separate stacks?

- **Faster deployments**: Database and secrets rarely change, so they can stay deployed while you iterate on the application stack
- **Safer updates**: Reduces risk of accidentally modifying critical resources like the database
- **Modularity**: Each stack can be deployed, updated, or destroyed independently (with dependency checks)

### Stack Deployment Order

1. **Networking** (slowest - creates VPC, certificate)
2. **Secrets** (fast - just creates empty secrets)
3. **Database** (slow - creates RDS instance)
4. **Application** (medium - ECS, S3, CloudFront)

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js** 18+ and npm
3. **AWS CDK CLI**: `npm install -g aws-cdk`
4. **Docker** (for building container images)

## Setup

1. **Install dependencies**:
   ```bash
   cd infrastructure
   npm install
   ```

2. **Bootstrap CDK** (first time only):
   ```bash
   cdk bootstrap aws://ACCOUNT-ID/ap-southeast-2
   ```

3. **Configure secrets** in AWS Secrets Manager (see Deployment section above)

## Deployment

### First Time Deployment

Deploy all stacks in order:

```bash
cd infrastructure

# Deploy all stacks (they will deploy in dependency order)
npm run deploy
```

Or deploy individually (useful for iterating):

```bash
# 1. Deploy networking (slowest - ~5-10 minutes)
cdk deploy BearlyMailNetworkingStack

# 2. Deploy secrets (fast - ~1 minute)
cdk deploy BearlyMailSecretsStack

# 3. Deploy database (slow - ~10-15 minutes)
cdk deploy BearlyMailDatabaseStack

# 4. Deploy application (medium - ~5-8 minutes)
cdk deploy BearlyMailStack
```

### After Initial Deployment: Configure Secrets

Get the secret ARN from the secrets stack outputs:

```bash
APP_SECRETS_ARN=$(aws cloudformation describe-stacks --stack-name BearlyMailSecretsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AppSecretsArn`].OutputValue' --output text)

# Update with your actual values (MUST be valid JSON with double quotes)
aws secretsmanager put-secret-value \
  --secret-id "$APP_SECRETS_ARN" \
  --secret-string '{
    "ENCRYPTION_KEY": "your-32-character-encryption-key",
    "JWT_SECRET": "your-jwt-secret",
    "GOOGLE_CLIENT_ID": "your-google-client-id",
    "GOOGLE_CLIENT_SECRET": "your-google-client-secret",
    "GOOGLE_REDIRECT_URI": "https://app.bearlymail.com/auth/google/callback",
    "GEMINI_API_KEY": "",
    "OPENAI_API_KEY": "",
    "ZOHO_CLIQ_BACKEND_BOT_WEBHOOK": "",
    "ZOHO_CLIQ_API_KEY": "",
    "ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL": "",
    "AWS_REGION": "ap-southeast-2",
    "SES_FROM_EMAIL": "noreply@bearlymail.com"
  }'
```

**IMPORTANT**: The secret value must be valid JSON (double-quoted keys and values). See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) section 6a if you get `invalid character '_'` errors.

### Iterating on the Application

Once networking, secrets, and database are deployed, you can iterate quickly on just the application stack:

```bash
# Only redeploy the application (ECS, S3, CloudFront)
cdk deploy BearlyMailStack
```

This is much faster (~5-8 minutes) than redeploying everything (~20-30 minutes).

### View Differences Before Deploying

```bash
npm run diff
# Or for a specific stack:
cdk diff BearlyMailStack
```

## Configuration

### Environment Variables

The stack automatically configures:
- Database connection (from RDS)
- Secrets from Secrets Manager
- Port configuration

### Customization

You can customize the stack by modifying `lib/bearlymail-stack.ts`:

- **Database instance type**: Change `databaseInstanceType` in stack props
- **ECS task CPU/Memory**: Adjust `webTaskCpu`, `webTaskMemory`, etc.
- **Desired count**: Modify `desiredCount` in service definitions
- **Multi-AZ**: Set `multiAz: true` on RDS for high availability

## Services

### Web Service
- **Port**: 3001
- **Health Check**: `/health`
- **Load Balancer**: Public-facing ALB

### Worker Service
- Runs background jobs (email sync, priority calculation, etc.)
- No public access, only needs database access

### Cron Jobs
- Scheduled tasks via EventBridge
- Currently configured for email sync every 6 hours
- Add more rules as needed

## Frontend Deployment

The frontend is deployed to S3 and served via CloudFront. To update:

1. Build the React app:
   ```bash
   cd client
   npm run build
   ```

2. Deploy to S3:
   ```bash
   aws s3 sync build/ s3://<FrontendBucketName> --delete
   ```

3. Invalidate CloudFront cache:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id <DistributionId> \
     --paths "/*"
   ```

Or use the CDK deployment which handles this automatically.

## Database Migrations

Run migrations after deployment:

1. **Get database connection details**:
   ```bash
   aws secretsmanager get-secret-value --secret-id <DatabaseSecretArn>
   ```

2. **Run migrations** (from a local machine or ECS task):
   ```bash
   # Set environment variables
   export DB_HOST=<database-endpoint>
   export DB_USERNAME=<username>
   export DB_PASSWORD=<password>
   export DB_NAME=bearlymail
   export DB_SSL=true
   
   # Run migrations
   cd server
   npm run migration:run
   ```

## Monitoring

- **CloudWatch Logs**: `/ecs/bearlymail/web` and `/ecs/bearlymail/worker`
- **ECS Container Insights**: Enabled on cluster
- **RDS Performance Insights**: Enabled on database

## Cost Optimization

- Single NAT gateway (can be increased for HA)
- T3.micro database instance (upgrade for production)
- Price class 100 for CloudFront (only North America and Europe)
- Single AZ RDS (enable Multi-AZ for production)

## Security

- Database in private subnet
- ECS tasks in private subnet (except web service which needs ALB)
- Secrets stored in Secrets Manager
- SSL/TLS for database connections
- CloudFront with HTTPS only
- S3 bucket not publicly accessible

## Troubleshooting

### View logs:
```bash
aws logs tail /ecs/bearlymail/web --follow
aws logs tail /ecs/bearlymail/worker --follow
```

### Check service status:
```bash
aws ecs describe-services --cluster BearlyMailCluster --services WebService
```

### Scale services:
```bash
aws ecs update-service --cluster BearlyMailCluster --service WebService --desired-count 2
```

## Cleanup

To destroy all stacks (in reverse dependency order):

```bash
cdk destroy --all
```

Or destroy specific stacks:

```bash
# Destroy application first
cdk destroy BearlyMailStack

# Then database (if you want to delete it)
cdk destroy BearlyMailDatabaseStack

# Then secrets and networking
cdk destroy BearlyMailSecretsStack
cdk destroy BearlyMailNetworkingStack
```

**Note**: The RDS database has `removalPolicy: RETAIN`, so it won't be deleted even when destroying the database stack. Delete it manually if needed.






