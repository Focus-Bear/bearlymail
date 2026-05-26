import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface BearlyMailDatabaseStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  /**
   * Optional explicit RDS instance type. When omitted, the size is resolved
   * from the `dbInstanceSize` CDK context value (defaulting to `t4g.small`).
   * See the instance-type resolution block below for details.
   */
  readonly databaseInstanceType?: ec2.InstanceType;
  /** Optional SNS topic ARN to notify when database health alarms fire. */
  readonly alarmSnsTopicArn?: string;
}

export class BearlyMailDatabaseStack extends cdk.Stack {
  public readonly database: rds.IDatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  /** RDS Proxy for connection pooling (used by Lambda in ContextAnalysisStack) */
  public readonly rdsProxy: rds.DatabaseProxy;
  /** RDS Proxy endpoint — use as DB_HOST for Lambda */
  public readonly rdsProxyEndpoint: string;
  /** Security group for the RDS Proxy — other stacks add ingress rules to this */
  public readonly rdsProxySecurityGroup: ec2.SecurityGroup;

  /**
   * Security group for the context analysis Lambda.
   * Created here (alongside rdsProxySecurityGroup) so the ingress rule
   * `rdsProxySecurityGroup.addIngressRule(lambdaSecurityGroup, ...)` stays
   * within a single stack and avoids a cross-stack cyclic reference.
   */
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;


  constructor(
    scope: Construct,
    id: string,
    props: BearlyMailDatabaseStackProps,
  ) {
    super(scope, id, props);

    if (!props.vpc) {
      throw new Error("VPC must be provided");
    }

    const vpc = props.vpc;

    // ============================================
    // Database Secret (created here to avoid cyclic dependency with Secrets stack)
    // ============================================
    this.dbSecret = new secretsmanager.Secret(this, "DatabaseSecret", {
      description: "RDS PostgreSQL database credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "bearlymail" }),
        generateStringKey: "password",
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // ============================================
    // RDS Database
    // ============================================
    // Instance size is configurable via CDK context (`dbInstanceSize`) so it can
    // be tuned per environment without code changes, e.g.:
    //   cdk deploy BearlyMailDatabaseStack -c dbInstanceSize=micro
    //
    // Production default is `t4g.small` (2 GB RAM), bumped up from `t4g.micro`
    // (1 GB). CloudWatch on the micro instance showed FreeableMemory bottoming
    // out around ~90 MB with write latency spiking to ~110ms — memory pressure
    // was forcing query spills to disk and amplifying slow queries (issue #2221).
    // This is a conservative one-step bump; a resize is reversible by changing
    // this value back, but triggers a brief failover/restart (Multi-AZ) so it
    // must be scheduled in a maintenance window.
    const dbInstanceSizeContext = this.node.tryGetContext("dbInstanceSize") as
      | string
      | undefined;
    const dbInstanceSize = resolveInstanceSize(dbInstanceSizeContext);

    const databaseInstanceType =
      props.databaseInstanceType ||
      ec2.InstanceType.of(ec2.InstanceClass.T4G, dbInstanceSize);

    this.database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: databaseInstanceType,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      databaseName: "bearlymail",
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete DB on stack deletion
      deletionProtection: false, // Set to true in production
      multiAz: true,
      publiclyAccessible: false,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
    });

    // Allow ECS tasks to connect to RDS
    this.database.connections.allowDefaultPortFromAnyIpv4();

    // ============================================
    // CloudWatch Alarms (RDS memory + burst capacity)
    //
    // These watch for the failure mode described in issue #2221: low free
    // memory (query spills, latency spikes) and exhausted burst credits on the
    // t4g burstable instance class. Alarm actions are only wired up when an SNS
    // topic ARN is supplied (matching the pattern in the other stacks).
    // ============================================
    // Scale the FreeableMemory threshold to 10% of total RAM so the alarm stays
    // meaningful across instance sizes — a static threshold would either fire
    // constantly on micro (where 200 MB is 20% of RAM) or fire too late on
    // large (where 200 MB is ~2.5%).
    const sizeStr =
      databaseInstanceType.toString().split(".")[1]?.toLowerCase() || "small";
    const ramBytesBySize: Record<string, number> = {
      micro: 1 * 1024 * 1024 * 1024,
      small: 2 * 1024 * 1024 * 1024,
      medium: 4 * 1024 * 1024 * 1024,
      large: 8 * 1024 * 1024 * 1024,
    };
    const totalRamBytes = ramBytesBySize[sizeStr] || 2 * 1024 * 1024 * 1024;
    const freeableMemoryThreshold = totalRamBytes * 0.1;

    const lowFreeableMemoryAlarm = new cloudwatch.Alarm(
      this,
      "LowFreeableMemoryAlarm",
      {
        alarmName: "BearlyMail-Database-LowFreeableMemory",
        alarmDescription:
          "RDS FreeableMemory is low - risk of query spills and write latency spikes (issue #2221)",
        metric: this.database.metricFreeableMemory({
          period: cdk.Duration.minutes(5),
          statistic: "Minimum",
        }),
        threshold: freeableMemoryThreshold,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    // CPUCreditBalance is only emitted for burstable (t-series) instances. Skip
    // the alarm entirely for non-burstable classes so it doesn't sit in
    // INSUFFICIENT_DATA forever cluttering the dashboard.
    const isBurstable = databaseInstanceType
      .toString()
      .toLowerCase()
      .startsWith("t");
    let lowCpuCreditBalanceAlarm: cloudwatch.Alarm | undefined;
    if (isBurstable) {
      lowCpuCreditBalanceAlarm = new cloudwatch.Alarm(
        this,
        "LowCpuCreditBalanceAlarm",
        {
          alarmName: "BearlyMail-Database-LowCpuCreditBalance",
          alarmDescription:
            "RDS CPUCreditBalance is low - burstable instance is close to CPU throttling",
          metric: this.database.metric("CPUCreditBalance", {
            period: cdk.Duration.minutes(5),
            statistic: "Minimum",
          }),
          threshold: 20,
          evaluationPeriods: 3,
          comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        },
      );
    }

    if (props.alarmSnsTopicArn) {
      const alarmTopic = sns.Topic.fromTopicArn(
        this,
        "DatabaseAlarmTopic",
        props.alarmSnsTopicArn,
      );
      lowFreeableMemoryAlarm.addAlarmAction(
        new cloudwatchActions.SnsAction(alarmTopic),
      );
      if (lowCpuCreditBalanceAlarm) {
        lowCpuCreditBalanceAlarm.addAlarmAction(
          new cloudwatchActions.SnsAction(alarmTopic),
        );
      }
    }

    // ============================================
    // RDS Proxy (lives here to avoid cyclic dependency with ContextAnalysisStack)
    // ============================================
    this.rdsProxySecurityGroup = new ec2.SecurityGroup(
      this,
      "RdsProxySecurityGroup",
      {
        vpc,
        description: "Security group for RDS Proxy (Lambda to RDS)",
        allowAllOutbound: true,
      },
    );

    this.rdsProxy = new rds.DatabaseProxy(this, "RdsProxy", {
      proxyTarget: rds.ProxyTarget.fromInstance(
        this.database as rds.DatabaseInstance,
      ),
      secrets: [this.dbSecret],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.rdsProxySecurityGroup],
      dbProxyName: "bearlymail-rds-proxy",
      requireTLS: true,
      idleClientTimeout: cdk.Duration.minutes(10),
      maxConnectionsPercent: 50,
      maxIdleConnectionsPercent: 25,
    });

    this.rdsProxyEndpoint = this.rdsProxy.endpoint;

    // ============================================
    // Lambda Security Group (for ContextAnalysisStack)
    //
    // Both this SG and rdsProxySecurityGroup live in DatabaseStack, so the
    // ingress rule below produces no cross-stack reference and no cyclic dep.
    // ============================================
    this.lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      "LambdaSecurityGroup",
      {
        vpc,
        description: "Security group for context analysis Lambda",
        allowAllOutbound: true,
      },
    );

    this.rdsProxySecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow Lambda to connect via RDS Proxy",
    );

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, "DatabaseSecretArn", {
      value: this.dbSecret.secretArn,
      description: "Database secret ARN",
      exportName: "BearlyMail-DB-Secret-ARN",
    });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: this.database.instanceEndpoint.hostname,
      description: "RDS database endpoint",
      exportName: "BearlyMail-DB-Endpoint",
    });

    new cdk.CfnOutput(this, "DatabasePort", {
      value: this.database.instanceEndpoint.port.toString(),
      description: "RDS database port",
      exportName: "BearlyMail-DB-Port",
    });

    new cdk.CfnOutput(this, "DatabaseName", {
      value: "bearlymail",
      description: "RDS database name",
      exportName: "BearlyMail-DB-Name",
    });

    new cdk.CfnOutput(this, "RdsProxyEndpoint", {
      value: this.rdsProxy.endpoint,
      description: "RDS Proxy endpoint for Lambda DB connections",
      exportName: "BearlyMail-RdsProxy-Endpoint",
    });
  }
}

