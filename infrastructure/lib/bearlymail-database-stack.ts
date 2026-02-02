import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface BearlyMailDatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  databaseInstanceType?: ec2.InstanceType;
}

export class BearlyMailDatabaseStack extends cdk.Stack {
  public readonly database: rds.IDatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: BearlyMailDatabaseStackProps) {
    super(scope, id, props);

    if (!props.vpc) {
      throw new Error('VPC must be provided');
    }

    const vpc = props.vpc;

    // ============================================
    // Database Secret (created here to avoid cyclic dependency with Secrets stack)
    // ============================================
    this.dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      description: 'RDS PostgreSQL database credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'bearlymail' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // ============================================
    // RDS Database
    // ============================================
    const databaseInstanceType = props.databaseInstanceType || ec2.InstanceType.of(
      ec2.InstanceClass.T4G,
      ec2.InstanceSize.MICRO
    );

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      instanceType: databaseInstanceType,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      credentials: rds.Credentials.fromSecret(this.dbSecret),
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
    this.database.connections.allowDefaultPortFromAnyIpv4();

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'Database secret ARN',
      exportName: 'BearlyMail-DB-Secret-ARN',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'RDS database endpoint',
      exportName: 'BearlyMail-DB-Endpoint',
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.instanceEndpoint.port.toString(),
      description: 'RDS database port',
      exportName: 'BearlyMail-DB-Port',
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'bearlymail',
      description: 'RDS database name',
      exportName: 'BearlyMail-DB-Name',
    });
  }
}
