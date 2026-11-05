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

/** The user id in `training-data/<id>.json`, `models/<id>.joblib` or `models/<id>/...`. */
const USER_ID_IN_KEY =
  /^[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[./]/i;

/**
 * Removes everything the local-model pipeline stores for one user: the
 * plaintext training export, the legacy flat model and every versioned bundle
 * plus its `current.json` pointer. Account deletion calls this so a deleted
 * user's email doesn't outlive their account in the models bucket. The bucket
 * is versioned, so old versions expire under its noncurrent-version lifecycle
 * rule.
 *
 * The web task sets LOCAL_MODELS_CLEANUP_BUCKET instead of LOCAL_MODELS_BUCKET,
 * because LOCAL_MODELS_BUCKET also switches on the training export, which
 * belongs on the worker. Account deletion runs on both.
 */
@Injectable()
export class LocalModelUserDataService {
  private readonly logger = new Logger(LocalModelUserDataService.name);
  private readonly s3: S3Client;
  private readonly bucket: string | undefined;

  constructor(configService: ConfigService) {
    const region = configService.get<string>("AWS_REGION") || "ap-southeast-2";
    this.s3 = new S3Client({ region });
    this.bucket =
      configService.get<string>("LOCAL_MODELS_CLEANUP_BUCKET") ||
      configService.get<string>("LOCAL_MODELS_BUCKET");
  }

  async deleteUserData(userId: string): Promise<number> {
    if (!this.bucket) return 0;

    // The known keys go first: the export holds the user's email in plaintext,
    // so a failure listing the model bundles must not leave it behind.
    const knownKeys = [
      `${TRAINING_DATA_PREFIX}${userId}${TRAINING_DATA_EXTENSION}`,
      `${MODELS_PREFIX}${userId}${LEGACY_MODEL_EXTENSION}`,
    ];
    await this.deleteKeys(this.bucket, knownKeys);
    const bundleKeys = await this.listKeys(`${MODELS_PREFIX}${userId}/`);
    await this.deleteKeys(this.bucket, bundleKeys);

    const deletedCount = knownKeys.length + bundleKeys.length;
    this.logger.log(
      `Deleted ${deletedCount} local-model objects for user ${userId}`,
    );
    return deletedCount;
  }

  /** Every user id with data in the bucket. Keys in any other shape are ignored. */
  async findStoredUserIds(): Promise<string[]> {
    if (!this.bucket) return [];

    const keys = [
      ...(await this.listKeys(TRAINING_DATA_PREFIX)),
      ...(await this.listKeys(MODELS_PREFIX)),
    ];
    const userIds = keys.flatMap((key) => {
      const userId = USER_ID_IN_KEY.exec(key)?.[1];
      return userId ? [userId] : [];
    });
    return [...new Set(userIds)];
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
