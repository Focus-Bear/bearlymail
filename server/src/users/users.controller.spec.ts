import { Test, TestingModule } from "@nestjs/testing";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { DataExportService } from "./data-export.service";

describe("UsersController", () => {
  let controller: UsersController;
  let usersService: UsersService;

  const mockUsersService = {
    getConsentStatus: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    acceptConsent: jest.fn(),
  };

  const mockDataExportService = {
    exportUserData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: DataExportService,
          useValue: mockDataExportService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getConsentStatus", () => {
    it("should return consent status", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockStatus = {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      };

      mockUsersService.getConsentStatus.mockResolvedValue(mockStatus);

      const result = await controller.getConsentStatus(mockRequest);

      expect(result).toEqual(mockStatus);
      expect(usersService.getConsentStatus).toHaveBeenCalledWith(userId);
    });
  });

  describe("getProfile", () => {
    it("should return user profile without password", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUser = {
        id: userId,
        email: "test@example.com",
        name: "Test User",
        password: "hashed-password",
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await controller.getProfile(mockRequest);

      expect(result).not.toHaveProperty("password");
      expect(result.id).toBe(userId);
      expect(result.email).toBe("test@example.com");
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });
  });

  describe("updateProfile", () => {
    it("should update user profile", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const updates = { name: "Updated Name" };
      const mockUpdatedUser = {
        id: userId,
        name: "Updated Name",
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.updateProfile(mockRequest, updates);

      expect(result).toEqual(mockUpdatedUser);
      expect(usersService.update).toHaveBeenCalledWith(userId, updates);
    });
  });

  describe("acceptConsent", () => {
    it("should accept consent", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        termsAccepted: true,
        privacyAccepted: true,
      };
      const mockResult = {
        termsAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
      };

      mockUsersService.acceptConsent.mockResolvedValue(mockResult);

      const result = await controller.acceptConsent(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(usersService.acceptConsent).toHaveBeenCalledWith(
        userId,
        body.termsAccepted,
        body.privacyAccepted,
      );
    });
  });

  describe("markTourComplete", () => {
    it("should mark tour as complete", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockUpdatedUser = {
        id: userId,
        hasSeenTour: true,
      };

      mockUsersService.update.mockResolvedValue(mockUpdatedUser);

      const result = await controller.markTourComplete(mockRequest);

      expect(result).toEqual(mockUpdatedUser);
      expect(usersService.update).toHaveBeenCalledWith(userId, {
        hasSeenTour: true,
      });
    });
  });
});
