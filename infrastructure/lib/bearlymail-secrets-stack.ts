import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Application secrets only. Database secret lives in BearlyMailDatabaseStack
 * to avoid a cyclic dependency (RDS attaches the secret to the instance,
 * which would create SecretsStack -> DatabaseStack while DatabaseStack -> SecretsStack).
 */
export class BearlyMailSecretsStack extends cdk.Stack {
  public readonly appSecrets: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // Application Secrets
    // ============================================
    this.appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      description: 'Application secrets (JWT, encryption keys, API keys)',
    });

    // IMPORTANT: AppSecrets must be valid JSON (double-quoted keys and values).
    // ECS parses the secret as JSON to inject env vars. Plaintext or key=value format
    // causes "invalid character '_' looking for beginning of value". Use put-secret-value
    // with --secret-string '{"KEY":"value",...}' or Console "Key/value", not Plaintext.
    // Note: You'll need to manually add these secrets to AppSecrets:
    // - ENCRYPTION_KEY (32+ character string)
    // - JWT_SECRET (random string)
    // - GOOGLE_CLIENT_ID
    // - GOOGLE_CLIENT_SECRET
    // - GOOGLE_REDIRECT_URI
    // - GITHUB_APP_CLIENT_ID (GitHub OAuth app client ID)
    // - GITHUB_APP_CLIENT_SECRET (GitHub OAuth app client secret)
    // - GITHUB_APP_REDIRECT_URI (GitHub OAuth callback URL, e.g. https://api.app.bearlymail.com/github/callback)
    // - GEMINI_API_KEY (optional)
    // - OPENAI_API_KEY (optional)
    // - ZOHO_CLIQ_BACKEND_BOT_WEBHOOK (Cliq webhook URL)
    // - ZOHO_CLIQ_API_KEY (Cliq API key)
    // - ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL (Cliq channel name)
    // - AWS_REGION (AWS region for SES, e.g., 'ap-southeast-2')
    // - SES_FROM_EMAIL (Verified SES email address for sending emails)
    // - POSTHOG_API_KEY (PostHog project API key for backend error tracking)
    //
    // Queue Dashboard secrets (for the @pg-boss/dashboard ECS service):
    // - PGBOSS_DASHBOARD_DATABASE_URL  Full PostgreSQL connection URL, e.g.:
    //     postgresql://bearlymail:<password>@<rds-endpoint>:5432/bearlymail?sslmode=require
    //   (retrieve the password from the DatabaseSecret in Secrets Manager, URL-encode any special chars)
    // - PGBOSS_DASHBOARD_AUTH_USERNAME  Basic auth username for the queue dashboard UI
    // - PGBOSS_DASHBOARD_AUTH_PASSWORD  Basic auth password for the queue dashboard UI

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'AppSecretsArn', {
      value: this.appSecrets.secretArn,
      description: 'Application secrets ARN',
      exportName: 'BearlyMail-App-Secrets-ARN',
    });
  }
}
