import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as config from 'aws-cdk-lib/aws-config';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface BearlyMailStackProps extends cdk.StackProps {
  // Optional: allow overriding defaults
  webTaskCpu?: number;
  webTaskMemory?: number;
  workerTaskCpu?: number;
  workerTaskMemory?: number;
  // Networking resources (from BearlyMailNetworkingStack)
  vpc: ec2.IVpc;
  certificateArn?: string; // ACM certificate ARN from us-east-1 for CloudFront
  hostedZone?: route53.IHostedZone;
  domainName?: string; // Domain name for CloudFront
  apiDomainName?: string; // API domain (e.g. api.app.bearlymail.com) for ALB HTTPS + Route53
  apiCertificateArn?: string; // ACM certificate ARN for API domain (from networking stack, same region as ALB)
  queueDashboardDomainName?: string; // Queue dashboard domain (e.g. queue.api.app.bearlymail.com)
  queueDashboardCertificateArn?: string; // ACM certificate ARN for queue dashboard domain
  // Database and Secrets (from other stacks)
  database: rds.IDatabaseInstance;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
  /**
   * Context analysis SQS queue (from BearlyMailContextAnalysisStack).
   * AppStack calls grantSendMessages(taskRole) and injects queueUrl into container environments.
   */
  contextAnalysisQueue: sqs.Queue;
  /**
   * Email prioritisation SQS queue (from BearlyMailEmailPrioritisationStack).
   * AppStack calls grantSendMessages(taskRole) and injects queueUrl into container environments.
   */
  emailPrioritisationQueue?: sqs.Queue;
  /** RDS Proxy endpoint — used as DB_HOST for all ECS containers */
  rdsProxyEndpoint: string;
  /** RDS Proxy security group (from BearlyMailDatabaseStack) — ecsSecurityGroup ingress rule added here */
  rdsProxySecurityGroup: ec2.ISecurityGroup;
}

export class BearlyMailStack extends cdk.Stack {
  /** ECS task role — shared with BearlyMailContextAnalysisStack to grant SQS send permissions */
  public readonly ecsTaskRole: iam.Role;

