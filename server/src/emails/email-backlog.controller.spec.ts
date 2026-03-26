import { Test, TestingModule } from "@nestjs/testing";

import { EmailBacklogController } from "./email-backlog.controller";
import { EmailBacklogService } from "./email-backlog.service";

describe("EmailBacklogController", () => {
  let controller: EmailBacklogController;

  const mockEmailBacklogService = {
    getBacklogProgress: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailBacklogController],
      providers: [
        {
          provide: EmailBacklogService,
          useValue: mockEmailBacklogService,
        },
      ],
    }).compile();

    controller = module.get<EmailBacklogController>(EmailBacklogController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getBacklogProgress", () => {
    it("should return backlog progress for the user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockProgress = {
        total: 100,
        processed: 42,
        remaining: 58,
        percentage: 42,
      };

      mockEmailBacklogService.getBacklogProgress.mockResolvedValue(
        mockProgress,
      );

      const result = await controller.getBacklogProgress(mockRequest);

      expect(result).toEqual(mockProgress);
      expect(mockEmailBacklogService.getBacklogProgress).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should return empty progress when no backlog exists", async () => {
      const userId = "user-456";
      const mockRequest = { user: { userId } };
      const mockProgress = {
        total: 0,
        processed: 0,
        remaining: 0,
        percentage: 0,
      };

      mockEmailBacklogService.getBacklogProgress.mockResolvedValue(
        mockProgress,
      );

      const result = await controller.getBacklogProgress(mockRequest);

      expect(result).toEqual(mockProgress);
      expect(mockEmailBacklogService.getBacklogProgress).toHaveBeenCalledWith(
        userId,
      );
    });
  });
});
