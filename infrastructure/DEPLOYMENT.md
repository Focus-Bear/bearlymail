# Deployment Guide

## Stack Structure

The infrastructure is split into **4 CDK stacks** for modularity and faster deployments:

1. **BearlyMailNetworkingStack**: VPC, Route53, SSL Certificate (~5-10 min)
2. **BearlyMailSecretsStack**: Secrets Manager for credentials (~1 min)
3. **BearlyMailDatabaseStack**: RDS PostgreSQL (~10-15 min)
4. **BearlyMailStack**: ECS, S3, CloudFront, ALB (~5-8 min)

**Benefits**:
- Database and secrets deploy once and rarely change
- Fast iteration on application stack without redeploying database
- Safer updates with clear separation of concerns

## Initial Setup

1. **Install CDK globally**:
   ```bash
   npm install -g aws-cdk
   ```

2. **Install dependencies**:
   ```bash
   cd infrastructure
   npm install
   ```

3. **Bootstrap CDK** (one-time setup per account/region):
   ```bash
   cdk bootstrap aws://YOUR-ACCOUNT-ID/ap-southeast-2
   ```

## First Deployment

### Option 1: Deploy All Stacks at Once

```bash
cd infrastructure
cdk deploy --all
```

This deploys all 4 stacks in dependency order. Total time: ~20-30 minutes.

### Option 2: Deploy Individually (Recommended for First Time)

Deploy stacks one at a time to see progress:

```bash
# 1. Networking (VPC, certificate) - ~5-10 minutes
cdk deploy BearlyMailNetworkingStack

# 2. Secrets (empty secrets) - ~1 minute
cdk deploy BearlyMailSecretsStack

# 3. Database (RDS) - ~10-15 minutes
cdk deploy BearlyMailDatabaseStack

# 4. Application (ECS, CloudFront) - ~5-8 minutes
# This will fail initially because secrets aren't configured yet
cdk deploy BearlyMailStack
```

## Configure Secrets

After deploying the secrets and database stacks, configure the application secrets:

```bash
# Get the AppSecrets ARN
APP_SECRETS_ARN=$(aws cloudformation describe-stacks --stack-name BearlyMailSecretsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AppSecretsArn`].OutputValue' --output text)

# Update with your values (MUST be valid JSON - double quotes required!)
aws secretsmanager put-secret-value \
  --secret-id "$APP_SECRETS_ARN" \
  --secret-string '{
    "ENCRYPTION_KEY": "generate-32-char-key-here",
    "JWT_SECRET": "generate-random-string",
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

**CRITICAL**: The secret value MUST be valid JSON:
- Use **double quotes** for keys and string values (not single quotes)
- No trailing commas
- No unquoted keys or values

If you get `ResourceInitializationError: invalid character '_'`, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) section 6a.

### Generate Secure Keys

```bash
# Generate ENCRYPTION_KEY (32 characters)
openssl rand -hex 16

# Generate JWT_SECRET
openssl rand -base64 32
```

## Run Database Migrations

After secrets are configured and the application stack is deployed:

```bash
# Get database credentials
DB_SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BearlyMailDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' --output text)

DB_ENDPOINT=$(aws cloudformation describe-stacks --stack-name BearlyMailDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' --output text)

DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --query SecretString \
  --output text)

# Extract username and password from JSON
DB_USERNAME=$(echo "$DB_CREDS" | jq -r .username)
DB_PASSWORD=$(echo "$DB_CREDS" | jq -r .password)

# Set environment variables and run migrations
export DB_HOST="$DB_ENDPOINT"
export DB_USERNAME="$DB_USERNAME"
export DB_PASSWORD="$DB_PASSWORD"
export DB_NAME=bearlymail
export DB_PORT=5432
export DB_SSL=true

cd ../server
npm run migration:run
```

## Iterative Development

Once initial stacks are deployed, you can iterate quickly:

### Updating Application Code (ECS Services)

When you change server code, only redeploy the application stack:

