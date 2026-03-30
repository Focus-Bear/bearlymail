#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Aspects } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { BearlyMailStack } from '../lib/bearlymail-stack';
import { BearlyMailNetworkingStack } from '../lib/bearlymail-networking-stack';
import { BearlyMailSecretsStack } from '../lib/bearlymail-secrets-stack';
import { BearlyMailDatabaseStack } from '../lib/bearlymail-database-stack';
import { BearlyMailGitHubActionsStack } from '../lib/bearlymail-github-actions-stack';
import { BearlyMailContextAnalysisStack } from '../lib/bearlymail-context-analysis-stack';

const PERMISSIONS_BOUNDARY_ARN = 'arn:aws:iam::789877399450:policy/BearlyMail-PermissionBoundary';

class PermissionsBoundaryAspect implements cdk.IAspect {
  private readonly boundaryArn: string;

  constructor(boundaryArn: string) {
    this.boundaryArn = boundaryArn;
  }

  visit(node: IConstruct): void {
    // Catch L2 roles
    if (node instanceof cdk.aws_iam.Role) {
      const cfnRole = node.node.defaultChild as cdk.aws_iam.CfnRole;
      cfnRole.addPropertyOverride('PermissionsBoundary', this.boundaryArn);
    }
    // Catch L1 CfnRole directly
    if (node instanceof cdk.aws_iam.CfnRole) {
      node.addPropertyOverride('PermissionsBoundary', this.boundaryArn);
    }
    // Catch ANY CloudFormation resource of type AWS::IAM::Role
    if (node instanceof cdk.CfnResource && node.cfnResourceType === 'AWS::IAM::Role') {
      node.addPropertyOverride('PermissionsBoundary', this.boundaryArn);
    }
  }
}

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || '789877399450',
  region: 'ap-southeast-2', // Sydney
};

// Domain configuration
const domainName = 'app.bearlymail.com';
const hostedZoneId = 'Z04117591ORLVZWX6SSWO';

// ============================================
// 1. Networking Stack (VPC, Route53, Certificate)
// ============================================
const networkingStack = new BearlyMailNetworkingStack(app, 'BearlyMailNetworkingStack', {
  env,
  description: 'BearlyMail - Networking infrastructure (VPC, Route53, Certificate)',
  domainName,
  hostedZoneId,
});

// ============================================
// 2. Secrets Stack (Database & App Secrets)
// ============================================
const secretsStack = new BearlyMailSecretsStack(app, 'BearlyMailSecretsStack', {
  env,
  description: 'BearlyMail - Secrets (Database credentials, API keys)',
});

// ============================================
// 3. Database Stack (RDS PostgreSQL + DB secret)
// ============================================
const databaseStack = new BearlyMailDatabaseStack(app, 'BearlyMailDatabaseStack', {
  env,
  description: 'BearlyMail - Database (RDS PostgreSQL)',
  vpc: networkingStack.vpc,
});

// Database depends only on networking (DB secret is created inside this stack to avoid cycle)
databaseStack.addDependency(networkingStack);

// ============================================
// 4. Context Analysis Stack (SQS + Lambda + RDS Proxy) — BEFORE AppStack
// ============================================
const contextAnalysisStack = new BearlyMailContextAnalysisStack(app, 'BearlyMailContextAnalysisStack', {
  env,
  description: 'BearlyMail - Context Analysis (SQS + Lambda + RDS Proxy for parallel processing)',
  vpc: networkingStack.vpc,
  database: databaseStack.database,
  dbSecret: databaseStack.dbSecret,
  appSecrets: secretsStack.appSecrets,
  rdsProxy: databaseStack.rdsProxy,
  rdsProxyEndpoint: databaseStack.rdsProxyEndpoint,
  rdsProxySecurityGroup: databaseStack.rdsProxySecurityGroup,
  lambdaSecurityGroup: databaseStack.lambdaSecurityGroup,
});

contextAnalysisStack.addDependency(networkingStack);
contextAnalysisStack.addDependency(databaseStack);
contextAnalysisStack.addDependency(secretsStack);

// ============================================
// 5. Application Stack (ECS, S3, CloudFront) — depends on ContextAnalysisStack
// ============================================
const appStack = new BearlyMailStack(app, 'BearlyMailStack', {
  env,
  description: 'BearlyMail - Application (ECS services, S3, CloudFront)',
  vpc: networkingStack.vpc,
  certificateArn: networkingStack.certificateArn,
  hostedZone: networkingStack.hostedZone,
  domainName: networkingStack.domainName,
  apiDomainName: networkingStack.apiDomainName,
  apiCertificateArn: networkingStack.apiCertificateArn,
  queueDashboardDomainName: networkingStack.queueDashboardDomainName,
  queueDashboardCertificateArn: networkingStack.queueDashboardCertificateArn,
  database: databaseStack.database,
  dbSecret: databaseStack.dbSecret,
  appSecrets: secretsStack.appSecrets,
  contextAnalysisQueue: contextAnalysisStack.queue,
});

appStack.addDependency(networkingStack);
appStack.addDependency(secretsStack);
appStack.addDependency(databaseStack);
appStack.addDependency(contextAnalysisStack);

// ============================================
// 6. GitHub Actions Stack (OIDC Provider + Deployment Role)
// ============================================
const githubActionsStack = new BearlyMailGitHubActionsStack(app, 'BearlyMailGitHubActionsStack', {
  env,
  description: 'BearlyMail - GitHub Actions OIDC provider and deployment role',
  githubOrg: 'Focus-Bear',
  githubRepo: 'BearlyMail',
  permissionsBoundaryArn: PERMISSIONS_BOUNDARY_ARN,
});

// Apply permissions boundary to all IAM roles created by any stack
// This is required by the AWS account's SCP policy
// Uses CfnRole directly to catch ALL roles including CDK internal custom resource provider roles
Aspects.of(app).add(new PermissionsBoundaryAspect(PERMISSIONS_BOUNDARY_ARN));


