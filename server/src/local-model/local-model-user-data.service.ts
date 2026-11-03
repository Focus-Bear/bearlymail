import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  LEGACY_MODEL_EXTENSION,
  MODELS_PREFIX,
  S3_DELETE_BATCH_SIZE,
  TRAINING_DATA_EXTENSION,
  TRAINING_DATA_PREFIX,
} from "./local-model-storage.constants";

/**
 * Removes everything the local-model pipeline stores for one user: the
 * plaintext training export, the legacy flat model and every versioned bundle
 * plus its `current.json` pointer. Account deletion calls this so a deleted
 * user's email doesn't outlive their account in the models bucket. The bucket
 * is versioned, so old versions expire under its noncurrent-version lifecycle
 * rule.
 */
@Injectable()
export class LocalModelUserDataService {
  private readonly logger = new Logger(LocalModelUserDataService.name);
  private readonly s3: S3Client;
  private readonly bucket: string | undefined;

  constructor(configService: ConfigService) {
    const region = configService.get<string>("AWS_REGION") || "ap-southeast-2";
    this.s3 = new S3Client({ region });
    this.bucket = configService.get<string>("LOCAL_MODELS_BUCKET");
  }

  async deleteUserData(userId: string): Promise<number> {
    if (!this.bucket) return 0;

    const keys = [
      `${TRAINING_DATA_PREFIX}${userId}${TRAINING_DATA_EXTENSION}`,
      `${MODELS_PREFIX}${userId}${LEGACY_MODEL_EXTENSION}`,
      ...(await this.listKeys(`${MODELS_PREFIX}${userId}/`)),
    ];
    await this.deleteKeys(this.bucket, keys);
    this.logger.log(
      `Deleted ${keys.length} local-model objects for user ${userId}`,
    );
    return keys.length;
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return keys;
  }

  private async deleteKeys(bucket: string, keys: string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += S3_DELETE_BATCH_SIZE) {
      const batch = keys.slice(start, start + S3_DELETE_BATCH_SIZE);
      const result = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (result.Errors?.length) {
        throw new Error(
          `Failed to delete ${result.Errors.length} local-model objects: ${result.Errors.map((error) => `${error.Key} (${error.Code})`).join(", ")}`,
        );
      }
    }
  }
}