```bash
# This rebuilds Docker image and updates ECS services (~5-8 minutes)
cdk deploy BearlyMailStack
```

The database and secrets stacks don't need to be redeployed.

### Updating Frontend

```bash
cd client
npm run build

# Get bucket name
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text)

# Upload
aws s3 sync build/ "s3://$BUCKET_NAME" --delete

# Invalidate CloudFront cache
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='BearlyMail frontend distribution'].Id" \
  --output text)

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

### Updating Database Schema

1. Create migration locally
2. Deploy to RDS (via migrations or ECS task)
3. No need to redeploy database stack unless changing instance type/config

## Updating the Application

### Backend (ECS)

1. **Build and push Docker image** (if using ECR):
   ```bash
   # Create ECR repository (one-time)
   aws ecr create-repository --repository-name bearlymail-server
   
   # Build and push
   cd server
   docker build -t bearlymail-server .
   docker tag bearlymail-server:latest <account-id>.dkr.ecr.ap-southeast-2.amazonaws.com/bearlymail-server:latest
   aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-southeast-2.amazonaws.com
   docker push <account-id>.dkr.ecr.ap-southeast-2.amazonaws.com/bearlymail-server:latest
   ```

2. **Update ECS service**:
   ```bash
   aws ecs update-service \
     --cluster BearlyMailCluster \
     --service WebService \
     --force-new-deployment
   ```

### Frontend (S3 + CloudFront)

1. **Build React app**:
   ```bash
   cd client
   npm run build
   ```

2. **Deploy to S3**:
   ```bash
   aws s3 sync build/ s3://<FrontendBucketName> --delete
   ```

3. **Invalidate CloudFront cache**:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id <DistributionId> \
     --paths "/*"
   ```

## Environment-Specific Configuration

### Development
- Smaller instance sizes
- Single AZ
- No Multi-AZ
- Lower desired count

### Production
- Larger instance sizes
- Multi-AZ RDS
- Multiple ECS tasks
- Higher desired count
- Enable deletion protection on RDS
- Enable WAF on CloudFront

## Monitoring

### View Logs
```bash
# Web service logs
aws logs tail /ecs/bearlymail/web --follow

# Worker logs
aws logs tail /ecs/bearlymail/worker --follow
```

### Check Service Health
```bash
aws ecs describe-services \
  --cluster BearlyMailCluster \
  --services WebService WorkerService
```

### Database Metrics
- Check RDS Performance Insights in AWS Console
- Monitor CloudWatch metrics for RDS

## Scaling

### Horizontal Scaling (More Tasks)
```bash
aws ecs update-service \
  --cluster BearlyMailCluster \
  --service WebService \
  --desired-count 3
```

### Vertical Scaling (More CPU/Memory)
Update the task definition in `lib/bearlymail-stack.ts` and redeploy.

### Database Scaling
- Increase instance size in RDS console
- Or update stack and redeploy

## Troubleshooting

### Service Won't Start
1. Check CloudWatch logs
2. Verify secrets are configured
3. Check security group rules
4. Verify database connectivity

### Database Connection Issues
1. Check security group allows ECS → RDS
2. Verify database credentials in Secrets Manager
3. Check RDS is in same VPC as ECS

### Frontend Not Loading
1. Check S3 bucket has files
2. Verify CloudFront distribution is deployed
3. Check CloudFront cache invalidation
4. Verify OAI is configured correctly

## Cost Management

### Estimated Monthly Costs (Sydney region)
- ECS Fargate (web + worker): ~$30-50
- RDS T3.micro: ~$15-20
- ALB: ~$20
- CloudFront: ~$5-10 (depends on traffic)
- S3: ~$1-2
- NAT Gateway: ~$35
- **Total**: ~$100-120/month

### Cost Optimization Tips
- Use Spot instances for non-critical workloads
- Enable RDS automated backups only if needed
- Use CloudFront price class 100 (cheapest)
- Consider Reserved Instances for RDS if long-term
- Monitor and right-size instances






