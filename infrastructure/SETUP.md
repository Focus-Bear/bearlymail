# Quick Setup Guide

This guide will get you from zero to deployed in about 30 minutes.

## Overview

The infrastructure consists of 4 CDK stacks:
1. **Networking**: VPC, Route53, SSL (~5-10 min)
2. **Secrets**: Empty secrets placeholders (~1 min)
3. **Database**: RDS PostgreSQL (~10-15 min)
4. **Application**: ECS, S3, CloudFront (~5-8 min)

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

## Step 3: Deploy Infrastructure

Deploy all stacks:

```bash
# Deploy all at once (recommended)
cdk deploy --all
```

Or deploy individually to see progress:

```bash
cdk deploy BearlyMailNetworkingStack  # VPC, certificate
cdk deploy BearlyMailSecretsStack      # Empty secrets
cdk deploy BearlyMailDatabaseStack     # RDS PostgreSQL
cdk deploy BearlyMailStack             # ECS, CloudFront (will fail - that's OK!)
```

**Note**: The application stack will initially fail because secrets aren't configured yet. Continue to next step.

## Step 4: Configure Secrets

Get the AppSecrets ARN:

```bash
APP_SECRETS_ARN=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailSecretsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AppSecretsArn`].OutputValue' \
  --output text)
```

Generate secure keys:

```bash
ENCRYPTION_KEY=$(openssl rand -hex 16)  # 32 characters
JWT_SECRET=$(openssl rand -base64 32)
```

Update secrets (MUST be valid JSON with double quotes):

```bash
aws secretsmanager put-secret-value \
  --secret-id "$APP_SECRETS_ARN" \
  --secret-string "{
    \"ENCRYPTION_KEY\": \"${ENCRYPTION_KEY}\",
    \"JWT_SECRET\": \"${JWT_SECRET}\",
    \"GOOGLE_CLIENT_ID\": \"your-google-client-id\",
    \"GOOGLE_CLIENT_SECRET\": \"your-google-client-secret\",
    \"GOOGLE_REDIRECT_URI\": \"https://app.bearlymail.com/auth/google/callback\",
    \"GEMINI_API_KEY\": \"\",
    \"OPENAI_API_KEY\": \"\",
    \"ZOHO_CLIQ_BACKEND_BOT_WEBHOOK\": \"\",
    \"ZOHO_CLIQ_API_KEY\": \"\",
    \"ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL\": \"\",
    \"AWS_REGION\": \"ap-southeast-2\",
    \"SES_FROM_EMAIL\": \"noreply@bearlymail.com\"
  }"
```

**IMPORTANT**: If you get `ResourceInitializationError: invalid character '_'`, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) section 6a.

## Step 5: Redeploy Application Stack

Now that secrets are configured, redeploy:

```bash
cdk deploy BearlyMailStack
```

This should now succeed (~5-8 minutes).

## Step 6: Run Database Migrations

Get database connection info:

```bash
# Get database endpoint
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

# Get database secret ARN (from Database stack)
DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BearlyMailDatabaseStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecretArn`].OutputValue' \
  --output text)

# Get credentials
DB_CREDS=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --query SecretString \
  --output text)

# Extract username and password
DB_USERNAME=$(echo "$DB_CREDS" | jq -r '.username')
DB_PASSWORD=$(echo "$DB_CREDS" | jq -r '.password')
```

Run migrations:

```bash
cd ../server

export DB_HOST="$DB_ENDPOINT"
export DB_USERNAME="$DB_USERNAME"
export DB_PASSWORD="$DB_PASSWORD"
export DB_NAME=bearlymail
export DB_PORT=5432
export DB_SSL=true

npm run migration:run
```

## Step 7: Get Application URLs

```bash
# Get CloudFront URL
aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text

# Get API Load Balancer URL
aws cloudformation describe-stacks \
  --stack-name BearlyMailStack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text
```

## What's Next?

- **Deploy frontend**: Build and upload React app to S3
- **Configure Google OAuth**: Set up OAuth credentials in Google Console
- **Set up SES**: Verify email addresses in AWS SES
- **Monitor logs**: Check CloudWatch logs at `/ecs/bearlymail/web`

## Iterating During Development

Once deployed, you can iterate quickly:

```bash
# Only redeploy application (not database/secrets)
cdk deploy BearlyMailStack  # ~5-8 minutes

# View what will change before deploying
cdk diff BearlyMailStack
```

## Troubleshooting

- **ECS task fails with "invalid character '_'"**: See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) section 6a - your secret is not valid JSON
- **Certificate validation stuck**: DNS propagation can take 5-30 minutes
- **Database connection timeout**: Check security groups allow ECS → RDS traffic
- **CloudWatch logs**: `aws logs tail /ecs/bearlymail/web --follow`

For more detailed troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