  constructor(scope: Construct, id: string, props: BearlyMailStackProps) {
    super(scope, id, props);

    // ============================================
    // Validate required props
    // ============================================
    if (!props.vpc) {
      throw new Error('VPC must be provided from BearlyMailNetworkingStack');
    }
    if (!props.database) {
      throw new Error('Database must be provided from BearlyMailDatabaseStack');
    }
    if (!props.dbSecret) {
      throw new Error('Database secret must be provided from BearlyMailSecretsStack');
    }
    if (!props.appSecrets) {
      throw new Error('Application secrets must be provided from BearlyMailSecretsStack');
    }

    const vpc = props.vpc;
    const database = props.database;
    const dbSecret = props.dbSecret;
    const appSecrets = props.appSecrets;

    // ============================================
    // ECS Security Group
    //
    // Created here (not in DatabaseStack) to prevent a CDK dependency cycle.
    // ApplicationLoadBalancedFargateService auto-adds an ALB→ECS ingress rule;
    // if the security group were in DatabaseStack that rule would create an
    // implicit DatabaseStack→BearlyMailStack reference, cycling with the
    // explicit BearlyMailStack→DatabaseStack dependency.
    //
    // The RDS Proxy ingress rule is added via CfnSecurityGroupIngress (below)
    // so it stays in this stack and only creates the safe direction:
    // BearlyMailStack→DatabaseStack.
    // ============================================
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks (web, worker, cron) - allows RDS Proxy access',
      allowAllOutbound: true,
    });

    // Allow ECS tasks to connect to the RDS Proxy.
    // Using CfnSecurityGroupIngress keeps the resource in this stack
    // (BearlyMailStack references rdsProxySecurityGroup from DatabaseStack —
    // already the safe direction). If we called rdsProxySecurityGroup.addIngressRule()
    // instead, CDK would place the rule in DatabaseStack referencing our ALB SG,
    // recreating the cycle.
    new ec2.CfnSecurityGroupIngress(this, 'EcsToRdsProxyIngress', {
      groupId: props.rdsProxySecurityGroup.securityGroupId,
      sourceSecurityGroupId: ecsSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Allow ECS tasks to connect via RDS Proxy',
    });

    // ============================================
    // ECS Cluster
    // ============================================
    const cluster = new ecs.Cluster(this, 'BearlyMailCluster', {
      vpc,
      enableFargateCapacityProviders: true,
    });

    // ============================================
    // ECS Task Execution Role
    // ============================================
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant access to secrets
    dbSecret.grantRead(taskExecutionRole);
    appSecrets.grantRead(taskExecutionRole);

    // ============================================
    // ECS Task Role (for application permissions)
    // ============================================
    this.ecsTaskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    const taskRole = this.ecsTaskRole;

    // Grant SES permissions for sending emails
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'], // In production, restrict to specific verified email addresses
    }));

    // Grant CloudWatch permissions for publishing metrics
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'],
    }));

    // Grant SQS send permissions for context analysis queue
    props.contextAnalysisQueue.grantSendMessages(taskRole);

    // Grant SQS send permissions for email prioritisation queue (optional for backward compat)
    props.emailPrioritisationQueue?.grantSendMessages(taskRole);

    // ============================================
    // Feedback Screenshots Bucket (private, AV-scanned via GuardDuty)
    // ============================================
    const feedbackScreenshotsBucket = new s3.Bucket(this, 'FeedbackScreenshotsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          // Auto-delete screenshots after 90 days (feedback data retention)
          expiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Grant ECS task role access to the screenshots bucket
    feedbackScreenshotsBucket.grantPut(taskRole);
    feedbackScreenshotsBucket.grantRead(taskRole);
    feedbackScreenshotsBucket.grantDelete(taskRole);
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObjectTagging'],
      resources: [feedbackScreenshotsBucket.arnForObjects('*')],
    }));

    // ============================================
    // GuardDuty Malware Protection for S3 (GAP-1)
    //
    // GuardDuty scans every uploaded object and tags it:
    //   GuardDutyMalwareScanStatus = NO_THREATS_FOUND | THREATS_FOUND | UNSUPPORTED | FAILED
    //
    // Prerequisite: GuardDuty must be enabled in the AWS account before deploying.
    //   aws guardduty create-detector --enable --region <region>
    // ============================================
    const guardDutyMalwareRole = new iam.Role(this, 'GuardDutyMalwareProtectionRole', {
      assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
      description: 'Allows GuardDuty Malware Protection to read objects and write scan tags',
    });

    guardDutyMalwareRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:PutObjectTagging',
        's3:GetObjectTagging',
      ],
      resources: [feedbackScreenshotsBucket.arnForObjects('*')],
    }));

    guardDutyMalwareRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket', 's3:GetBucketLocation'],
      resources: [feedbackScreenshotsBucket.bucketArn],
    }));

    new guardduty.CfnMalwareProtectionPlan(this, 'FeedbackScreenshotsMalwareProtectionPlan', {
      role: guardDutyMalwareRole.roleArn,
      protectedResource: {
        s3Bucket: {
          bucketName: feedbackScreenshotsBucket.bucketName,
          objectPrefixes: ['feedback/'],
        },
      },
      actions: {
        tagging: { status: 'ENABLED' },
      },
    });

    // ============================================
    // Lambda: Delete malicious files detected by GuardDuty
    // ============================================
    const avScanRemediationFn = new lambdaNodejs.NodejsFunction(this, 'AvScanRemediationFunction', {
      entry: path.join(__dirname, '../lambda/av-scan/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: 'Deletes S3 objects flagged as malware by GuardDuty Malware Protection',
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Allow the Lambda to delete objects from the screenshots bucket
    feedbackScreenshotsBucket.grantDelete(avScanRemediationFn);

    // EventBridge rule: trigger Lambda on GuardDuty Malware:S3/* findings
    const guardDutyMalwareRule = new events.Rule(this, 'GuardDutyMalwareRule', {
      description: 'Trigger remediation Lambda when GuardDuty detects malware in S3',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
        detail: {
          type: [{ prefix: 'Malware:S3/' }],
        },
      },
    });

    guardDutyMalwareRule.addTarget(new targets.LambdaFunction(avScanRemediationFn, {
      retryAttempts: 2,
    }));

    new cdk.CfnOutput(this, 'FeedbackScreenshotsBucketName', {
      value: feedbackScreenshotsBucket.bucketName,
      description: 'Feedback screenshots S3 bucket (set FEEDBACK_SCREENSHOTS_BUCKET to this value)',
      exportName: 'BearlyMail-Feedback-Screenshots-Bucket',
    });

    // ============================================
    // Log Groups
    // ============================================
    // 90-day retention satisfies GDPR audit requirements while keeping
    // CloudWatch costs reasonable (logs.RetentionDays.THREE_MONTHS = 90 days).
    const LOG_RETENTION = logs.RetentionDays.THREE_MONTHS;

    const webLogGroup = new logs.LogGroup(this, 'WebLogGroup', {
      logGroupName: '/ecs/bearlymail/web',
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: '/ecs/bearlymail/worker',
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dashboardLogGroup = new logs.LogGroup(this, 'QueueDashboardLogGroup', {
      logGroupName: '/ecs/bearlymail/queue-dashboard',
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================
    // ECR Repository for server images
    // ============================================
    // The ECR repository is created by the CI/CD pipeline (if it doesn't exist)
    // and images are pushed with the 'latest' tag. Task definitions always
    // reference 'latest', so CDK doesn't need to recreate them on every deploy.
    // To deploy new code: push a new image to ECR, then restart ECS services.
    const repository = ecr.Repository.fromRepositoryName(this, 'ServerRepository', 'bearlymail/server');
    const serverImage = ecs.ContainerImage.fromEcrRepository(repository, 'latest');

    // ============================================
    // Web Service (NestJS API)
    // ============================================
    const webTaskDefinition = new ecs.FargateTaskDefinition(this, 'WebTaskDefinition', {
      cpu: props?.webTaskCpu || 512,
      memoryLimitMiB: props?.webTaskMemory || 1024,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    // Derive FRONTEND_URL from the domainName prop (e.g. app.bearlymail.com -> https://app.bearlymail.com)
    const frontendUrl = props?.domainName ? `https://${props.domainName}` : 'http://localhost:3000';

    const webContainer = webTaskDefinition.addContainer('WebContainer', {
      image: serverImage,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'web',
        logGroup: webLogGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3001',
        FRONTEND_URL: frontendUrl,
        DB_HOST: props.rdsProxyEndpoint,
        DB_PORT: '5432',
        DB_NAME: 'bearlymail',
        DB_SSL: 'true',
        CONTEXT_ANALYSIS_SQS_QUEUE_URL: props.contextAnalysisQueue.queueUrl,
        EMAIL_PRIORITISATION_SQS_QUEUE_URL: props.emailPrioritisationQueue?.queueUrl ?? '',
        FEEDBACK_SCREENSHOTS_BUCKET: feedbackScreenshotsBucket.bucketName,
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ENCRYPTION_KEY'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'JWT_SECRET'),
        GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_SECRET'),
        GOOGLE_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_REDIRECT_URI'),
        GITHUB_APP_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_ID'),
        GITHUB_APP_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_SECRET'),
        GITHUB_APP_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_REDIRECT_URI'),
        GEMINI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'GEMINI_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        ZOHO_CLIQ_BACKEND_BOT_WEBHOOK: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BACKEND_BOT_WEBHOOK'),
        ZOHO_CLIQ_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_API_KEY'),
        ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL'),
        POSTHOG_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'POSTHOG_API_KEY'),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'node -e "require(\'http\').get(\'http://localhost:3001/health\', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    webContainer.addPortMappings({
      containerPort: 3001,
      protocol: ecs.Protocol.TCP,
    });

    // Web Service with Application Load Balancer
    const webService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'WebService', {
      cluster,
      taskDefinition: webTaskDefinition,
      desiredCount: 1,
      publicLoadBalancer: true,
      listenerPort: 80,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      targetProtocol: elbv2.ApplicationProtocol.HTTP,
      securityGroups: [ecsSecurityGroup],
    });

    // Configure health check
    webService.targetGroup.configureHealthCheck({
      path: '/health',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // ============================================
    // API custom domain (api.app.bearlymail.com) + HTTPS
    // Certificate and DNS live in networking stack; app stack adds HTTPS listener + Route53 A record (record points to ALB).
    // ============================================
    const apiDomainName = props?.apiDomainName;
    const apiCertificateArn = props?.apiCertificateArn;
    const hostedZoneForApi = props?.hostedZone;
    let httpsListener: elbv2.ApplicationListener | undefined;
    if (apiDomainName && apiCertificateArn && hostedZoneForApi) {
      const apiCertificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        'ApiCertificate',
        apiCertificateArn
      );

      // HTTPS listener on the ALB (save reference for adding additional certs/rules later)
      httpsListener = webService.loadBalancer.addListener('HttpsListener', {
        port: 443,
        certificates: [apiCertificate],
        defaultTargetGroups: [webService.targetGroup],
        protocol: elbv2.ApplicationProtocol.HTTPS,
      });

      // Route53 A record: api.app.bearlymail.com -> ALB (record in app stack because it references the ALB)
      const apiRecordName = apiDomainName.replace(`.${hostedZoneForApi.zoneName}`, '');
      new route53.ARecord(this, 'ApiARecord', {
        zone: hostedZoneForApi,
        recordName: apiRecordName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(webService.loadBalancer, { evaluateTargetHealth: true })
        ),
      });
    }

    // ============================================
    // Worker Service (Background Jobs)
    // ============================================
    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      cpu: props?.workerTaskCpu || 1024,
      memoryLimitMiB: props?.workerTaskMemory || 2048,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const workerContainer = workerTaskDefinition.addContainer('WorkerContainer', {
      image: serverImage,
      command: ['node', 'dist/worker.js'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup: workerLogGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        WORKER_PROCESSES: '2', // 2 workers on 1024 CPU / 2048 MiB task; each worker loads full NestJS + TypeORM + providers (~480 MiB each)
        LLM_PRIORITY_CONCURRENCY: '25', // 25 teamSize × 2 worker processes = 50 concurrent refine-priority jobs
        FRONTEND_URL: frontendUrl,
        DB_HOST: props.rdsProxyEndpoint,
        DB_PORT: '5432',
        DB_NAME: 'bearlymail',
        DB_SSL: 'true',
        CONTEXT_ANALYSIS_SQS_QUEUE_URL: props.contextAnalysisQueue.queueUrl,
        EMAIL_PRIORITISATION_SQS_QUEUE_URL: props.emailPrioritisationQueue?.queueUrl ?? '',
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ENCRYPTION_KEY'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'JWT_SECRET'),
        GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_SECRET'),
        GOOGLE_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_REDIRECT_URI'),
        GITHUB_APP_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_ID'),
        GITHUB_APP_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_SECRET'),
        GITHUB_APP_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_REDIRECT_URI'),
        GEMINI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'GEMINI_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        ZOHO_CLIQ_BACKEND_BOT_WEBHOOK: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BACKEND_BOT_WEBHOOK'),
        ZOHO_CLIQ_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_API_KEY'),
        ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL'),
        POSTHOG_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'POSTHOG_API_KEY'),
      },
    });

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [ecsSecurityGroup],
    });

    // ============================================
    // Queue Dashboard Service (pg-boss dashboard)
    // Runs @pg-boss/dashboard as a separate Fargate service behind the existing ALB.
    // Accessible at https://queue.api.app.bearlymail.com (when domain is configured).
    //
    // Required secrets to add to AppSecrets in AWS Secrets Manager:
    //   PGBOSS_DASHBOARD_DATABASE_URL  - Full PostgreSQL URL e.g. postgresql://user:pass@host:5432/bearlymail?sslmode=require
    //   PGBOSS_DASHBOARD_AUTH_USERNAME - Basic auth username for the dashboard
    //   PGBOSS_DASHBOARD_AUTH_PASSWORD - Basic auth password for the dashboard
    // ============================================
    const dashboardTaskDefinition = new ecs.FargateTaskDefinition(this, 'QueueDashboardTaskDefinition', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const dashboardContainer = dashboardTaskDefinition.addContainer('QueueDashboardContainer', {
      image: serverImage,
      // Run the pg-boss dashboard CLI directly (package is in production dependencies)
      command: ['node', 'node_modules/@pg-boss/dashboard/bin/cli.js'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'queue-dashboard',
        logGroup: dashboardLogGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3004',
      },
      secrets: {
        // DATABASE_URL stored as a complete URL in AppSecrets to avoid URL-encoding issues with the password
        DATABASE_URL: ecs.Secret.fromSecretsManager(appSecrets, 'PGBOSS_DASHBOARD_DATABASE_URL'),
        PGBOSS_DASHBOARD_AUTH_USERNAME: ecs.Secret.fromSecretsManager(appSecrets, 'PGBOSS_DASHBOARD_AUTH_USERNAME'),
        PGBOSS_DASHBOARD_AUTH_PASSWORD: ecs.Secret.fromSecretsManager(appSecrets, 'PGBOSS_DASHBOARD_AUTH_PASSWORD'),
      },
      healthCheck: {
        // Dashboard returns 401 for unauthenticated requests — that's healthy
        command: ['CMD-SHELL', 'node -e "require(\'http\').get(\'http://localhost:3004/\', (r) => {process.exit(r.statusCode < 500 ? 0 : 1)})"'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30),
      },
    });

    dashboardContainer.addPortMappings({
      containerPort: 3004,
      protocol: ecs.Protocol.TCP,
    });

    // Security group: allow inbound from ALB on port 3004; allow all outbound (for DB, ECR, etc.)
    const dashboardSecurityGroup = new ec2.SecurityGroup(this, 'QueueDashboardSecurityGroup', {
      vpc,
      description: 'Security group for pg-boss queue dashboard ECS service',
      allowAllOutbound: true,
    });
    dashboardSecurityGroup.connections.allowFrom(
      webService.loadBalancer.connections,
      ec2.Port.tcp(3004),
      'Allow traffic from ALB to queue dashboard',
    );

    const dashboardService = new ecs.FargateService(this, 'QueueDashboardService', {
      cluster,
      taskDefinition: dashboardTaskDefinition,
      desiredCount: 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dashboardSecurityGroup],
    });

    // Wire the dashboard to the ALB if domain is configured
    const queueDashboardDomainName = props?.queueDashboardDomainName;
    const queueDashboardCertificateArn = props?.queueDashboardCertificateArn;
    if (queueDashboardDomainName && queueDashboardCertificateArn && httpsListener && hostedZoneForApi) {
      const queueDashboardCertificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        'QueueDashboardCertificate',
        queueDashboardCertificateArn,
      );

      // Add the dashboard certificate to the shared HTTPS listener (ALB SNI)
      httpsListener.addCertificates('QueueDashboardCert', [queueDashboardCertificate]);

      // Target group for the dashboard
      const dashboardTargetGroup = new elbv2.ApplicationTargetGroup(this, 'QueueDashboardTargetGroup', {
        vpc,
        port: 3004,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [
          dashboardService.loadBalancerTarget({
            containerName: 'QueueDashboardContainer',
            containerPort: 3004,
          }),
        ],
        healthCheck: {
          path: '/',
          // Dashboard returns 401 for unauthenticated health check requests
          healthyHttpCodes: '200-499',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
      });

      // Host-based routing rule: queue.api.app.bearlymail.com → dashboard target group
      httpsListener.addAction('QueueDashboardAction', {
        priority: 10,
        conditions: [
          elbv2.ListenerCondition.hostHeaders([queueDashboardDomainName]),
        ],
        action: elbv2.ListenerAction.forward([dashboardTargetGroup]),
      });

      // Route53 A record: queue.api.app.bearlymail.com → same ALB
      const queueDashboardRecordName = queueDashboardDomainName.replace(`.${hostedZoneForApi.zoneName}`, '');
      new route53.ARecord(this, 'QueueDashboardARecord', {
        zone: hostedZoneForApi,
        recordName: queueDashboardRecordName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(webService.loadBalancer, { evaluateTargetHealth: true }),
        ),
      });

      new cdk.CfnOutput(this, 'QueueDashboardURL', {
        value: `https://${queueDashboardDomainName}`,
        description: 'Queue Dashboard URL (set REACT_APP_QUEUE_DASHBOARD_URL to this value)',
        exportName: 'BearlyMail-Queue-Dashboard-URL',
      });
    }

    new cdk.CfnOutput(this, 'QueueDashboardServiceName', {
      value: dashboardService.serviceName,
      description: 'Queue Dashboard ECS service name',
      exportName: 'BearlyMail-Queue-Dashboard-Service-Name',
    });

    // ============================================
    // Cron Jobs (Scheduled Tasks)
    // ============================================
    // Create a scheduled task for cron jobs
    const cronTaskDefinition = new ecs.FargateTaskDefinition(this, 'CronTaskDefinition', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const cronContainer = cronTaskDefinition.addContainer('CronContainer', {
      image: serverImage,
      command: ['node', '-e', 'console.log("Cron job placeholder - implement your cron logic")'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cron',
        logGroup: workerLogGroup, // Reuse worker log group
      }),
      environment: {
        NODE_ENV: 'production',
        FRONTEND_URL: frontendUrl,
        DB_HOST: props.rdsProxyEndpoint,
        DB_PORT: '5432',
        DB_NAME: 'bearlymail',
        DB_SSL: 'true',
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ENCRYPTION_KEY'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'JWT_SECRET'),
        GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_SECRET'),
        GOOGLE_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_REDIRECT_URI'),
        GITHUB_APP_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_ID'),
        GITHUB_APP_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_CLIENT_SECRET'),
        GITHUB_APP_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GITHUB_APP_REDIRECT_URI'),
        GEMINI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'GEMINI_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        ZOHO_CLIQ_BACKEND_BOT_WEBHOOK: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BACKEND_BOT_WEBHOOK'),
        ZOHO_CLIQ_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_API_KEY'),
        ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL'),
      },
    });

    // Example: Run email sync every 6 hours
    const emailSyncRule = new events.Rule(this, 'EmailSyncRule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      description: 'Trigger email sync for all users',
    });

    emailSyncRule.addTarget(new targets.EcsTask({
      cluster,
      taskDefinition: cronTaskDefinition,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [ecsSecurityGroup],
      containerOverrides: [
        {
          containerName: 'CronContainer',
          command: ['node', '-e', 'console.log("Email sync cron job")'],
        },
      ],
    }));

    // ============================================
    // Migration Task Definition (Run Manually)
    // ============================================
    // This task definition is used to run database migrations manually.
    // It is NOT a long-running service - you run it as a one-off task when needed.
    //
    // To run migrations:
    // aws ecs run-task \
    //   --cluster BearlyMailCluster \
    //   --task-definition BearlyMailMigrationTask \
    //   --launch-type FARGATE \
    //   --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-ids>],securityGroups=[<security-group-id>],assignPublicIp=DISABLED}"
    //
    // You can find the subnet IDs and security group ID in the AWS Console under VPC.

    // Security group for migration tasks - allows outbound to AWS services (Secrets Manager, ECR, etc.)
    // Note: RDS already allows connections from any IPv4 on port 5432 (configured in database stack)
    const migrationSecurityGroup = new ec2.SecurityGroup(this, 'MigrationSecurityGroup', {
      vpc,
      description: 'Security group for migration tasks - allows outbound HTTPS for AWS services',
      allowAllOutbound: true, // Allow outbound to NAT Gateway -> AWS services
    });

    const migrationTaskDefinition = new ecs.FargateTaskDefinition(this, 'MigrationTaskDefinition', {
      family: 'BearlyMailMigrationTask',
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const migrationLogGroup = new logs.LogGroup(this, 'MigrationLogGroup', {
      logGroupName: '/ecs/bearlymail/migration',
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    migrationTaskDefinition.addContainer('MigrationContainer', {
      image: serverImage,
      command: ['npm', 'run', 'migration:run:prod'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'migration',
        logGroup: migrationLogGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        DB_HOST: database.instanceEndpoint.hostname,
        DB_PORT: '5432',
        DB_NAME: 'bearlymail',
        DB_SSL: 'true',
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
    });

    // ============================================
    // Frontend: S3 + CloudFront
    // ============================================
    // S3 bucket name must be globally unique and follow naming rules
    // Using account and region to ensure uniqueness
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA: all routes go to index.html
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, // Required for CloudFront OAC
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ============================================
    // CloudFront Security Response Headers Policy
    // Fixes: Anti-clickjacking, X-Content-Type-Options, HSTS, CSP, proxy/server header disclosure
    // ============================================
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `BearlyMailSecurityHeaders-${this.node.addr.substring(0, 8)}`,
      comment: 'Security headers for BearlyMail frontend (CASA Tier 2/3 compliance)',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true }, // X-Content-Type-Options: nosniff
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY, // X-Frame-Options: DENY
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(730), // 2 years
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      removeHeaders: ['Server', 'X-Powered-By'],
    });

    // ============================================
    // CloudFront Distribution
    // ============================================
    let distribution: cloudfront.Distribution;
    const hostedZone = props?.hostedZone;
    const certificateArn = props?.certificateArn;
    const domainName = props?.domainName;

    // If domain and certificate are provided, set up CloudFront with custom domain
    if (domainName && certificateArn && hostedZone) {
      // Import certificate from us-east-1 (created by networking stack)
      const certificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        'CloudFrontCertificate',
        certificateArn
      );

      // Determine if domain is a subdomain
      const isSubdomain = domainName.includes('.') && domainName.split('.').length > 2;

      // CloudFront Distribution with custom domain
      distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeadersPolicy,
        },
        domainNames: isSubdomain ? [domainName] : [domainName, `www.${domainName}`],
        certificate: certificate,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL, // Include all regions for custom domain
        comment: 'BearlyMail frontend distribution',
        // SPA routing: serve index.html with 200 for all routes.
        // React Router handles client-side routing.
        // Actual 404s for missing assets are handled by the app.
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      });

      // Route53 A record for domain/subdomain
      new route53.ARecord(this, 'ARecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution)
        ),
      });

      // Route53 A record for www subdomain (only if domain is root domain)
      if (!isSubdomain) {
        new route53.ARecord(this, 'WwwARecord', {
          zone: hostedZone,
          recordName: `www.${domainName}`,
          target: route53.RecordTarget.fromAlias(
            new route53Targets.CloudFrontTarget(distribution)
          ),
        });
      }
    } else {
      // CloudFront Distribution without custom domain
      distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeadersPolicy,
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
        comment: 'BearlyMail frontend distribution',
        // SPA routing: serve index.html with 200 for all routes.
        // React Router handles client-side routing.
        // Actual 404s for missing assets are handled by the app.
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      });
    }

    // S3 Deployment: deploy the built React app to the frontend bucket
    // Build the frontend first: cd client && npm run build
    // Then cdk deploy BearlyMailStack (or deploy manually: aws s3 sync client/build s3://<bucket> --delete)
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset('../client/build')],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ============================================
    // CloudTrail (API Audit Trail — SAQ Q16 / GAP-9)
    // Records all management events to S3 for tamper-evident audit history.
    // Files are archived to Glacier after 90 days and expire after 1 year.
    // ============================================
    const cloudTrailBucket = new s3.Bucket(this, 'CloudTrailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'ArchiveAndExpire',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
    });

    const managementTrail = new cloudtrail.Trail(this, 'ManagementTrail', {
      trailName: 'BearlyMailManagementTrail',
      bucket: cloudTrailBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
      managementEvents: cloudtrail.ReadWriteType.ALL,
    });

    new cdk.CfnOutput(this, 'CloudTrailArn', {
      value: managementTrail.trailArn,
      description: 'CloudTrail trail ARN for management event audit',
      exportName: 'BearlyMail-CloudTrail-ARN',
    });

    // ============================================
    // AWS Config (Configuration Compliance Monitoring — SAQ Q16 / GAP-9)
    // Records configuration changes for key resource types and evaluates
    // them against compliance rules. Drift detected by Config rules surfaces
    // in the AWS Config console and in the daily drift-detection workflow.
    // ============================================

    // IAM role for the Config service
    const configServiceRole = new iam.Role(this, 'ConfigServiceRole', {
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole'),
      ],
    });

    // Dedicated S3 bucket for Config snapshots / history
    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'Expire',
          enabled: true,
          expiration: cdk.Duration.days(365),
        },
      ],
    });

    // Allow Config service to read the bucket ACL and write config history objects
    configBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal('config.amazonaws.com')],
      actions: ['s3:GetBucketAcl'],
      resources: [configBucket.bucketArn],
    }));
    configBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal('config.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [`${configBucket.bucketArn}/AWSLogs/${this.account}/Config/*`],
      conditions: {
        StringEquals: { 's3:x-amz-acl': 'bucket-owner-full-control' },
      },
    }));

    // Configuration Recorder: track resource types relevant to BearlyMail
    const configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      roleArn: configServiceRole.roleArn,
      recordingGroup: {
        allSupported: false,
        resourceTypes: [
          'AWS::S3::Bucket',
          'AWS::RDS::DBInstance',
          'AWS::ECS::TaskDefinition',
          'AWS::CloudTrail::Trail',
          'AWS::EC2::SecurityGroup',
          'AWS::IAM::Role',
          'AWS::SecretsManager::Secret',
        ],
      },
    });

    // Delivery Channel: where Config persists snapshots (daily)
    const configDeliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      s3BucketName: configBucket.bucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'TwentyFour_Hours',
      },
    });
    configDeliveryChannel.addDependency(configRecorder);

    // Helper: create a managed rule that depends on the recorder + delivery channel
    const addConfigRule = (id: string, identifier: string, configRuleName: string): config.ManagedRule => {
      const rule = new config.ManagedRule(this, id, { identifier, configRuleName });
      // Rules require an active recorder — enforce creation order
      (rule.node.defaultChild as cdk.CfnResource).addDependency(configDeliveryChannel);
      return rule;
    };

    // S3 compliance rules
    addConfigRule('S3BlockPublicReadRule',
      config.ManagedRuleIdentifiers.S3_BUCKET_PUBLIC_READ_PROHIBITED,
      'bearlymail-s3-block-public-read');

    addConfigRule('S3SslOnlyRule',
      config.ManagedRuleIdentifiers.S3_BUCKET_SSL_REQUESTS_ONLY,
      'bearlymail-s3-ssl-requests-only');

    // RDS compliance rules
    addConfigRule('RdsPublicAccessRule',
      config.ManagedRuleIdentifiers.RDS_INSTANCE_PUBLIC_ACCESS_CHECK,
      'bearlymail-rds-no-public-access');

    addConfigRule('RdsEncryptionRule',
      config.ManagedRuleIdentifiers.RDS_STORAGE_ENCRYPTED,
      'bearlymail-rds-storage-encrypted');

    // ECS compliance rule — ensures all task definitions emit logs
    addConfigRule('EcsLogConfigRule',
      config.ManagedRuleIdentifiers.ECS_TASK_DEFINITION_LOG_CONFIGURATION,
      'bearlymail-ecs-task-log-configuration');

    // CloudTrail rule — verifies CloudTrail is enabled in this account/region
    addConfigRule('CloudTrailEnabledRule',
      config.ManagedRuleIdentifiers.CLOUD_TRAIL_ENABLED,
      'bearlymail-cloudtrail-enabled');

    new cdk.CfnOutput(this, 'ConfigBucketName', {
      value: configBucket.bucketName,
      description: 'S3 bucket storing AWS Config history snapshots',
      exportName: 'BearlyMail-Config-Bucket',
    });

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: webService.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: 'BearlyMail-ALB-DNS',
    });

    if (apiDomainName) {
      new cdk.CfnOutput(this, 'ApiURL', {
        value: `https://${apiDomainName}`,
        description: 'API base URL (for GOOGLE_REDIRECT_URI and VITE_API_URL)',
        exportName: 'BearlyMail-API-URL',
      });
    }

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: domainName ? `https://${domainName}` : `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
      exportName: 'BearlyMail-CloudFront-URL',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 bucket name',
      exportName: 'BearlyMail-Frontend-Bucket',
    });

    new cdk.CfnOutput(this, 'MigrationTaskDefinitionArn', {
      value: migrationTaskDefinition.taskDefinitionArn,
      description: 'Migration task definition ARN (run manually when migrations are needed)',
      exportName: 'BearlyMail-Migration-Task-ARN',
    });

    new cdk.CfnOutput(this, 'MigrationSecurityGroupId', {
      value: migrationSecurityGroup.securityGroupId,
      description: 'Security group ID for migration tasks',
      exportName: 'BearlyMail-Migration-SG-ID',
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster name',
      exportName: 'BearlyMail-ECS-Cluster',
    });

    new cdk.CfnOutput(this, 'WebServiceName', {
      value: webService.service.serviceName,
      description: 'Web ECS service name',
      exportName: 'BearlyMail-Web-Service-Name',
    });

    new cdk.CfnOutput(this, 'WorkerServiceName', {
      value: workerService.serviceName,
      description: 'Worker ECS service name',
      exportName: 'BearlyMail-Worker-Service-Name',
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: repository.repositoryUri,
      description: 'ECR repository URI for server images',
      exportName: 'BearlyMail-ECR-Repository-URI',
    });
  }
}

