import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

/**
 * For GuardDuty Malware:S3/* findings, additionalInfo is a flat map of strings
 * (NOT a nested JSON string). The standard keys are s3ObjectKey and s3BucketName.
 */
interface MalwareAdditionalInfo {
  s3ObjectKey?: string;
  s3BucketName?: string;
  threatName?: string;
  threatFilePath?: string;
  [key: string]: string | undefined;
}

interface GuardDutyEvent {
  detail: {
    id: string;
    type: string;
    severity: number;
    accountId: string;
    region: string;
    service: {
      additionalInfo?: MalwareAdditionalInfo;
    };
    resource: {
      s3BucketDetails?: Array<{ name: string; arn: string }>;
    };
  };
}

/**
 * EventBridge handler for GuardDuty Malware:S3/* findings.
 *
 * On detection: delete the malicious S3 object immediately and emit a
 * structured CloudWatch log entry for the audit trail.
 *
 * Why delete rather than quarantine: feedback screenshots are not
 * business-critical; keeping malware around (even in a quarantine prefix)
 * is an unnecessary liability for a low-volume feature.
 */
export const handler = async (event: GuardDutyEvent): Promise<void> => {
  const { detail } = event;
  const { id: findingId, type: findingType, severity } = detail;

  if (!findingType.startsWith('Malware:S3/')) {
    console.log(
      JSON.stringify({ event: 'finding_skipped', findingType, reason: 'not_s3_malware' }),
    );
    return;
  }

  // The object details live directly inside additionalInfo for S3 Malware findings.
  const additionalInfo = detail.service?.additionalInfo;
  const objectKey = additionalInfo?.s3ObjectKey;
  let bucketName = additionalInfo?.s3BucketName;
  const threatName = additionalInfo?.threatName;

  // Fallback: bucket name may also appear in resource.s3BucketDetails
  if (!bucketName) {
    bucketName = detail.resource?.s3BucketDetails?.[0]?.name;
  }

  if (!bucketName || !objectKey) {
    console.error(
      JSON.stringify({
        event: 'missing_resource_info',
        findingId,
        findingType,
        detail: JSON.stringify(detail),
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: 'malware_detected',
      findingId,
      findingType,
      severity,
      bucket: bucketName,
      key: objectKey,
      threatName: threatName ?? 'unknown',
    }),
  );

  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey }));

  console.log(
    JSON.stringify({
      event: 'malicious_file_deleted',
      findingId,
      bucket: bucketName,
      key: objectKey,
    }),
  );
};