/**
 * Resolves the `dbInstanceSize` CDK context value to an `ec2.InstanceSize`.
 *
 * Defaults to `SMALL` (t4g.small, 2 GB) when no context is supplied — see the
 * FreeableMemory evidence in issue #2221 for why micro (1 GB) was insufficient.
 * Only a small allowlist of sizes is accepted to avoid typos silently
 * provisioning an unexpected (and potentially expensive) instance.
 */
function resolveInstanceSize(
  contextValue: string | undefined,
): ec2.InstanceSize {
  const allowed: Record<string, ec2.InstanceSize> = {
    micro: ec2.InstanceSize.MICRO,
    small: ec2.InstanceSize.SMALL,
    medium: ec2.InstanceSize.MEDIUM,
    large: ec2.InstanceSize.LARGE,
  };

  if (contextValue === undefined || contextValue === null) {
    return ec2.InstanceSize.SMALL;
  }

  // Coerce + trim so non-string values from cdk.json (e.g. an accidental number
  // or boolean) don't blow up at `.toLowerCase()`, and so stray whitespace
  // doesn't cause the lookup to miss.
  const normalized = String(contextValue).trim().toLowerCase();
  if (!normalized) {
    return ec2.InstanceSize.SMALL;
  }

  const size = allowed[normalized];
  if (!size) {
    throw new Error(
      `Unsupported dbInstanceSize "${contextValue}". ` +
        `Allowed values: ${Object.keys(allowed).join(", ")}.`,
    );
  }
  return size;
}
