import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { getCertificateProviderFunction } from './certificate-provider';

export interface BearlyMailNetworkingStackProps extends cdk.StackProps {
  // Domain configuration
  domainName?: string; // e.g., 'app.bearlymail.com'
  hostedZoneId?: string; // Route53 hosted zone ID
}

export class BearlyMailNetworkingStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly certificateArn: string;
  public readonly hostedZone: route53.IHostedZone;
  public readonly domainName?: string;

  constructor(scope: Construct, id: string, props?: BearlyMailNetworkingStackProps) {
    super(scope, id, props);

    // ============================================
    // VPC Setup
    // ============================================
    this.vpc = new ec2.Vpc(this, 'BearlyMailVpc', {
      maxAzs: 2,
      natGateways: 1, // Single NAT gateway for cost optimization
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ============================================
    // Route53 & SSL Certificate
    // ============================================
    let hostedZone: route53.IHostedZone | undefined;
    let certificateArn: string | undefined;
    let domainName: string | undefined;

    // If domain is provided, set up Route53 and SSL
    if (props?.domainName && props?.hostedZoneId) {
      domainName = props.domainName;
      this.domainName = domainName;

      // Extract root domain for hosted zone lookup
      // If domain is a subdomain (e.g., app.bearlymail.com), extract root (bearlymail.com)
      const rootDomain = domainName.includes('.') && domainName.split('.').length > 2
        ? domainName.split('.').slice(-2).join('.')
        : domainName;

      // Look up the hosted zone (using root domain)
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: rootDomain,
      });
      this.hostedZone = hostedZone;

      // Create certificate in us-east-1 for CloudFront using custom resource
      // Only add www subdomain if domain is a root domain (not a subdomain)
      const isSubdomain = domainName.includes('.') && domainName.split('.').length > 2;
      const subjectAlternativeNames = isSubdomain ? [] : [`www.${domainName}`];

      // Create the certificate provider Lambda function
      const certificateProviderFunction = getCertificateProviderFunction(this, 'CertificateLambdaFunction', hostedZone);

      // Create custom resource provider with unique name
      const certificateResourceProvider = new cr.Provider(this, 'CertificateProvider', {
        onEventHandler: certificateProviderFunction,
      });

      const certificateCustomResource = new cdk.CustomResource(this, 'CloudFrontCertificateResource', {
        serviceToken: certificateResourceProvider.serviceToken,
        properties: {
          DomainName: domainName,
          SubjectAlternativeNames: subjectAlternativeNames,
          HostedZoneId: hostedZone.hostedZoneId,
        },
      });

      certificateArn = certificateCustomResource.getAttString('CertificateArn');
      this.certificateArn = certificateArn;
    }

    // ============================================
    // Outputs
    // ============================================
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'BearlyMail-VPC-ID',
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR block',
      exportName: 'BearlyMail-VPC-CIDR',
    });

    if (hostedZone) {
      new cdk.CfnOutput(this, 'HostedZoneId', {
        value: hostedZone.hostedZoneId,
        description: 'Route53 Hosted Zone ID',
        exportName: 'BearlyMail-HostedZone-ID',
      });

      new cdk.CfnOutput(this, 'HostedZoneName', {
        value: hostedZone.zoneName,
        description: 'Route53 Hosted Zone Name',
        exportName: 'BearlyMail-HostedZone-Name',
      });
    }

    if (certificateArn) {
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: certificateArn,
        description: 'ACM Certificate ARN (us-east-1) for CloudFront',
        exportName: 'BearlyMail-Certificate-ARN',
      });
    }

    if (domainName) {
      new cdk.CfnOutput(this, 'DomainName', {
        value: domainName,
        description: 'Domain name',
        exportName: 'BearlyMail-Domain-Name',
      });
    }
  }
}

