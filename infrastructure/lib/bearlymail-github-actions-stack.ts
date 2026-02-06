import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BearlyMailGitHubActionsStackProps extends cdk.StackProps {
  githubOrg: string;
  githubRepo: string;
  permissionsBoundaryArn?: string;
}

/**
 * Creates an OIDC provider and IAM role for GitHub Actions to deploy to AWS
 * without using static credentials (access keys).
 * 
 * This is more secure than using AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
 * because the credentials are short-lived and scoped to the specific repository.
 */
export class BearlyMailGitHubActionsStack extends cdk.Stack {
  public readonly deploymentRoleArn: string;

  constructor(scope: Construct, id: string, props: BearlyMailGitHubActionsStackProps) {
    super(scope, id, props);

    const { githubOrg, githubRepo, permissionsBoundaryArn } = props;

    // ============================================
    // GitHub Actions OIDC Provider
    // ============================================
    // This creates the trust relationship between GitHub Actions and AWS
    // The provider URL is always token.actions.githubusercontent.com for GitHub Actions
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHub's OIDC thumbprint - this is a well-known value
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1', '1c58a3a8518e8759bf075b76b750d4f2df264fcd'],
    });

    // ============================================
    // GitHub Actions Deployment Role
    // ============================================
    // This role can be assumed by GitHub Actions workflows from the specified repo
    const deploymentRole = new iam.Role(this, 'GitHubActionsDeploymentRole', {
      roleName: 'BearlyMail-GitHubActions-DeploymentRole',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            // Allow workflows from main branch OR using the Production environment
            // When a job uses `environment: Production`, the subject claim changes
            // from `repo:org/repo:ref:refs/heads/main` to `repo:org/repo:environment:Production`
            'token.actions.githubusercontent.com:sub': [
              `repo:${githubOrg}/${githubRepo}:ref:refs/heads/main`,
              `repo:${githubOrg}/${githubRepo}:environment:Production`,
            ],
          },
        }
      ),
      description: 'Role for GitHub Actions to deploy BearlyMail',
      maxSessionDuration: cdk.Duration.hours(1),
      permissionsBoundary: permissionsBoundaryArn
        ? iam.ManagedPolicy.fromManagedPolicyArn(this, 'PermissionsBoundary', permissionsBoundaryArn)
        : undefined,
    });

    // ============================================
    // Deployment Permissions
    // ============================================
    
    // CDK Deploy permissions (no destructive actions like DeleteStack)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CDKDeployPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResources',
        'cloudformation:GetTemplate',
        'cloudformation:GetTemplateSummary',
        'cloudformation:ListStacks',
        'cloudformation:ListStackResources',
        'cloudformation:ValidateTemplate',
        'cloudformation:CreateChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:ListChangeSets',
        'cloudformation:ListExports',
        'cloudformation:TagResource',
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: ['*'],
    }));

    // ECR permissions for Docker image push (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ECRPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeRepositories',
        'ecr:CreateRepository',
        'ecr:SetRepositoryPolicy',
        'ecr:GetRepositoryPolicy',
        'ecr:ListImages',
        'ecr:PutLifecyclePolicy',
        'ecr:GetLifecyclePolicy',
        'ecr:TagResource',
      ],
      resources: ['*'],
    }));

    // ECS permissions for service updates and running tasks (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ECSPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:DescribeTasks',
        'ecs:RunTask',
        'ecs:ListTasks',
        'ecs:DescribeTaskDefinition',
        'ecs:RegisterTaskDefinition',
        'ecs:ListTaskDefinitions',
        'ecs:DescribeClusters',
        'ecs:ListClusters',
        'ecs:CreateService',
        'ecs:TagResource',
      ],
      resources: ['*'],
    }));

    // EC2 permissions for VPC queries (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EC2Permissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeVpcs',
        'ec2:DescribeNetworkInterfaces',
        'ec2:CreateNetworkInterface',
        'ec2:DescribeAvailabilityZones',
        'ec2:CreateSecurityGroup',
        'ec2:AuthorizeSecurityGroupIngress',
        'ec2:AuthorizeSecurityGroupEgress',
        'ec2:CreateTags',
      ],
      resources: ['*'],
    }));

    // S3 permissions for frontend deployment (DeleteObject needed for sync --delete)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'S3Permissions',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:PutBucketPolicy',
        's3:GetBucketPolicy',
        's3:PutBucketWebsite',
        's3:GetBucketWebsite',
        's3:PutBucketPublicAccessBlock',
        's3:GetBucketPublicAccessBlock',
        's3:CreateBucket',
        's3:PutBucketTagging',
        's3:GetBucketTagging',
        's3:PutObjectTagging',
        's3:GetObjectTagging',
        's3:PutBucketOwnershipControls',
        's3:GetBucketOwnershipControls',
        's3:PutBucketCors',
        's3:GetBucketCors',
        's3:PutLifecycleConfiguration',
        's3:GetLifecycleConfiguration',
      ],
      resources: ['*'],
    }));

    // CloudFront permissions for cache invalidation (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudFrontPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudfront:CreateInvalidation',
        'cloudfront:GetInvalidation',
        'cloudfront:ListDistributions',
        'cloudfront:GetDistribution',
        'cloudfront:CreateDistribution',
        'cloudfront:UpdateDistribution',
        'cloudfront:TagResource',
        'cloudfront:CreateOriginAccessControl',
        'cloudfront:GetOriginAccessControl',
        'cloudfront:UpdateOriginAccessControl',
        'cloudfront:ListOriginAccessControls',
      ],
      resources: ['*'],
    }));

    // IAM permissions for CDK to create roles (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'IAMPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:GetRole',
        'iam:CreateRole',
        'iam:AttachRolePolicy',
        'iam:PutRolePolicy',
        'iam:GetRolePolicy',
        'iam:PassRole',
        'iam:TagRole',
        'iam:UpdateAssumeRolePolicy',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies',
        'iam:CreateServiceLinkedRole',
      ],
      resources: ['*'],
    }));

    // Secrets Manager permissions for reading secrets (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SecretsManagerPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret',
        'secretsmanager:CreateSecret',
        'secretsmanager:UpdateSecret',
        'secretsmanager:TagResource',
        'secretsmanager:GetResourcePolicy',
        'secretsmanager:PutResourcePolicy',
      ],
      resources: ['*'],
    }));

    // CloudWatch Logs permissions (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:DescribeLogGroups',
        'logs:CreateLogStream',
        'logs:DescribeLogStreams',
        'logs:PutLogEvents',
        'logs:GetLogEvents',
        'logs:FilterLogEvents',
        'logs:PutRetentionPolicy',
        'logs:TagResource',
      ],
      resources: ['*'],
    }));

    // Elastic Load Balancing permissions (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ELBPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:CreateLoadBalancer',
        'elasticloadbalancing:CreateTargetGroup',
        'elasticloadbalancing:CreateListener',
        'elasticloadbalancing:CreateRule',
        'elasticloadbalancing:ModifyLoadBalancerAttributes',
        'elasticloadbalancing:ModifyTargetGroup',
        'elasticloadbalancing:ModifyTargetGroupAttributes',
        'elasticloadbalancing:ModifyListener',
        'elasticloadbalancing:ModifyRule',
        'elasticloadbalancing:RegisterTargets',
        'elasticloadbalancing:DeregisterTargets',
        'elasticloadbalancing:SetSecurityGroups',
        'elasticloadbalancing:SetSubnets',
        'elasticloadbalancing:AddTags',
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeTargetHealth',
        'elasticloadbalancing:DescribeListeners',
        'elasticloadbalancing:DescribeRules',
        'elasticloadbalancing:DescribeTags',
        'elasticloadbalancing:DescribeLoadBalancerAttributes',
        'elasticloadbalancing:DescribeTargetGroupAttributes',
      ],
      resources: ['*'],
    }));

    // Route53 permissions for DNS
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'Route53Permissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:GetHostedZone',
        'route53:ListHostedZones',
        'route53:ChangeResourceRecordSets',
        'route53:GetChange',
        'route53:ListResourceRecordSets',
      ],
      resources: ['*'],
    }));

    // ACM permissions for certificates (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ACMPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'acm:DescribeCertificate',
        'acm:ListCertificates',
        'acm:GetCertificate',
        'acm:RequestCertificate',
        'acm:AddTagsToCertificate',
      ],
      resources: ['*'],
    }));

    // RDS permissions (for CDK to manage database stack, no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'RDSPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'rds:DescribeDBInstances',
        'rds:DescribeDBClusters',
        'rds:DescribeDBSubnetGroups',
        'rds:CreateDBSubnetGroup',
        'rds:ModifyDBSubnetGroup',
        'rds:AddTagsToResource',
        'rds:ListTagsForResource',
      ],
      resources: ['*'],
    }));

    // EventBridge permissions for scheduled tasks (no destructive actions)
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EventBridgePermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'events:PutRule',
        'events:DescribeRule',
        'events:PutTargets',
        'events:ListTargetsByRule',
        'events:TagResource',
      ],
      resources: ['*'],
    }));

    // STS permissions for assuming roles
    deploymentRole.addToPolicy(new iam.PolicyStatement({
      sid: 'STSPermissions',
      effect: iam.Effect.ALLOW,
      actions: [
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    this.deploymentRoleArn = deploymentRole.roleArn;

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'GitHubActionsDeploymentRoleArn', {
      value: deploymentRole.roleArn,
      description: 'ARN of the IAM role for GitHub Actions deployment',
      exportName: 'BearlyMail-GitHubActions-DeploymentRole-ARN',
    });

    new cdk.CfnOutput(this, 'GitHubOidcProviderArn', {
      value: githubOidcProvider.openIdConnectProviderArn,
      description: 'ARN of the GitHub OIDC provider',
      exportName: 'BearlyMail-GitHubOidcProvider-ARN',
    });
  }
}
