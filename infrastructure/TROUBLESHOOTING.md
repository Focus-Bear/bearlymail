# Troubleshooting CDK Deployment

## Common Deployment Errors

### 1. "Cannot find module" or TypeScript errors

**Error**: `Cannot find module 'aws-cdk-lib'` or similar

**Solution**:
```bash
cd infrastructure
rm -rf node_modules package-lock.json
npm install
```

### 2. Docker build fails

**Error**: `Error: Cannot connect to the Docker daemon` or build errors

**Solutions**:
- Ensure Docker is running: `docker ps`
- Check Docker has enough resources allocated
- Try building the image manually:
  ```bash
  cd ..
  docker build -f server/Dockerfile -t bearlymail-test .
  ```

### 3. S3 bucket name conflicts

**Error**: `Bucket name already exists` or `Invalid bucket name`

**Solution**: The stack now auto-generates bucket names. If you still see this:
- Delete the old bucket manually
- Or change the stack name to get a new bucket name

### 4. Frontend build directory not found

**Error**: `ENOENT: no such file or directory '../client/build'`

**Solution**:
1. Build the frontend first:
   ```bash
   cd client
   npm install
   npm run build
   cd ../infrastructure
   npm run deploy
   ```

2. Or comment out the `FrontendDeployment` section in `lib/bearlymail-stack.ts` and deploy manually later

### 5. Certificate validation fails

**Error**: `Certificate validation failed` or DNS validation timeout

**Solution**:
- Ensure the hosted zone ID is correct
- Check that the domain is properly configured in Route53
- Certificate validation can take 5-30 minutes
- Check Route53 for the validation CNAME records

### 6. ECS task fails to start

**Error**: Service fails health checks or tasks keep restarting

**Solutions**:
1. Check CloudWatch logs:
   ```bash
   aws logs tail /ecs/bearlymail/web --follow
   ```

2. Verify secrets are configured:
   ```bash
   aws secretsmanager get-secret-value --secret-id <AppSecretsArn>
   ```

3. Check security groups allow traffic

4. Verify database is accessible from ECS tasks

### 6a. ResourceInitializationError: "invalid character '_' looking for beginning of value" (secrets)

**Error**: `ResourceInitializationError: unable to pull secrets or registry auth: execution resource retrieval failed: unable to retrieve secret from asm: ... invalid character '_' looking for beginning of value`

**Cause**: ECS reads secrets from AWS Secrets Manager and parses the value as **JSON** to extract keys (e.g. `ENCRYPTION_KEY`, `JWT_SECRET`). This error means the secret value is **not valid JSON** (e.g. plaintext, key=value, or edited in Console as "Plaintext" instead of JSON).

**Fix**:

1. Ensure **AppSecrets** (and any secret used with a key) is stored as valid JSON:
   - **Double quotes** for all keys and string values (single quotes are invalid in JSON).
   - No trailing commas, no unquoted keys or values.

2. Get the AppSecrets ARN from stack outputs, then set the secret value with valid JSON:
   ```bash
   APP_SECRETS_ARN=$(aws cloudformation describe-stacks --stack-name BearlyMailStack \
     --query 'Stacks[0].Outputs[?OutputKey==`AppSecretsArn`].OutputValue' --output text)

   aws secretsmanager put-secret-value \
     --secret-id "$APP_SECRETS_ARN" \
     --secret-string '{
       "ENCRYPTION_KEY": "your-32-char-encryption-key-here",
       "JWT_SECRET": "your-jwt-secret",
       "GOOGLE_CLIENT_ID": "your-google-client-id",
       "GOOGLE_CLIENT_SECRET": "your-google-client-secret",
       "GOOGLE_REDIRECT_URI": "https://your-domain/auth/google/callback",
       "GEMINI_API_KEY": "optional",
       "OPENAI_API_KEY": "optional",
       "ZOHO_CLIQ_BACKEND_BOT_WEBHOOK": "optional",
       "ZOHO_CLIQ_API_KEY": "optional",
       "ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL": "optional",
       "AWS_REGION": "ap-southeast-2",
       "SES_FROM_EMAIL": "noreply@your-domain.com"
     }'
   ```

