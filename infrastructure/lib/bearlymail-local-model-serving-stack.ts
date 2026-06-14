import * as path from "path";

import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as events from "aws-cdk-lib/aws-events";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

const TRAINING_DATA_PREFIX = "training-data/";
const MODELS_PREFIX = "models/";

export interface BearlyMailLocalModelServingStackProps extends cdk.StackProps {
  /** VPC for the scheduled training Fargate task (needs egress for S3 + ECR). */
  vpc: ec2.IVpc;
  /** SNS topic ARN for the Lambda-error alarm (from the alerting stack). */
  alarmSnsTopicArn?: string;
}

/**
 * Serving infrastructure for the local category/priority models.
 *
 * Models are trained offline (see local-models/) and the per-user bundle is
 * stored in S3 as `models/<userId>.joblib`. The inference Lambda — a container
 * image because scikit-learn/scipy are too large for a zip layer — loads the
 * caller's bundle (cached per warm container) and returns category + priority
 * predictions with the fallback decision. It is NOT in the VPC: it only reads
 * S3 and receives the thread data in the request, so it needs no database
 * access and avoids VPC/ENI cold-start cost.
 *
 * The server calls this Lambda before the existing LLM pipeline; where a head
 * reports `*Fallback: false` it persists the local prediction, otherwise it
 * continues through the LLM path (shadow mode first — see the model README).
 */
export class BearlyMailLocalModelServingStack extends cdk.Stack {
  public readonly modelsBucket: s3.Bucket;
  public readonly inferenceFunction: lambda.DockerImageFunction;

  constructor(
    scope: Construct,
    id: string,
    props: BearlyMailLocalModelServingStackProps,
  ) {
    super(scope, id, props);

    // Per-user model bundles. Versioned so a bad retrain can be rolled back;
    // old versions expire to keep the bucket small.
    this.modelsBucket = new s3.Bucket(this, "LocalModelsBucket", {
      bucketName: `bearlymail-local-models-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(30),
          // Reclaim storage from uploads that were interrupted mid-flight.
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.inferenceFunction = new lambda.DockerImageFunction(
      this,
      "LocalModelInferenceFn",
      {
        functionName: "bearlymail-local-model-inference",
        // Build context is local-models/ only (not the repo root) so the image
        // ships just this package; a scoped .dockerignore drops .venv/tests/data.
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(__dirname, "../../local-models"),
        ),
        memorySize: 1024, // headroom for scikit-learn + a loaded bundle
        timeout: cdk.Duration.seconds(30),
        // Bounded concurrency: inference is cheap, but cap blast radius/cost.
        reservedConcurrentExecutions: 20,
        environment: {
          LOCAL_MODELS_BUCKET: this.modelsBucket.bucketName,
          LOCAL_MODELS_PREFIX: MODELS_PREFIX,
        },
        logGroup: new logs.LogGroup(this, "LocalModelInferenceFnLogGroup", {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      },
    );

    // Inference only reads bundles; the offline trainer writes them.
    this.modelsBucket.grantRead(this.inferenceFunction);

    const errorAlarm = new cloudwatch.Alarm(this, "LocalModelInferenceErrors", {
      metric: this.inferenceFunction.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "Local-model inference Lambda is erroring",
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      // No invocations ⇒ no error datapoints; that's healthy, not an alarm.
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alarmSnsTopicArn) {
      const topic = sns.Topic.fromTopicArn(
        this,
        "AlarmTopic",
        props.alarmSnsTopicArn,
      );
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));

      // reservedConcurrentExecutions caps the function at 20; throttles are
      // tracked separately from errors, so alarm on them to catch capacity
      // pressure during bursts.
      const throttleAlarm = new cloudwatch.Alarm(
        this,
        "LocalModelInferenceThrottles",
        {
          metric: this.inferenceFunction.metricThrottles({
            period: cdk.Duration.minutes(5),
          }),
          threshold: 1,
          evaluationPeriods: 1,
          alarmDescription: "Local-model inference Lambda is being throttled",
          comparisonOperator:
            cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        },
      );
      throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
    }

    // -----------------------------------------------------------------------
    // Scheduled training task — the self-improvement loop.
    //
    // Weekly Fargate task that retrains a per-user bundle from the latest
    // label-rich export under training-data/ (which carries new threads and
    // user corrections) and writes the bundle under models/. Decoupled from the
    // data-feed: producing the per-user exports is the export service's job.
    // -----------------------------------------------------------------------
    const trainingCluster = new ecs.Cluster(this, "TrainingCluster", {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const trainingTask = new ecsPatterns.ScheduledFargateTask(
      this,
      "WeeklyTraining",
      {
        cluster: trainingCluster,
        // Sundays 03:00 UTC — off-peak.
        schedule: events.Schedule.cron({ weekDay: "SUN", hour: "3", minute: "0" }),
        vpc: props.vpc,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        scheduledFargateTaskImageOptions: {
          image: ecs.ContainerImage.fromAsset(
            path.join(__dirname, "../../local-models"),
            { file: "Dockerfile.train" },
          ),
          cpu: 1024,
          memoryLimitMiB: 4096, // headroom to train per-user models in-memory
          environment: {
            LOCAL_MODELS_BUCKET: this.modelsBucket.bucketName,
            TRAINING_DATA_PREFIX,
            MODELS_PREFIX,
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: "local-model-training",
            logRetention: logs.RetentionDays.ONE_MONTH,
          }),
        },
      },
    );

    // The trainer reads exports and writes bundles (the inference Lambda only reads).
    this.modelsBucket.grantReadWrite(trainingTask.taskDefinition.taskRole);

    new cdk.CfnOutput(this, "LocalModelsBucketName", {
      value: this.modelsBucket.bucketName,
    });
    new cdk.CfnOutput(this, "LocalModelInferenceFunctionName", {
      value: this.inferenceFunction.functionName,
    });
  }
}
