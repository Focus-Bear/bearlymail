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
  /** RDS Proxy created in DatabaseStack */
  rdsProxy: rds.DatabaseProxy;
  /** RDS Proxy endpoint from DatabaseStack */
  rdsProxyEndpoint: string;
  /** RDS Proxy security group from DatabaseStack — Lambda SG adds ingress to this */
  rdsProxySecurityGroup: ec2.SecurityGroup;
  /**
   * Lambda security group created in DatabaseStack (alongside rdsProxySecurityGroup)
   * to avoid a cyclic cross-stack reference.
   */
  lambdaSecurityGroup: ec2.ISecurityGroup;
  /** SNS topic ARN for DLQ depth alarms (optional) */
  alarmSnsTopicArn?: string;
}

export class BearlyMailContextAnalysisStack extends cdk.Stack {
  /** SQS FIFO queue — passed to AppStack to wire up grantSendMessages and env var */
  public readonly queue: sqs.Queue;
  /** Dead-letter queue for failed context analysis batches */
  public readonly dlq: sqs.Queue;
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

    const { vpc, database, dbSecret, appSecrets, rdsProxy, rdsProxyEndpoint, rdsProxySecurityGroup, lambdaSecurityGroup } = props;

    this.rdsProxyEndpoint = rdsProxyEndpoint;

    // ============================================
    // SQS FIFO Queue + DLQ (owned by this stack)
    // ============================================
    this.dlq = new sqs.Queue(this, "ContextAnalysisDLQ", {
      queueName: "bearlymail-context-analysis-dlq.fifo",
      fifo: true,
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.queue = new sqs.Queue(this, "ContextAnalysisQueue", {
      queueName: "bearlymail-context-analysis.fifo",
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(180),
      retentionPeriod: cdk.Duration.hours(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 3,
      },
    });

    const queue = this.queue;
    const dlq = this.dlq;

    this.queueUrl = queue.queueUrl;

    // ============================================
    // Lambda IAM Role
    // Note: lambdaSecurityGroup is provided via props (created in DatabaseStack
    // alongside rdsProxySecurityGroup to avoid a cyclic cross-stack reference).
    // ============================================
    const lambdaRole = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole",
        ),
      ],
    });

    // Secrets Manager read access — use the same secrets the ECS app already reads.
    // dbSecret (DatabaseStack) holds RDS username/password used via RDS Proxy.
    // appSecrets (SecretsStack) holds LLM API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, etc.).
    dbSecret.grantRead(lambdaRole);
    appSecrets.grantRead(lambdaRole);

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
          // Include prompt file + node_modules (installed by lambda/batch-analyzer build)
          exclude: [
            "**/*.spec.js",
            "**/*.test.js",
            "**/*.d.ts",
            "**/*.d.ts.map",
            "**/*.js.map",
          ],
        },
      ),
      // Memory: 512MB is sufficient for Node.js LLM API calls
      memorySize: 512,
      // Timeout: 90s = 60s LLM budget + 30s retry headroom
      timeout: cdk.Duration.seconds(90),
      // Reserve concurrency: 60 — Lambda is now the only path for all context
      // analysis (no PgBoss fallback, no isNewUserOnboarding gate).  Raising
      // from 30 to 60 accommodates concurrent multi-user bursts.
      //
      // ⚠️ FIFO throttle interaction: FIFO queues stop delivering messages from a
      // MessageGroup when the consumer is throttled. If a burst of >60 simultaneous
      // batches occurs, SQS will throttle → retry (up to maxReceiveCount=3) →
      // if retries exhaust, messages land in the DLQ. Monitor the DLQ alarm and
      // raise this value or implement per-user MessageGroupId bucketing if needed.
      reservedConcurrentExecutions: 60,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      role: lambdaRole,
      environment: {
        NODE_ENV: "production",
        RDS_PROXY_ENDPOINT: rdsProxyEndpoint,
        // Reference the same secrets used by the ECS app (no duplication of values).
        // The Lambda reads username/password from dbSecret and LLM keys from appSecrets.
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRET_ARN: appSecrets.secretArn,
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
    new cdk.CfnOutput(this, "ContextAnalysisQueueUrl", {
      value: queue.queueUrl,
      description: "Set as CONTEXT_ANALYSIS_SQS_QUEUE_URL on ECS tasks",
      exportName: "BearlyMailContextAnalysisQueueUrl",
    });

    new cdk.CfnOutput(this, "ContextAnalysisDlqUrl", {
      value: dlq.queueUrl,
      description: "Dead letter queue for failed context analysis batches",
      exportName: "BearlyMailContextAnalysisDlqUrl",
    });

    new cdk.CfnOutput(this, "RdsProxyEndpoint", {
      value: rdsProxyEndpoint,
      description: "RDS Proxy endpoint for Lambda DB connections",
      exportName: "BearlyMailRdsProxyEndpoint",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: batchAnalyzerFn.functionArn,
      description: "Batch analyzer Lambda function ARN",
      exportName: "BearlyMailBatchAnalyzerArn",
    });

    new cdk.CfnOutput(this, "BatchAnalyzerFunctionName", {
      value: batchAnalyzerFn.functionName,
      description: "Batch analyzer Lambda function name (used by CI smoke test)",
      exportName: "BearlyMailBatchAnalyzerFunctionName",
    });
  }
}
