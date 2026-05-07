import { Test, TestingModule } from "@nestjs/testing";

import { AuditService } from "../audit/audit.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { UsersService } from "../users/users.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

describe("SubscriptionsController", () => {
  let controller: SubscriptionsController;
  let subscriptionsService: SubscriptionsService;

  const mockSubscriptionsService = {
    startTrial: jest.fn(),
    checkSubscriptionStatus: jest.fn(),
    handleWebhook: jest.fn(),
    linkRevenueCatUser: jest.fn(),
    extendTrial: jest.fn(),
    getAllUsersWithSubscriptions: jest.fn(),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockOrganizationsService = {
    findActiveMembership: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    subscriptionsService =
      module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("startTrial", () => {
    it("should start trial for user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResult = {
        trialEndsAt: new Date(),
        isTrialActive: true,
      };

      mockSubscriptionsService.startTrial.mockResolvedValue(mockResult);

      const result = await controller.startTrial(mockRequest);

      expect(result).toEqual(mockResult);
      expect(subscriptionsService.startTrial).toHaveBeenCalledWith(userId);
    });
  });

  describe("getStatus", () => {
    it("should return subscription status", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockStatus = {
        isActive: true,
        trialEndsAt: new Date(),
        subscriptionType: "premium",
      };

      mockSubscriptionsService.checkSubscriptionStatus.mockResolvedValue(
        mockStatus,
      );

      const result = await controller.getStatus(mockRequest);

      expect(result).toEqual(mockStatus);
      expect(subscriptionsService.checkSubscriptionStatus).toHaveBeenCalledWith(
        userId,
      );
    });
  });

  describe("handleWebhook", () => {
    it("should handle webhook payload", async () => {
      const payload = {
        event: {
          type: "SUBSCRIPTION_RENEWED",
          app_user_id: "user-123",
        },
      };

      mockSubscriptionsService.handleWebhook.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(
        "Bearer test-secret",
        payload,
      );

      expect(result).toEqual({ received: true });
      expect(subscriptionsService.handleWebhook).toHaveBeenCalledWith(payload);
    });
  });

  describe("linkRevenueCat", () => {
    it("should link RevenueCat user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = { revenueCatUserId: "rc-user-123" };

      mockSubscriptionsService.linkRevenueCatUser.mockResolvedValue(undefined);

      const result = await controller.linkRevenueCat(mockRequest, body);

      expect(result).toEqual({ success: true });
      expect(subscriptionsService.linkRevenueCatUser).toHaveBeenCalledWith(
        userId,
        body.revenueCatUserId,
      );
    });
  });

  describe("extendTrial", () => {
    it("should extend trial for user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = { userId: "target-user-123", days: 7 };
      const mockResult = {
        trialEndsAt: new Date(),
        daysExtended: 7,
      };

      mockSubscriptionsService.extendTrial.mockResolvedValue(mockResult);

      const result = await controller.extendTrial(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(subscriptionsService.extendTrial).toHaveBeenCalledWith(
        body.userId,
        body.days,
      );
    });
  });

  describe("getAllUsers", () => {
    it("should return all users with subscriptions", async () => {
      const mockRequest = { user: { userId: "admin-123" } };
      const mockUsers = [
        {
          id: "user-1",
          email: "user1@example.com",
          subscriptionStatus: "active",
        },
        {
          id: "user-2",
          email: "user2@example.com",
          subscriptionStatus: "trial",
        },
      ];

      mockSubscriptionsService.getAllUsersWithSubscriptions.mockResolvedValue(
        mockUsers,
      );

      const result = await controller.getAllUsers(mockRequest);

      expect(result).toEqual(mockUsers);
      expect(
        subscriptionsService.getAllUsersWithSubscriptions,
      ).toHaveBeenCalled();
    });
  });
});
