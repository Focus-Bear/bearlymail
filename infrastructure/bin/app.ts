#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Aspects, IAspect } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { BearlyMailStack } from '../lib/bearlymail-stack';
import { BearlyMailNetworkingStack } from '../lib/bearlymail-networking-stack';

const PERMISSIONS_BOUNDARY_ARN = 'arn:aws:iam::789877399450:policy/BearlyMail-PermissionBoundary';

class PermissionsBoundaryAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof iam.Role || node instanceof iam.CfnRole) {
      const cfnRole = node instanceof iam.Role ? node.node.defaultChild as iam.CfnRole : node;
      if (cfnRole && !cfnRole.permissionsBoundary) {
        cfnRole.permissionsBoundary = PERMISSIONS_BOUNDARY_ARN;
      }
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
Aspects.of(app).add(new PermissionsBoundaryAspect());

