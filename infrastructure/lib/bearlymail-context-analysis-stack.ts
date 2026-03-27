/**
 * BearlyMailContextAnalysisStack
 *
 * Provisions the SQS + Lambda + RDS Proxy infrastructure for parallel
 * context batch analysis (issue #1445).
 *
 * Architecture:
 *   ECS Fargate (Orchestrator) → SQS → Lambda (×30 concurrent) → RDS Proxy → RDS
 *
 * This stack depends on BearlyMailNetworkingStack (VPC) and
 * BearlyMailDatabaseStack (RDS instance + DB secret).
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import * as path from "path";

export interface BearlyMailContextAnalysisStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  database: rds.IDatabaseInstance;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
  /** ARN of the ECS task role — grants it SQS send permissions */
  ecsTaskRoleArn: string;
  /** SNS topic ARN for DLQ depth alarms (optional) */
  alarmSnsTopicArn?: string;
}

export class BearlyMailContextAnalysisStack extends cdk.Stack {
  /** Queue URL to set as CONTEXT_ANALYSIS_SQS_QUEUE_URL env var on ECS tasks */
  public readonly queueUrl: string;

  /** RDS Proxy endpoint — use as DB_HOST in the Lambda env */
  public readonly rdsProxyEndpoint: string;

  constructor(
    scope: Construct,
    id: string,
    props: BearlyMailContextAnalysisStackProps,
  ) {
    super(scope, id, props);

    const { vpc, database, dbSecret, appSecrets, ecsTaskRoleArn } = props;

    // ============================================
    // Dead Letter Queue (FIFO — must match main queue type)
    // ============================================
    const dlq = new sqs.Queue(this, "ContextAnalysisDLQ", {
      // FIFO DLQ must have the .fifo suffix
      queueName: "bearlymail-context-analysis-dlq.fifo",
      fifo: true,
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ============================================
    // Main SQS Queue (FIFO — enables MessageDeduplicationId for retry safety)
    //
    // Why FIFO: the orchestrator sends MessageDeduplicationId per batch so that
    // an ECS task crash-and-restart cannot double-enqueue the same batch.
    // AWS silently ignores deduplication IDs on Standard queues — FIFO is required.
    //
    // contentBasedDeduplication: false — we supply explicit MessageDeduplicationId
    // values (hash of analysisRecordId + batchIndex) for precise control.
    // ============================================
    const queue = new sqs.Queue(this, "ContextAnalysisQueue", {
      // FIFO queues must have the .fifo suffix
      queueName: "bearlymail-context-analysis.fifo",
      fifo: true,
      contentBasedDeduplication: false,
      // 2× Lambda timeout (90s) → 180s visibility timeout
      visibilityTimeout: cdk.Duration.seconds(180),
      // Messages expire after 4 hours — well within analysis window
      retentionPeriod: cdk.Duration.hours(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: dlq,
        // Move to DLQ after 3 failed receives
        maxReceiveCount: 3,
      },
    });

    this.queueUrl = queue.queueUrl;

    // Grant ECS task role permission to send messages to this queue
    const ecsTaskRole = iam.Role.fromRoleArn(
      this,
      "EcsTaskRole",
      ecsTaskRoleArn,
    );
    queue.grantSendMessages(ecsTaskRole);

    // ============================================
    // Secrets Manager: DB credentials for Lambda
    // (separate secret with only Lambda-needed fields)
    // ============================================
    const lambdaDbSecret = new secretsmanager.Secret(this, "LambdaDbSecret", {
      secretName: "bearlymail/lambda/db",
      description: "RDS credentials for context analysis Lambda (via RDS Proxy)",
      secretObjectValue: {
        // Values will be set post-deployment; this creates the secret shell
        // In practice, copy from dbSecret or provision via CDK cfnSecret
        host: cdk.SecretValue.unsafePlainText("REPLACE_WITH_RDS_PROXY_ENDPOINT"),
        port: cdk.SecretValue.unsafePlainText("5432"),
        username: cdk.SecretValue.secretsManager(dbSecret.secretArn, {
          jsonField: "username",
        }),
        password: cdk.SecretValue.secretsManager(dbSecret.secretArn, {
          jsonField: "password",
        }),
        database: cdk.SecretValue.unsafePlainText("bearlymail"),
      },
    });

    const lambdaLlmSecret = new secretsmanager.Secret(this, "LambdaLlmSecret", {
      secretName: "bearlymail/lambda/llm",
      description: "LLM API keys for context analysis Lambda",
      secretObjectValue: {
        // Populate via AWS Console or CDK after deploying
        ANTHROPIC_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_WITH_KEY"),
        OPENAI_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_WITH_KEY"),
        GEMINI_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_WITH_KEY"),
        LLM_PROVIDER: cdk.SecretValue.unsafePlainText("anthropic"),
      },
    });

    // ============================================
    // RDS Proxy
    // ============================================
    const proxySecurityGroup = new ec2.SecurityGroup(
      this,
      "RdsProxySecurityGroup",
      {
        vpc,
        description: "Security group for RDS Proxy (Lambda → RDS)",
        allowAllOutbound: true,
      },
    );

    const rdsProxy = new rds.DatabaseProxy(this, "RdsProxy", {
      proxyTarget: rds.ProxyTarget.fromInstance(
        database as rds.DatabaseInstance,
      ),
      secrets: [dbSecret],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [proxySecurityGroup],
      dbProxyName: "bearlymail-rds-proxy",
      requireTLS: true,
      // Keep idle connections for warm Lambda invocations
      idleClientTimeout: cdk.Duration.minutes(10),
      maxConnectionsPercent: 50, // Reserve 50% of max_connections for the proxy pool
      maxIdleConnectionsPercent: 25,
    });

    this.rdsProxyEndpoint = rdsProxy.endpoint;

    // ============================================
    // Lambda Security Group
    // ============================================
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      "LambdaSecurityGroup",
      {
        vpc,
        description: "Security group for context analysis Lambda",
        allowAllOutbound: true,
      },
    );

    // Allow Lambda to connect to RDS Proxy
    proxySecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow Lambda to connect via RDS Proxy",
    );

    // ============================================
    // Lambda IAM Role
    // ============================================
    const lambdaRole = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole",
        ),
      ],
    });

    // Secrets Manager read access
    lambdaDbSecret.grantRead(lambdaRole);
    lambdaLlmSecret.grantRead(lambdaRole);

    // CloudWatch metrics
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      }),
    );

    // RDS Proxy connect permission
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["rds-db:connect"],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:*/*`,
        ],
      }),
    );

    // ============================================
    // Lambda Function
    // ============================================
    const batchAnalyzerFn = new lambda.Function(this, "BatchAnalyzerFn", {
      functionName: "bearlymail-batch-analyzer",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../lambda/batch-analyzer/dist"),
        {
          // Include prompt file in deployment package
          exclude: ["**/*.spec.js", "**/*.test.js"],
        },
      ),
      // Memory: 512MB is sufficient for Node.js LLM API calls
      memorySize: 512,
      // Timeout: 90s = 60s LLM budget + 30s retry headroom
      timeout: cdk.Duration.seconds(90),
      // Reserve concurrency: cap at 30 to match the FIFO queue's per-MessageGroup
      // parallelism model (one Lambda per MessageGroupId = one per batch).
      //
      // ⚠️ FIFO throttle interaction: FIFO queues stop delivering messages from a
      // MessageGroup when the consumer is throttled. With reservedConcurrency=30 and
      // multi-user onboarding, a burst of >30 simultaneous batches (e.g., 2 users × 30
      // batches each) will cause SQS to throttle → retry (up to maxReceiveCount=3) →
      // if retries exhaust, messages land in the DLQ and the finalization job times out
      // waiting for batches that will never complete.
      //
      // Current mitigation: isNewUserOnboarding gate limits Lambda dispatch to new-user
      // flows only (not every analysis), keeping burst rate low in practice.
      //
      // If concurrent new-user onboarding becomes common, consider raising this to
      // 60–100 and adjusting the SQS visibility timeout and finalization delay
      // (LAMBDA_FINALIZATION_DELAY_MS) proportionally.
      reservedConcurrentExecutions: 30,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      environment: {
        NODE_ENV: "production",
        RDS_PROXY_ENDPOINT: rdsProxy.endpoint,
        DB_SECRET_NAME: "bearlymail/lambda/db",
        LLM_SECRET_NAME: "bearlymail/lambda/llm",
        PROMPT_TEMPLATE_PATH: "/var/task/prompts/analyze-email-patterns.md",
      },
      // Structured logging
      logGroup: new logs.LogGroup(this, "BatchAnalyzerFnLogGroup", {
        logGroupName: "/aws/lambda/bearlymail-batch-analyzer",
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // SQS trigger: batch size 1 — one Lambda per batch job
    batchAnalyzerFn.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, {
        batchSize: 1,
        // Report batch item failures so partial SQS batches are handled correctly
        reportBatchItemFailures: true,
      }),
    );

    // ============================================
    // CloudWatch Alarms
    // ============================================
    const dlqDepthAlarm = new cloudwatch.Alarm(this, "DlqDepthAlarm", {
      alarmName: "BearlyMail-ContextAnalysis-DLQ-NonEmpty",
      alarmDescription:
        "Context analysis batches are failing and landing in DLQ",
      metric: dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const lambdaErrorAlarm = new cloudwatch.Alarm(this, "LambdaErrorAlarm", {
      alarmName: "BearlyMail-BatchAnalyzer-Errors",
      alarmDescription: "Lambda context batch analyzer has errors",
      metric: batchAnalyzerFn.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alarmSnsTopicArn) {
      const topic = sns.Topic.fromTopicArn(
        this,
        "AlarmTopic",
        props.alarmSnsTopicArn,
      );
      dlqDepthAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
      lambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    }

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, "QueueUrl", {
      value: queue.queueUrl,
      description: "Set as CONTEXT_ANALYSIS_SQS_QUEUE_URL on ECS tasks",
      exportName: "BearlyMailContextAnalysisQueueUrl",
    });

    new cdk.CfnOutput(this, "DlqUrl", {
      value: dlq.queueUrl,
      description: "Dead letter queue for failed context analysis batches",
      exportName: "BearlyMailContextAnalysisDlqUrl",
    });

    new cdk.CfnOutput(this, "RdsProxyEndpoint", {
      value: rdsProxy.endpoint,
      description: "RDS Proxy endpoint for Lambda DB connections",
      exportName: "BearlyMailRdsProxyEndpoint",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: batchAnalyzerFn.functionArn,
      description: "Batch analyzer Lambda function ARN",
      exportName: "BearlyMailBatchAnalyzerArn",
    });
  }
}
