# Quick Setup Guide

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js** 18+ and npm
4. **Docker** installed and running
5. **AWS CDK CLI**: `npm install -g aws-cdk`

## Step 1: Bootstrap CDK (One-time)

```bash
cdk bootstrap aws://YOUR-ACCOUNT-ID/ap-southeast-2
```

Replace `YOUR-ACCOUNT-ID` with your AWS account ID.

## Step 2: Install Dependencies

```bash
cd infrastructure
npm install
```

## Step 3: Build Frontend

```bash
cd ../client
npm install
npm run build
```

## Step 4: Deploy Infrastructure

```bash
cd ../infrastructure
npm run deploy
```

This will:
- Create VPC, subnets, security groups
- Create RDS PostgreSQL database
- Create ECS cluster and services
- Create S3 bucket and CloudFront distribution
- Create Secrets Manager secrets
- Set up Application Load Balancer

**Note**: First deployment takes ~15-20 minutes.

## Step 5: Configure Secrets

After deployment, get the secret ARNs from stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AppSecretsArn`].OutputValue' \
  --output text
```

Then update the secrets:

```bash
# Generate encryption key (32+ characters)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Update secrets
aws secretsmanager put-secret-value \
  --secret-id <AppSecretsArn> \
  --secret-string "{
    \"ENCRYPTION_KEY\": \"${ENCRYPTION_KEY}\",
    \"JWT_SECRET\": \"${JWT_SECRET}\",
    \"GOOGLE_CLIENT_ID\": \"your-google-client-id\",
    \"GOOGLE_CLIENT_SECRET\": \"your-google-client-secret\",
    \"GOOGLE_REDIRECT_URI\": \"https://your-cloudfront-url/auth/google/callback\",
    \"GEMINI_API_KEY\": \"your-gemini-api-key\",
    \"OPENAI_API_KEY\": \"your-openai-api-key\"
  }"
```

## Step 6: Update Frontend API URL

Before deploying the frontend, update the API URL:

1. Get the Load Balancer DNS from stack outputs:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name BearlyMailStack \
     --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
     --output text
   ```

2. Update `client/.env.production`:
   ```bash
   REACT_APP_API_URL=http://<LoadBalancerDNS>
   ```

3. Rebuild frontend:
   ```bash
   cd client
   npm run build
   ```

4. Redeploy frontend:
   ```bash
   cd ../infrastructure
   npm run deploy
   ```

## Step 7: Run Database Migrations

Create a temporary ECS task to run migrations:

```bash
# Get database endpoint and secret
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

# Get credentials
DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET_ARN \
  --query SecretString \
  --output text)

# Extract username and password
DB_USERNAME=$(echo $DB_CREDS | jq -r '.username')
DB_PASSWORD=$(echo $DB_CREDS | jq -r '.password')

# Run migrations (you'll need to set up a way to run this)
# Option 1: Use AWS Systems Manager Session Manager
# Option 2: Create a temporary ECS task
# Option 3: Use a bastion host
# Option 4: Run locally with VPN/tunnel
```

## Step 8: Verify Deployment

1. **Check ECS services**:
   ```bash
   aws ecs list-services --cluster BearlyMailCluster
   ```

2. **Check service health**:
   ```bash
   aws ecs describe-services \
     --cluster BearlyMailCluster \
     --services WebService WorkerService
   ```

3. **Check logs**:
   ```bash
   aws logs tail /ecs/bearlymail/web --follow
   ```

4. **Test API**:
   ```bash
   curl http://<LoadBalancerDNS>/health
   ```

5. **Test frontend**:
   Open CloudFront URL in browser (from stack outputs)

## Troubleshooting

### Services won't start
- Check CloudWatch logs: `/ecs/bearlymail/web` and `/ecs/bearlymail/worker`
- Verify secrets are configured correctly
- Check security group rules allow traffic
- Verify database is accessible from ECS tasks

### Database connection errors
- Verify RDS security group allows ECS security group
- Check database credentials in Secrets Manager
- Verify database is in same VPC as ECS

### Frontend not loading
- Check S3 bucket has files: `aws s3 ls s3://<bucket-name>`
- Verify CloudFront distribution is deployed
- Check CloudFront cache invalidation
- Verify OAI is configured

## Next Steps

- Set up CI/CD pipeline for automated deployments
- Configure custom domain for CloudFront
- Set up SSL certificate for HTTPS
- Enable Multi-AZ for production
- Set up monitoring and alerts
- Configure backup retention policies


