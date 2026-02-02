import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
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
  // Database and Secrets (from other stacks)
  database: rds.IDatabaseInstance;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
}

export class BearlyMailStack extends cdk.Stack {
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
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Grant SES permissions for sending emails
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'], // In production, restrict to specific verified email addresses
    }));

    // ============================================
    // Log Groups
    // ============================================
    const webLogGroup = new logs.LogGroup(this, 'WebLogGroup', {
      logGroupName: '/ecs/bearlymail/web',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: '/ecs/bearlymail/worker',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================
    // Web Service (NestJS API)
    // ============================================
    const webTaskDefinition = new ecs.FargateTaskDefinition(this, 'WebTaskDefinition', {
      cpu: props?.webTaskCpu || 512,
      memoryLimitMiB: props?.webTaskMemory || 1024,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const webContainer = webTaskDefinition.addContainer('WebContainer', {
      image: ecs.ContainerImage.fromAsset('../server', {
        file: 'Dockerfile',
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'web',
        logGroup: webLogGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        PORT: '3001',
        DB_HOST: database.instanceEndpoint.hostname,
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
        GEMINI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'GEMINI_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        ZOHO_CLIQ_BACKEND_BOT_WEBHOOK: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BACKEND_BOT_WEBHOOK'),
        ZOHO_CLIQ_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_API_KEY'),
        ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL'),
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
    // Worker Service (Background Jobs)
    // ============================================
    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      cpu: props?.workerTaskCpu || 256,
      memoryLimitMiB: props?.workerTaskMemory || 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
    });

    const workerContainer = workerTaskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromAsset('../server', {
        file: 'Dockerfile',
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      command: ['node', 'dist/worker.js'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup: workerLogGroup,
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
        ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ENCRYPTION_KEY'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'JWT_SECRET'),
        GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_SECRET'),
        GOOGLE_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_REDIRECT_URI'),
        GEMINI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'GEMINI_API_KEY'),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'OPENAI_API_KEY'),
        ZOHO_CLIQ_BACKEND_BOT_WEBHOOK: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BACKEND_BOT_WEBHOOK'),
        ZOHO_CLIQ_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_API_KEY'),
        ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL: ecs.Secret.fromSecretsManager(appSecrets, 'ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL'),
      },
    });

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
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
      image: ecs.ContainerImage.fromAsset('../server', {
        file: 'Dockerfile',
        platform: ecrAssets.Platform.LINUX_AMD64,
      }),
      command: ['node', '-e', 'console.log("Cron job placeholder - implement your cron logic")'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cron',
        logGroup: workerLogGroup, // Reuse worker log group
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
        ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, 'ENCRYPTION_KEY'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'JWT_SECRET'),
        GOOGLE_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_CLIENT_SECRET'),
        GOOGLE_REDIRECT_URI: ecs.Secret.fromSecretsManager(appSecrets, 'GOOGLE_REDIRECT_URI'),
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
      containerOverrides: [
        {
          containerName: 'CronContainer',
          command: ['node', '-e', 'console.log("Email sync cron job")'],
        },
      ],
    }));

    // ============================================
    // Frontend: S3 + CloudFront
    // ============================================
    // S3 bucket name must be globally unique and follow naming rules
    // Using account and region to ensure uniqueness
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      // Remove explicit bucketName to let CDK generate a unique name
      // This avoids conflicts and naming issues
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA: all routes go to index.html
      publicReadAccess: false, // CloudFront will handle access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for BearlyMail frontend',
    });

    frontendBucket.grantRead(originAccessIdentity);

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
        defaultBehavior: {
          origin: new cloudfrontOrigins.S3Origin(frontendBucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        domainNames: isSubdomain ? [domainName] : [domainName, `www.${domainName}`],
        certificate: certificate,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL, // Include all regions for custom domain
        comment: 'BearlyMail frontend distribution',
        // SPA: redirect all 404s to index.html
        errorResponses: [
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
        defaultBehavior: {
          origin: new cloudfrontOrigins.S3Origin(frontendBucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
        comment: 'BearlyMail frontend distribution',
        // SPA: redirect all 404s to index.html
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
        ],
      });
    }

    // S3 Deployment (for CI/CD - you'll deploy the built React app here)
    // Note: This will fail if ../client/build doesn't exist
    // Build the frontend first: cd client && npm run build
    // Or comment this out and deploy manually
    // 
    // Commented out to avoid path issues - deploy manually or via CI/CD
    // new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
    //   sources: [s3deploy.Source.asset('../client/build')],
    //   destinationBucket: frontendBucket,
    //   distribution,
    //   distributionPaths: ['/*'],
    // });

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: webService.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
      exportName: 'BearlyMail-ALB-DNS',
    });

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
  }
}

