#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Aspects } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { BearlyMailStack } from '../lib/bearlymail-stack';
import { BearlyMailNetworkingStack } from '../lib/bearlymail-networking-stack';

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

// Create networking stack first (VPC, Route53, Certificate)
const networkingStack = new BearlyMailNetworkingStack(app, 'BearlyMailNetworkingStack', {
  env,
  description: 'BearlyMail - Networking infrastructure (VPC, Route53, Certificate)',
  domainName,
  hostedZoneId,
});

// Create application stack (depends on networking stack)
const appStack = new BearlyMailStack(app, 'BearlyMailStack', {
  env,
  description: 'BearlyMail - Application infrastructure (ECS, RDS, S3, CloudFront)',
  vpc: networkingStack.vpc,
  certificateArn: networkingStack.certificateArn,
  hostedZone: networkingStack.hostedZone,
  domainName: networkingStack.domainName,
});

// Ensure application stack depends on networking stack
appStack.addDependency(networkingStack);

// Apply permissions boundary to all IAM roles created by any stack
// This is required by the AWS account's SCP policy
// Uses CfnRole directly to catch ALL roles including CDK internal custom resource provider roles
Aspects.of(app).add(new PermissionsBoundaryAspect(PERMISSIONS_BOUNDARY_ARN));

