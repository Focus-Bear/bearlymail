import { Injectable, Logger } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

/** How long (seconds) a presigned download URL stays valid. */
const PRESIGN_GET_EXPIRY_SECONDS = 300;

/**
 * Stores finished email-export ZIPs in S3 and hands back short-lived presigned
 * download URLs. Mirrors {@link FeedbackScreenshotsService}: the client is
 * constructed without explicit credentials so it uses the ECS task role's
 * default credential chain, and the bucket name comes from `EMAIL_EXPORTS_BUCKET`.
 *
 * The exports bucket has a short S3 lifecycle expiry (see CDK), so objects are
 * cleaned up automatically and `deleteObject` is only a best-effort early purge.
 */
@Injectable()
export class EmailExportStorageService {
  private readonly logger = new Logger(EmailExportStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    const region =
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    this.bucket = process.env.EMAIL_EXPORTS_BUCKET || "";
    this.s3 = new S3Client({ region });

    if (!this.bucket) {
      this.logger.warn(
        "EMAIL_EXPORTS_BUCKET not configured – email exports will fail",
      );
    }
  }

  isConfigured(): boolean {
    return this.bucket.length > 0;
  }

  /**
   * Streams `body` to S3 via a multipart upload (`@aws-sdk/lib-storage`), so the
   * full ZIP is never held in memory. Returns the number of bytes uploaded.
   *
   * This is the whole point of the async export: a large mailbox's ZIP can be
   * hundreds of MB, and buffering it (PutObject on a Buffer) OOM-killed the
   * worker mid-build, leaving the job stuck in "running" (#2024).
   */
  async uploadStream(key: string, body: Readable): Promise<{ bytes: number }> {
    if (!this.bucket) {
      throw new Error("EMAIL_EXPORTS_BUCKET not configured");
    }

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "application/zip",
        ACL: "private",
      },
    });

    let bytes = 0;
    upload.on("httpUploadProgress", (progress) => {
      if (progress.loaded) {
        bytes = progress.loaded;
      }
    });

    await upload.done();
    this.logger.log(`Uploaded email export: key=${key}, bytes=${bytes}`);
    return { bytes };
  }

  async getPresignedUrl(key: string): Promise<string> {
    if (!this.bucket) {
      throw new Error("EMAIL_EXPORTS_BUCKET not configured");
    }
    // ResponseContentDisposition forces a clean download filename even though the
    // S3 object key is `{exportId}.zip` — the browser's own `download` attribute
    // is ignored on cross-origin (S3) URLs, so we set the header at presign time.
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: "application/zip",
      ResponseContentDisposition: `attachment; filename="bearlymail-emails.zip"`,
    });
    return getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_GET_EXPIRY_SECONDS,
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.bucket) {
      return;
    }
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete export key="${key}"`, err);
    }
  }
}
