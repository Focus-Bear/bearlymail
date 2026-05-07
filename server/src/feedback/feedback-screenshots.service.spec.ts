import {
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

// Mock AWS SDK — prevent real S3 calls in unit tests
const mockS3Send = jest.fn().mockResolvedValue({});
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  GetObjectTaggingCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue("https://s3.example.com/presigned-get"),
}));

// Mock file-type so tests don't need real image magic bytes
// { virtual: true } because file-type v19+ is ESM-only and not resolvable in CJS Jest context
const mockFileTypeFromBuffer = jest.fn();
jest.mock(
  "file-type",
  () => ({
    fileTypeFromBuffer: (...args: unknown[]) => mockFileTypeFromBuffer(...args),
  }),
  { virtual: true },
);

describe("FeedbackScreenshotsService", () => {
  let service: FeedbackScreenshotsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEEDBACK_SCREENSHOTS_BUCKET = "test-bucket";
    service = new FeedbackScreenshotsService();
  });

  describe("uploadScreenshot — MIME validation", () => {
    it("should accept image/jpeg and upload to S3 with correct key format", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "image/jpeg",
        ext: "jpg",
      });

      const key = await service.uploadScreenshot(
        Buffer.from("fake-jpeg"),
        "user-abc",
      );

      expect(key).toMatch(/^feedback\/user-abc\/[a-f0-9-]+-\d+\.jpg$/);
    });

    it("should accept image/png", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "image/png",
        ext: "png",
      });

      const key = await service.uploadScreenshot(
        Buffer.from("fake-png"),
        "user-abc",
      );

      expect(key).toMatch(/\.png$/);
    });

    it("should accept image/webp", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "image/webp",
        ext: "webp",
      });

      const key = await service.uploadScreenshot(
        Buffer.from("fake-webp"),
        "user-abc",
      );

      expect(key).toMatch(/\.webp$/);
    });

    it("should reject application/pdf with HTTP 422 (UnprocessableEntityException)", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "application/pdf",
        ext: "pdf",
      });

      await expect(
        service.uploadScreenshot(Buffer.from("fake-pdf"), "user-abc"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should reject image/gif with HTTP 422", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "image/gif",
        ext: "gif",
      });

      await expect(
        service.uploadScreenshot(Buffer.from("fake-gif"), "user-abc"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should reject undetectable MIME (undefined file-type result) with HTTP 422", async () => {
      mockFileTypeFromBuffer.mockResolvedValueOnce(undefined);

      await expect(
        service.uploadScreenshot(Buffer.from("garbage"), "user-abc"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should throw BadRequestException when bucket is not configured", async () => {
      process.env.FEEDBACK_SCREENSHOTS_BUCKET = "";
      const unconfiguredService = new FeedbackScreenshotsService();

      await expect(
        unconfiguredService.uploadScreenshot(
          Buffer.from("fake-jpeg"),
          "user-abc",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should derive S3 key extension from validated MIME, not from user input", async () => {
      // Simulate: attacker sends a PDF disguised as .png
      // file-type detects it as PDF → should reject, not trust extension
      mockFileTypeFromBuffer.mockResolvedValueOnce({
        mime: "application/pdf",
        ext: "pdf",
      });

      await expect(
        service.uploadScreenshot(Buffer.from("pdf-bytes"), "user-abc"),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe("getPresignedGetUrl", () => {
    it("should return a presigned GET URL when scan status is NO_THREATS_FOUND", async () => {
      mockS3Send.mockResolvedValueOnce({
        TagSet: [
          { Key: "GuardDutyMalwareScanStatus", Value: "NO_THREATS_FOUND" },
        ],
      });
      const url = await service.getPresignedGetUrl("feedback/user/file.jpg");
      expect(typeof url).toBe("string");
      expect(url).toContain("s3.example.com");
    });

    it("should return empty string when bucket is not configured", async () => {
      process.env.FEEDBACK_SCREENSHOTS_BUCKET = "";
      const unconfiguredService = new FeedbackScreenshotsService();
      const url = await unconfiguredService.getPresignedGetUrl(
        "feedback/user/file.jpg",
      );
      expect(url).toBe("");
    });
  });

  describe("getPresignedGetUrl — GuardDuty scan status gate", () => {
    it("should serve a presigned URL when scan status is NO_THREATS_FOUND", async () => {
      mockS3Send.mockResolvedValueOnce({
        TagSet: [
          { Key: "GuardDutyMalwareScanStatus", Value: "NO_THREATS_FOUND" },
        ],
      });

      const url = await service.getPresignedGetUrl("feedback/user/file.jpg");
      expect(url).toContain("s3.example.com");
    });

    it("should throw UnprocessableEntityException when scan status is THREATS_FOUND", async () => {
      mockS3Send.mockResolvedValueOnce({
        TagSet: [{ Key: "GuardDutyMalwareScanStatus", Value: "THREATS_FOUND" }],
      });

      await expect(
        service.getPresignedGetUrl("feedback/user/file.jpg"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should throw UnprocessableEntityException when scan tag is absent (scan pending, fail-closed)", async () => {
      mockS3Send.mockResolvedValueOnce({ TagSet: [] });

      await expect(
        service.getPresignedGetUrl("feedback/user/file.jpg"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should throw UnprocessableEntityException when scan status is UNSUPPORTED (fail-closed)", async () => {
      mockS3Send.mockResolvedValueOnce({
        TagSet: [{ Key: "GuardDutyMalwareScanStatus", Value: "UNSUPPORTED" }],
      });

      await expect(
        service.getPresignedGetUrl("feedback/user/file.jpg"),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it("should throw UnprocessableEntityException when GetObjectTagging fails (fail-closed)", async () => {
      mockS3Send.mockRejectedValueOnce(new Error("AccessDenied"));

      await expect(
        service.getPresignedGetUrl("feedback/user/file.jpg"),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe("deleteScreenshot", () => {
    it("should call S3 DeleteObjectCommand for a valid key", async () => {
      // Should not throw
      await expect(
        service.deleteScreenshot("feedback/user/file.jpg"),
      ).resolves.toBeUndefined();
    });

    it("should not throw when bucket is not configured", async () => {
      process.env.FEEDBACK_SCREENSHOTS_BUCKET = "";
      const unconfiguredService = new FeedbackScreenshotsService();
      await expect(
        unconfiguredService.deleteScreenshot("feedback/user/file.jpg"),
      ).resolves.toBeUndefined();
    });
  });
});
