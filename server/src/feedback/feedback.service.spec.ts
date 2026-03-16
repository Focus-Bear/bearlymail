import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Feedback } from "../database/entities/feedback.entity";
import { UsersService } from "../users/users.service";
import { CreateFeedbackDto } from "./create-feedback.dto";
import { FeedbackService } from "./feedback.service";
import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

const mockFeedbackRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
};

const mockUsersService = {
  findOne: jest.fn(),
};

const mockScreenshotsService = {
  uploadScreenshot: jest.fn(),
  getPresignedGetUrl: jest.fn(),
  deleteScreenshot: jest.fn(),
};

describe("FeedbackService", () => {
  let service: FeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(Feedback),
          useValue: mockFeedbackRepo,
        },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: FeedbackScreenshotsService,
          useValue: mockScreenshotsService,
        },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  describe("createFeedback", () => {
    it("should create and save feedback with user email (happy path)", async () => {
      const dto: CreateFeedbackDto = { message: "Great app!" };
      const userId = "user-1";
      const mockUser = { id: userId, email: "user@example.com" };
      const createdEntity = {
        id: "fb-1",
        message: dto.message,
        userEmailEncrypted: mockUser.email,
        screenshotS3Key: null,
        userAgent: "TestAgent/1.0",
        appVersion: "1.0.0",
        createdAt: new Date(),
      } as Feedback;

      mockUsersService.findOne.mockResolvedValueOnce(mockUser);
      mockFeedbackRepo.create.mockReturnValueOnce(createdEntity);
      mockFeedbackRepo.save.mockResolvedValueOnce(createdEntity);

      const result = await service.createFeedback(
        userId,
        dto,
        "TestAgent/1.0",
        "1.0.0",
      );

      expect(mockUsersService.findOne).toHaveBeenCalledWith(userId);
      expect(mockFeedbackRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Great app!",
          userEmailEncrypted: "user@example.com",
          screenshotS3Key: null,
          userAgent: "TestAgent/1.0",
          appVersion: "1.0.0",
        }),
      );
      expect(mockFeedbackRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toBe(createdEntity);
    });

    it("should create feedback with null email when user is not found", async () => {
      const dto: CreateFeedbackDto = { message: "Anonymous feedback" };
      const userId = "unknown-user";
      const savedEntity = {
        id: "fb-2",
        message: dto.message,
        userEmailEncrypted: null,
        screenshotS3Key: null,
        userAgent: null,
        appVersion: null,
        createdAt: new Date(),
      } as Feedback;

      mockUsersService.findOne.mockResolvedValueOnce(null);
      mockFeedbackRepo.create.mockReturnValueOnce(savedEntity);
      mockFeedbackRepo.save.mockResolvedValueOnce(savedEntity);

      const result = await service.createFeedback(userId, dto);

      expect(mockFeedbackRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userEmailEncrypted: null }),
      );
      expect(result).toBe(savedEntity);
    });

    it("should create feedback with screenshotS3Key when provided", async () => {
      const dto: CreateFeedbackDto = {
        message: "With screenshot",
        screenshotS3Key: "feedback/abc-123.png",
      };

      mockUsersService.findOne.mockResolvedValueOnce({ email: "u@x.com" });
      mockFeedbackRepo.create.mockReturnValueOnce({});
      mockFeedbackRepo.save.mockResolvedValueOnce({ id: "fb-3" });

      await service.createFeedback("user-2", dto);

      expect(mockFeedbackRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ screenshotS3Key: "feedback/abc-123.png" }),
      );
    });
  });

  describe("listFeedback", () => {
    it("should return paginated items with screenshotUrl and total", async () => {
      const rows = [
        {
          id: "fb-10",
          message: "Hello",
          userEmailEncrypted: "user@example.com",
          screenshotS3Key: "feedback/abc.jpg",
          createdAt: new Date("2026-01-01"),
          appVersion: "2.0",
          userAgent: "Chrome",
        } as Feedback,
      ];
      const presignedUrl = "https://s3.example.com/presigned-get";
      mockFeedbackRepo.findAndCount.mockResolvedValueOnce([rows, 1]);
      mockScreenshotsService.getPresignedGetUrl.mockResolvedValueOnce(
        presignedUrl,
      );

      const result = await service.listFeedback(0, 10);

      expect(mockFeedbackRepo.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: "DESC" },
        skip: 0,
        take: 10,
      });
      expect(mockScreenshotsService.getPresignedGetUrl).toHaveBeenCalledWith(
        "feedback/abc.jpg",
      );
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: "fb-10",
        message: "Hello",
        screenshotS3Key: "feedback/abc.jpg",
        screenshotUrl: presignedUrl,
        appVersion: "2.0",
        userAgent: "Chrome",
      });
    });

    it("should return screenshotUrl=null when no screenshot", async () => {
      const rows = [
        {
          id: "fb-11",
          message: "No screenshot",
          userEmailEncrypted: null,
          screenshotS3Key: null,
          createdAt: new Date("2026-02-01"),
          appVersion: null,
          userAgent: null,
        } as Feedback,
      ];
      mockFeedbackRepo.findAndCount.mockResolvedValueOnce([rows, 1]);

      const result = await service.listFeedback(0, 10);

      expect(mockScreenshotsService.getPresignedGetUrl).not.toHaveBeenCalled();
      expect(result.items[0].screenshotUrl).toBeNull();
    });

    it("should clamp limit to 100 (MAX_FEEDBACK_PAGE_SIZE)", async () => {
      mockFeedbackRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.listFeedback(0, 9999);

      expect(mockFeedbackRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it("should calculate correct skip offset from page number", async () => {
      mockFeedbackRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      await service.listFeedback(3, 20);

      expect(mockFeedbackRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 60, take: 20 }),
      );
    });
  });

  describe("deleteFeedback", () => {
    it("should delete S3 screenshot then delete DB row (happy path)", async () => {
      const feedbackWithScreenshot = {
        id: "fb-20",
        screenshotS3Key: "feedback/screenshot.png",
      } as Feedback;

      mockFeedbackRepo.findOne.mockResolvedValueOnce(feedbackWithScreenshot);
      mockScreenshotsService.deleteScreenshot.mockResolvedValueOnce(undefined);
      mockFeedbackRepo.delete.mockResolvedValueOnce({ affected: 1 });

      await service.deleteFeedback("fb-20");

      expect(mockFeedbackRepo.findOne).toHaveBeenCalledWith({
        where: { id: "fb-20" },
      });
      expect(mockScreenshotsService.deleteScreenshot).toHaveBeenCalledWith(
        "feedback/screenshot.png",
      );
      expect(mockFeedbackRepo.delete).toHaveBeenCalledWith("fb-20");
    });

    it("should skip S3 delete and still delete DB row when screenshotS3Key is null", async () => {
      const feedbackNoScreenshot = {
        id: "fb-21",
        screenshotS3Key: null,
      } as Feedback;

      mockFeedbackRepo.findOne.mockResolvedValueOnce(feedbackNoScreenshot);
      mockFeedbackRepo.delete.mockResolvedValueOnce({ affected: 1 });

      await service.deleteFeedback("fb-21");

      expect(mockScreenshotsService.deleteScreenshot).not.toHaveBeenCalled();
      expect(mockFeedbackRepo.delete).toHaveBeenCalledWith("fb-21");
    });

    it("should throw NotFoundException when feedback does not exist", async () => {
      mockFeedbackRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.deleteFeedback("no-such-id")).rejects.toThrow(
        NotFoundException,
      );

      expect(mockScreenshotsService.deleteScreenshot).not.toHaveBeenCalled();
      expect(mockFeedbackRepo.delete).not.toHaveBeenCalled();
    });
  });
});