3. If you edit in the AWS Console, use **"Key/value"** (or equivalent) and ensure the result is JSON, **not** "Plaintext" with a single string.

4. Validate JSON locally before updating:
   ```bash
   echo '{"ENCRYPTION_KEY":"x","JWT_SECRET":"y"}' | jq .   # should print the JSON
   ```

### 7. RDS connection errors

**Error**: `Connection refused` or `timeout`

**Solutions**:
- Check RDS security group allows ECS security group
- Verify database is in same VPC as ECS
- Check database credentials in Secrets Manager
- Ensure `DB_SSL=true` is set in task definition

### 8. CloudFront certificate must be in us-east-1

**Error**: `Certificate must be in us-east-1 region for CloudFront`

**Solution**: The stack automatically creates the certificate in us-east-1. If you see this:
- Ensure you're deploying to ap-southeast-2 (Sydney) for other resources
- The certificate will be created in us-east-1 automatically

### 9. Route53 hosted zone not found

**Error**: `Hosted zone not found` or `Invalid hosted zone ID`

**Solution**:
- Verify the hosted zone ID: `Z08919233O73NFKRK9QHU`
- Check the zone exists in Route53:
  ```bash
  aws route53 get-hosted-zone --id Z08919233O73NFKRK9QHU
  ```
- Ensure you have permissions to access the hosted zone

### 10. CDK bootstrap required

**Error**: `This stack uses assets, so the toolkit stack must be deployed`

**Solution**:
```bash
cdk bootstrap aws://YOUR-ACCOUNT-ID/ap-southeast-2
```

### 11. Insufficient permissions

**Error**: `Access Denied` or `UnauthorizedOperation`

**Solution**:
- Ensure your AWS credentials have necessary permissions
- Required permissions:
  - EC2 (VPC, Security Groups, etc.)
  - ECS (Cluster, Services, Tasks)
  - RDS (Database instances)
  - S3 (Buckets)
  - CloudFront (Distributions)
  - Route53 (Hosted zones, Records)
  - ACM (Certificates)
  - Secrets Manager
  - IAM (Roles, Policies)
  - CloudWatch (Logs)

## Debugging Steps

### 1. Check CDK synth

Before deploying, verify the template:
```bash
cdk synth
```

This will show any TypeScript or configuration errors.

### 2. Check CDK diff

See what will change:
```bash
cdk diff
```

### 3. Deploy with verbose logging

```bash
cdk deploy --verbose
```

### 4. Check CloudFormation events

```bash
aws cloudformation describe-stack-events \
  --stack-name BearlyMailStack \
  --max-items 20
```

### 5. Check specific resource status

```bash
# ECS services
aws ecs describe-services \
  --cluster BearlyMailCluster \
  --services WebService WorkerService

# RDS instance
aws rds describe-db-instances \
  --db-instance-identifier BearlyMailStack-Database*

# CloudFront distribution
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='BearlyMail frontend distribution']"
```

## Manual Fixes

### Skip frontend deployment

If the frontend build is causing issues, comment out the `FrontendDeployment` section and deploy manually:

```bash
# After deployment, deploy frontend manually
cd client
npm run build
aws s3 sync build/ s3://<bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

### Deploy without custom domain

Temporarily remove domain configuration from `bin/app.ts`:

```typescript
new BearlyMailStack(app, 'BearlyMailStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-southeast-2',
  },
  description: 'BearlyMail - ADHD-friendly email client infrastructure',
  // domainName: 'bearlymail.com',
  // hostedZoneId: 'Z08919233O73NFKRK9QHU',
});
```

Then add the domain later once the base infrastructure is working.

## Getting Help

1. Check CloudWatch logs for detailed error messages
2. Review CloudFormation stack events
3. Check AWS service health dashboards
4. Verify all prerequisites are met (Docker, Node.js, AWS CLI)






