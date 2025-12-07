# BearlyMail AWS Infrastructure

AWS CDK infrastructure for deploying BearlyMail to AWS.

## Architecture

- **ECS Fargate**: Backend services (web API, workers, cron jobs)
- **RDS PostgreSQL**: Database
- **S3 + CloudFront**: Frontend React app
- **Secrets Manager**: Secure storage for secrets
- **Application Load Balancer**: Routes traffic to ECS services
- **EventBridge**: Scheduled cron jobs

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

3. **Configure secrets** in AWS Secrets Manager:
   
   After deploying, you'll need to add secrets to the `AppSecrets` secret:
   ```bash
   # Get the secret ARN from stack outputs
   aws secretsmanager get-secret-value --secret-id <AppSecretsArn>
   
   # Update the secret with your values
   aws secretsmanager put-secret-value \
     --secret-id <AppSecretsArn> \
     --secret-string '{
       "ENCRYPTION_KEY": "your-32-character-encryption-key",
       "JWT_SECRET": "your-jwt-secret",
       "GOOGLE_CLIENT_ID": "your-google-client-id",
       "GOOGLE_CLIENT_SECRET": "your-google-client-secret",
       "GOOGLE_REDIRECT_URI": "https://your-cloudfront-url/auth/google/callback",
       "GEMINI_API_KEY": "your-gemini-api-key",
       "OPENAI_API_KEY": "your-openai-api-key"
     }'
   ```

## Deployment

1. **Build the frontend**:
   ```bash
   cd ../client
   npm install
   npm run build
   ```

2. **Deploy the stack**:
   ```bash
   cd ../infrastructure
   npm run deploy
   ```

   Or deploy a specific stack:
   ```bash
   npm run deploy:stack
   ```

3. **View differences** before deploying:
   ```bash
   npm run diff
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

To destroy the stack:
```bash
cdk destroy
```

**Note**: The RDS database has `removalPolicy: RETAIN`, so it won't be deleted. Delete it manually if needed.

