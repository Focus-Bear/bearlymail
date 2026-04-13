/**
 * BearlyMailEmailPrioritisationStack
 *
 * Provisions the SQS + Lambda + RDS Proxy infrastructure for parallel
 * email priority batch analysis (issue #1703).
 *
 * Architecture:
 *   ECS (PrioritySqsDispatchService) → SQS FIFO → Lambda (×30 concurrent) → RDS Proxy → RDS
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

export interface BearlyMailEmailPrioritisationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
  /** RDS Proxy created in DatabaseStack */
  rdsProxy: rds.DatabaseProxy;
  /** RDS Proxy endpoint from DatabaseStack */
  rdsProxyEndpoint: string;
  /** RDS Proxy security group from DatabaseStack */
  rdsProxySecurityGroup: ec2.SecurityGroup;
  /**
   * Lambda security group created in DatabaseStack (alongside rdsProxySecurityGroup)
   * to avoid a cyclic cross-stack reference.
   */
  lambdaSecurityGroup: ec2.ISecurityGroup;
  /** SNS topic ARN for DLQ depth alarms (optional) */
  alarmSnsTopicArn?: string;
}

export class BearlyMailEmailPrioritisationStack extends cdk.Stack {
  /** SQS FIFO queue — passed to AppStack to wire up grantSendMessages and env var */
  public readonly queue: sqs.Queue;
  /** Dead-letter queue for failed prioritisation batches */
  public readonly dlq: sqs.Queue;
  /** Queue URL for env injection on ECS tasks */
  public readonly queueUrl: string;

  constructor(
    scope: Construct,
    id: string,
    props: BearlyMailEmailPrioritisationStackProps,
  ) {
    super(scope, id, props);

    const {
      vpc,
      dbSecret,
      appSecrets,
      rdsProxy,
      rdsProxyEndpoint,
      rdsProxySecurityGroup,
      lambdaSecurityGroup,
    } = props;

    // ============================================
    // SQS FIFO Queue + DLQ
    // ============================================
    this.dlq = new sqs.Queue(this, "EmailPrioritisationDLQ", {
      queueName: "bearlymail-email-prioritisation-dlq.fifo",
      fifo: true,
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.queue = new sqs.Queue(this, "EmailPrioritisationQueue", {
      queueName: "bearlymail-email-prioritisation.fifo",
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(120),
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
    const emailPrioritiserFn = new lambda.Function(
      this,
      "EmailPrioritiserFn",
      {
        functionName: "bearlymail-email-prioritiser",
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "handler.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/email-prioritiser/dist"),
          {
            exclude: [
              "**/*.spec.js",
              "**/*.test.js",
              "**/*.d.ts",
              "**/*.d.ts.map",
              "**/*.js.map",
            ],
          },
        ),
        memorySize: 512,
        timeout: cdk.Duration.seconds(90),
        reservedConcurrentExecutions: 30,
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [lambdaSecurityGroup],
        role: lambdaRole,
        environment: {
          NODE_ENV: "production",
          RDS_PROXY_ENDPOINT: rdsProxyEndpoint,
          DB_SECRET_ARN: dbSecret.secretArn,
          APP_SECRET_ARN: appSecrets.secretArn,
          PRIORITISE_PROMPT_PATH: "/var/task/prompts/prioritise-email.md",
          TRIAGE_PROMPT_PATH: "/var/task/prompts/batch-priority-triage.md",
        },
        logGroup: new logs.LogGroup(this, "EmailPrioritiserFnLogGroup", {
          logGroupName: "/aws/lambda/bearlymail-email-prioritiser",
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      },
    );

    // SQS trigger: batch size 1
    emailPrioritiserFn.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );

    // ============================================
    // CloudWatch Alarms
    // ============================================
    const dlqDepthAlarm = new cloudwatch.Alarm(this, "DlqDepthAlarm", {
      alarmName: "BearlyMail-EmailPrioritisation-DLQ-NonEmpty",
      alarmDescription:
        "Email prioritisation batches are failing and landing in DLQ",
      metric: dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const lambdaErrorAlarm = new cloudwatch.Alarm(this, "LambdaErrorAlarm", {
      alarmName: "BearlyMail-EmailPrioritiser-Errors",
      alarmDescription: "Lambda email prioritiser has errors",
      metric: emailPrioritiserFn.metricErrors({
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
    new cdk.CfnOutput(this, "EmailPrioritisationQueueUrl", {
      value: queue.queueUrl,
      description: "Set as EMAIL_PRIORITISATION_SQS_QUEUE_URL on ECS tasks",
      exportName: "BearlyMailEmailPrioritisationQueueUrl",
    });

    new cdk.CfnOutput(this, "EmailPrioritisationDlqUrl", {
      value: dlq.queueUrl,
      description: "Dead letter queue for failed prioritisation batches",
      exportName: "BearlyMailEmailPrioritisationDlqUrl",
    });

    new cdk.CfnOutput(this, "EmailPrioritiserFunctionArn", {
      value: emailPrioritiserFn.functionArn,
      description: "Email prioritiser Lambda function ARN",
      exportName: "BearlyMailEmailPrioritiserArn",
    });

    new cdk.CfnOutput(this, "EmailPrioritiserFunctionName", {
      value: emailPrioritiserFn.functionName,
      description: "Email prioritiser Lambda function name",
      exportName: "BearlyMailEmailPrioritiserFunctionName",
    });
  }
}
