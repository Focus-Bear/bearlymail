import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
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
  databaseInstanceType?: ec2.InstanceType;
  webTaskCpu?: number;
  webTaskMemory?: number;
  workerTaskCpu?: number;
  workerTaskMemory?: number;
  // Domain configuration
  domainName?: string; // e.g., 'bearlymail.com'
  hostedZoneId?: string; // Route53 hosted zone ID
}

export class BearlyMailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: BearlyMailStackProps) {
    super(scope, id, props);

    // ============================================
    // VPC Setup
    // ============================================
    const vpc = new ec2.Vpc(this, 'BearlyMailVpc', {
      maxAzs: 2,
      natGateways: 1, // Single NAT gateway for cost optimization
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ============================================
    // Secrets Manager
    // ============================================
    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      description: 'RDS PostgreSQL database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'bearlymail' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 32,
      },
    });

    const appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      description: 'Application secrets (JWT, encryption keys, API keys)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 1,
      },
    });

    // Note: You'll need to manually add these secrets to AppSecrets:
    // - ENCRYPTION_KEY (32+ character string)
    // - JWT_SECRET (random string)
    // - GOOGLE_CLIENT_ID
    // - GOOGLE_CLIENT_SECRET
    // - GOOGLE_REDIRECT_URI
    // - GEMINI_API_KEY (optional)
    // - OPENAI_API_KEY (optional)

    // ============================================
    // RDS Database
    // ============================================
    const databaseInstanceType = props?.databaseInstanceType || ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MICRO
    );

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: databaseInstanceType,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'bearlymail',
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete DB on stack deletion
      deletionProtection: false, // Set to true in production
      multiAz: false, // Set to true for production HA
      publiclyAccessible: false,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
    });

    // Allow ECS tasks to connect to RDS
    database.connections.allowDefaultPortFromAnyIpv4();

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

    // Add any additional permissions needed by the app
    // (e.g., S3 access, SES for sending emails, etc.)

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
    // Route53 & SSL Certificate
    // ============================================
    let distribution: cloudfront.Distribution;
    let certificate: certificatemanager.Certificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;
    let domainName: string | undefined;

    // If domain is provided, set up Route53 and SSL
    if (props?.domainName && props?.hostedZoneId) {
      domainName = props.domainName;
      
      // Look up the hosted zone
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: domainName,
      });

      // Request SSL certificate (must be in us-east-1 for CloudFront)
      // IMPORTANT: CloudFront requires certificates in us-east-1 region
      // 
      // For first deployment, create the certificate manually:
      // aws acm request-certificate --domain-name bearlymail.com \
      //   --subject-alternative-names www.bearlymail.com \
      //   --validation-method DNS --region us-east-1
      //
      // Then update this code to import it:
      // certificate = certificatemanager.Certificate.fromCertificateArn(
      //   this, 'CloudFrontCertificate', 
      //   'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID'
      // );
      //
      // For now, we'll create it here (will be in ap-southeast-2)
      // You'll need to create it manually in us-east-1 and import it
      // See CERTIFICATE_SETUP.md for detailed instructions
      
      // Temporary: Create certificate (will need to be replaced with us-east-1 certificate)
      // Note: This creates certificate in ap-southeast-2, but CloudFront needs us-east-1
      // For now, we'll create it but you should replace with us-east-1 certificate
      // See CERTIFICATE_SETUP.md for instructions
      certificate = new certificatemanager.Certificate(this, 'CloudFrontCertificate', {
        domainName: domainName,
        subjectAlternativeNames: [`www.${domainName}`],
        validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
      });
      
      // TODO: Replace with certificate from us-east-1 before deploying
      // The certificate above will fail when used with CloudFront
      // Follow CERTIFICATE_SETUP.md to create and import the correct certificate
      // Example:
      // certificate = certificatemanager.Certificate.fromCertificateArn(
      //   this, 'CloudFrontCertificate', 
      //   'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID'
      // );

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
        domainNames: [domainName, `www.${domainName}`],
        certificate: certificate as certificatemanager.ICertificate,
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

      // Route53 A record for root domain
      new route53.ARecord(this, 'ARecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution)
        ),
      });

      // Route53 A record for www subdomain
      new route53.ARecord(this, 'WwwARecord', {
        zone: hostedZone,
        recordName: `www.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution)
        ),
      });
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

    if (domainName) {
      new cdk.CfnOutput(this, 'DomainName', {
        value: domainName,
        description: 'Custom domain name',
        exportName: 'BearlyMail-Domain-Name',
      });
    }

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
      description: 'RDS database endpoint',
      exportName: 'BearlyMail-DB-Endpoint',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: dbSecret.secretArn,
      description: 'Database secret ARN',
      exportName: 'BearlyMail-DB-Secret-ARN',
    });

    new cdk.CfnOutput(this, 'AppSecretsArn', {
      value: appSecrets.secretArn,
      description: 'Application secrets ARN',
      exportName: 'BearlyMail-App-Secrets-ARN',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'Frontend S3 bucket name',
      exportName: 'BearlyMail-Frontend-Bucket',
    });
  }
}

