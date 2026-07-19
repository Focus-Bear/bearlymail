import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailExport } from "../database/entities/email-export.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { EmailExportService } from "./email-export.service";
import { EmailExportJobService } from "./email-export-job.service";
import { EmailExportStorageService } from "./email-export-storage.service";

describe("EmailExportJobService", () => {
  let service: EmailExportJobService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const mockExportService = {
    buildEncryptedZipStream: jest.fn(),
  };
  const mockStorage = {
    uploadStream: jest.fn(),
    getPresignedUrl: jest.fn(),
  };
  const mockBoss = { send: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailExportJobService,
        { provide: getRepositoryToken(EmailExport), useValue: mockRepo },
        { provide: EmailExportService, useValue: mockExportService },
        { provide: EmailExportStorageService, useValue: mockStorage },
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
      ],
    }).compile();

    service = module.get(EmailExportJobService);

    // Mimic real encryption: produce an opaque token that does NOT contain the
    // plaintext, so the "no plaintext in the queued payload" assertion is real.
    jest
      .spyOn(EncryptionHelper, "encrypt")
      .mockImplementation((value) =>
        value == null ? null : `enc:${Buffer.from(value).toString("base64")}`,
      );
    jest
      .spyOn(EncryptionHelper, "decrypt")
      .mockImplementation((value) =>
        typeof value === "string" && value.startsWith("enc:")
          ? Buffer.from(value.slice(4), "base64").toString("utf8")
          : null,
      );
  });

  afterEach(() => jest.clearAllMocks());

  describe("requestExport", () => {
    it("rejects short passwords without enqueueing", async () => {
      await expect(service.requestExport("user-1", "short")).rejects.toThrow(
        BadRequestException,
      );
      expect(mockBoss.send).not.toHaveBeenCalled();
    });

    it("creates a pending record and enqueues the job with an encrypted password", async () => {
      mockRepo.create.mockReturnValue({ id: "exp-1", userId: "user-1" });
      mockRepo.save.mockResolvedValue({ id: "exp-1" });

      const result = await service.requestExport("user-1", "longenoughpw");

      expect(result).toEqual({ exportId: "exp-1" });
      expect(mockRepo.create).toHaveBeenCalledWith({
        userId: "user-1",
        status: "pending",
      });
      expect(mockBoss.send).toHaveBeenCalledTimes(1);
      const [jobName, payload] = mockBoss.send.mock.calls[0];
      expect(jobName).toBe(JOB_NAMES.EXPORT_EMAILS);
      expect(payload).toMatchObject({
        userId: "user-1",
        exportId: "exp-1",
        encryptedPassword: `enc:${Buffer.from("longenoughpw").toString("base64")}`,
      });
      // The plaintext password must never appear in the queued payload.
      expect(JSON.stringify(payload)).not.toContain("longenoughpw");
    });
  });

  describe("runExport", () => {
    const data = {
      userId: "user-1",
      exportId: "exp-1",
      encryptedPassword: `enc:${Buffer.from("secretpw").toString("base64")}`,
    };

    it("streams the zip to S3 and marks the export completed", async () => {
      const archive = { fake: "stream" };
      mockExportService.buildEncryptedZipStream.mockReturnValue({
        archive,
        recordCount: () => 2,
      });
      mockStorage.uploadStream.mockResolvedValue({ bytes: 4096 });

      await service.runExport(data);

      expect(mockExportService.buildEncryptedZipStream).toHaveBeenCalledWith(
        "user-1",
        "secretpw",
      );
      expect(mockStorage.uploadStream).toHaveBeenCalledWith(
        "exports/user-1/exp-1.zip",
        archive,
      );
      const completion = mockRepo.update.mock.calls.find(
        ([, patch]) => patch.status === "completed",
      );
      expect(completion?.[1]).toMatchObject({
        status: "completed",
        s3Key: "exports/user-1/exp-1.zip",
        fileSize: 4096,
        emailCount: 2,
      });
    });

    it("marks the export failed and rethrows on error", async () => {
      mockExportService.buildEncryptedZipStream.mockReturnValue({
        archive: { fake: "stream" },
        recordCount: () => 0,
      });
      mockStorage.uploadStream.mockRejectedValue(new Error("s3 down"));

      await expect(service.runExport(data)).rejects.toThrow("s3 down");
      const failure = mockRepo.update.mock.calls.find(
        ([, patch]) => patch.status === "failed",
      );
      expect(failure?.[1]).toMatchObject({
        status: "failed",
        errorMessage: "s3 down",
      });
    });
  });

  describe("getStatus", () => {
    it("throws NotFound when the export does not belong to the user", async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getStatus("user-1", "exp-x")).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: "exp-x", userId: "user-1" },
      });
    });

    it("returns a presigned download URL only when completed", async () => {
      mockRepo.findOne.mockResolvedValue({
        id: "exp-1",
        status: "completed",
        s3Key: "exports/user-1/exp-1.zip",
        emailCount: 5,
        fileSize: 100,
        errorMessage: null,
        createdAt: new Date(0),
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockStorage.getPresignedUrl.mockResolvedValue("https://signed");

      const dto = await service.getStatus("user-1", "exp-1");
      expect(dto.downloadUrl).toBe("https://signed");
      expect(mockStorage.getPresignedUrl).toHaveBeenCalledWith(
        "exports/user-1/exp-1.zip",
      );
    });

    it("does not presign once the export has expired", async () => {
      mockRepo.findOne.mockResolvedValue({
        id: "exp-1",
        status: "completed",
        s3Key: "exports/user-1/exp-1.zip",
        emailCount: 5,
        fileSize: 100,
        errorMessage: null,
        createdAt: new Date(0),
        expiresAt: new Date(Date.now() - 60_000),
      });

      const dto = await service.getStatus("user-1", "exp-1");
      expect(dto.downloadUrl).toBeUndefined();
      expect(mockStorage.getPresignedUrl).not.toHaveBeenCalled();
    });

    it("does not presign while still running", async () => {
      mockRepo.findOne.mockResolvedValue({
        id: "exp-1",
        status: "running",
        s3Key: null,
        emailCount: null,
        fileSize: null,
        errorMessage: null,
        createdAt: new Date(0),
        expiresAt: null,
      });

      const dto = await service.getStatus("user-1", "exp-1");
      expect(dto.downloadUrl).toBeUndefined();
      expect(mockStorage.getPresignedUrl).not.toHaveBeenCalled();
    });
  });
});
