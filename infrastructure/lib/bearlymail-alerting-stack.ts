import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";

export interface BearlyMailAlertingStackProps extends cdk.StackProps {
  /**
   * Email addresses to notify when any operational alarm fires.
   * Each address receives a one-time AWS "Confirm subscription" email that the
   * recipient must click before notifications start flowing — email-protocol
   * subscriptions cannot be auto-confirmed by CloudFormation.
   */
  readonly alertEmails: string[];
}

/**
 * Central operational-alerting stack.
 *
 * Owns the single SNS topic that every CloudWatch alarm across the other stacks
 * publishes to (database health, Lambda errors, decrypt failures, …). It has no
 * dependencies, so it is created first and its topic ARN is threaded into the
 * downstream stacks via their `alarmSnsTopicArn` prop. This is what gives the
 * previously-orphaned alarms (DB memory, CPU credits, Lambda errors) an actual
 * notification target.
 *
 * The topic is intentionally left unencrypted: alarm notifications carry only
 * alarm state/metadata (no user data), and an SSE-encrypted topic would require
 * a KMS key policy granting CloudWatch publish access — needless complexity for
 * an ops-alert channel.
 */
export class BearlyMailAlertingStack extends cdk.Stack {
  /** ARN of the shared alarm topic — pass as `alarmSnsTopicArn` to other stacks. */
  public readonly topicArn: string;

  constructor(
    scope: Construct,
    id: string,
    props: BearlyMailAlertingStackProps,
  ) {
    super(scope, id, props);

    if (!props.alertEmails || props.alertEmails.length === 0) {
      throw new Error(
        "BearlyMailAlertingStack requires at least one alert email address",
      );
    }

    const topic = new sns.Topic(this, "OpsAlertTopic", {
      topicName: "BearlyMail-Ops-Alerts",
      displayName: "BearlyMail Ops Alerts",
    });

    // The downstream stacks reference this topic via `fromTopicArn` (an
    // immutable import), so the `SnsAction` on their alarms cannot add the
    // publish permission for us. Grant CloudWatch publish explicitly on the
    // owning topic — without it CloudWatch silently fails to deliver alarm
    // notifications, defeating the whole point of the topic.
    topic.grantPublish(new iam.ServicePrincipal("cloudwatch.amazonaws.com"));

    for (const email of props.alertEmails) {
      topic.addSubscription(new snsSubscriptions.EmailSubscription(email));
    }

    this.topicArn = topic.topicArn;

    new cdk.CfnOutput(this, "OpsAlertTopicArn", {
      value: topic.topicArn,
      description: "SNS topic ARN for BearlyMail operational alarms",
      exportName: "BearlyMail-Ops-Alert-Topic-ARN",
    });
  }
}
