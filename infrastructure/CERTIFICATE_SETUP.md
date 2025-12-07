# SSL Certificate Setup for CloudFront

CloudFront requires SSL certificates to be in the **us-east-1** region, but our stack is deployed in **ap-southeast-2**. 

## Option 1: Manual Certificate Creation (Recommended for First Deployment)

1. **Create certificate in us-east-1**:
   ```bash
   aws acm request-certificate \
     --domain-name bearlymail.com \
     --subject-alternative-names www.bearlymail.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Get the certificate ARN** from the output

3. **Update the CDK stack** to import the certificate:
   
   In `lib/bearlymail-stack.ts`, replace the certificate creation with:
   ```typescript
   certificate = certificatemanager.Certificate.fromCertificateArn(
     this, 
     'CloudFrontCertificate', 
     'arn:aws:acm:us-east-1:YOUR-ACCOUNT-ID:certificate/YOUR-CERT-ID'
   );
   ```

4. **Validate the certificate** by adding the DNS validation records to Route53 (they'll be shown in the ACM console)

5. **Redeploy** the stack

## Option 2: Use Existing Certificate

If you already have a certificate in us-east-1:

1. **Get the certificate ARN**:
   ```bash
   aws acm list-certificates --region us-east-1
   ```

2. **Update the CDK stack** to import it (same as Option 1, step 3)

## Option 3: Automatic Cross-Region Certificate (Advanced)

For automatic certificate creation, you'll need to:
1. Create a Lambda function in us-east-1
2. Use it as a custom resource in your CDK stack
3. This is more complex but fully automated

For now, Option 1 is the simplest approach.

## After Certificate is Ready

Once the certificate is validated and imported, the CloudFront distribution will:
- Use HTTPS for all requests
- Redirect HTTP to HTTPS
- Work with your custom domain (bearlymail.com)

## Troubleshooting

### Certificate validation pending
- Check Route53 for the validation CNAME records
- Ensure they're added to the correct hosted zone
- Wait 5-30 minutes for validation

### Certificate not found
- Verify the certificate ARN is correct
- Check the certificate is in us-east-1 region
- Ensure you have permissions to access the certificate

