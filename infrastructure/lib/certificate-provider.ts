import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

/**
 * Lambda function code for creating ACM certificate in us-east-1 for CloudFront
 * This is a custom resource provider that handles certificate creation across regions
 */
export function getCertificateProviderFunction(
  scope: Construct,
  id: string,
  hostedZone: route53.IHostedZone
): lambda.Function {
  const certificateProvider = new lambda.Function(scope, id, {
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: 'index.handler',
    timeout: cdk.Duration.minutes(15),
    code: lambda.Code.fromInline(`
import boto3
import json
import time

acm = boto3.client('acm', region_name='us-east-1')
route53_client = boto3.client('route53')

def handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    request_type = event['RequestType']
    props = event['ResourceProperties']
    domain_name = props['DomainName']
    subject_alternative_names = props.get('SubjectAlternativeNames', [])
    hosted_zone_id = props['HostedZoneId']
    
    physical_resource_id = event.get('PhysicalResourceId')
    
    if request_type == 'Create':
        # Request certificate in us-east-1
        request_params = {
            'DomainName': domain_name,
            'ValidationMethod': 'DNS',
            'IdempotencyToken': f"cert{int(time.time())}"
        }
        if subject_alternative_names:
            request_params['SubjectAlternativeNames'] = subject_alternative_names
        
        cert_response = acm.request_certificate(**request_params)
        
        certificate_arn = cert_response['CertificateArn']
        print(f"Certificate ARN: {certificate_arn}")
        
        # Wait for certificate to be available
        time.sleep(5)
        
        # Get DNS validation records
        cert_detail = acm.describe_certificate(CertificateArn=certificate_arn)
        validation_options = cert_detail['Certificate']['DomainValidationOptions']
        
        # Create Route53 records for validation
        changes = []
        for option in validation_options:
            if 'ResourceRecord' in option:
                record = option['ResourceRecord']
                changes.append({
                    'Action': 'UPSERT',
                    'ResourceRecordSet': {
                        'Name': record['Name'],
                        'Type': record['Type'],
                        'TTL': 300,
                        'ResourceRecords': [{'Value': record['Value']}]
                    }
                })
        
        if changes:
            route53_client.change_resource_record_sets(
                HostedZoneId=hosted_zone_id,
                ChangeBatch={'Changes': changes}
            )
            print(f"Created {len(changes)} DNS validation records")
        
        return {
            'PhysicalResourceId': certificate_arn,
            'Data': {
                'CertificateArn': certificate_arn
            }
        }
        
    elif request_type == 'Update':
        return {
            'PhysicalResourceId': physical_resource_id,
            'Data': {
                'CertificateArn': physical_resource_id
            }
        }
        
    elif request_type == 'Delete':
        if physical_resource_id and physical_resource_id.startswith('arn:aws:acm:'):
            try:
                acm.delete_certificate(CertificateArn=physical_resource_id)
                print(f"Deleted certificate: {physical_resource_id}")
            except Exception as e:
                print(f"Error deleting certificate: {e}")
        
        return {
            'PhysicalResourceId': physical_resource_id
        }
      
    `),
  });

  // Grant permissions
  certificateProvider.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'acm:RequestCertificate',
        'acm:DescribeCertificate',
        'acm:DeleteCertificate',
        'acm:ListCertificates',
      ],
      resources: ['*'],
    })
  );

  certificateProvider.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:ChangeResourceRecordSets',
        'route53:GetChange',
      ],
      resources: [
        `arn:aws:route53:::hostedzone/${hostedZone.hostedZoneId}`,
        'arn:aws:route53:::change/*',
      ],
    })
  );

  return certificateProvider;
}

