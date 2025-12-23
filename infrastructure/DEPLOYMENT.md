# Deployment Guide

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

1. **Build frontend**:
   ```bash
   cd ../client
   npm install
   npm run build
   ```

2. **Deploy infrastructure**:
   ```bash
   cd ../infrastructure
   npm run deploy
   ```

3. **Configure secrets**:
   
   After deployment, get the secret ARNs from stack outputs:
   ```bash
   aws cloudformation describe-stacks --stack-name BearlyMailStack --query 'Stacks[0].Outputs'
   ```
   
   Then update the AppSecrets:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id <AppSecretsArn> \
     --secret-string '{
       "ENCRYPTION_KEY": "generate-32-char-key-here",
       "JWT_SECRET": "generate-random-string",
       "GOOGLE_CLIENT_ID": "your-google-client-id",
       "GOOGLE_CLIENT_SECRET": "your-google-client-secret",
       "GOOGLE_REDIRECT_URI": "https://your-cloudfront-url/auth/google/callback",
       "GEMINI_API_KEY": "your-gemini-api-key",
       "OPENAI_API_KEY": "your-openai-api-key"
     }'
   ```

4. **Run database migrations**:
   
   Connect to the database and run migrations. You can do this by:
   - Creating a temporary ECS task
   - Using AWS Systems Manager Session Manager
   - Or running locally with VPN/bastion host
   
   ```bash
   # Get database credentials
   aws secretsmanager get-secret-value --secret-id <DatabaseSecretArn> --query SecretString --output text
   
   # Set environment variables
   export DB_HOST=<database-endpoint>
   export DB_USERNAME=<username>
   export DB_PASSWORD=<password>
   export DB_NAME=bearlymail
   export DB_SSL=true
   
   # Run migrations
   cd ../server
   npm run migration:run
   ```

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






