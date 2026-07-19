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
    getVolumeTierList: jest.fn(),
    extendTrial: jest.fn(),
    getAllUsersWithSubscriptions: jest.fn(),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    adminGrantPlan: jest.fn(),
    adminRevokePlan: jest.fn(),
    adminResetUsage: jest.fn(),
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

  describe("getTiers", () => {
    it("should return the volume tier list", () => {
      const mockTiers = [
        { id: "bearlymail_starter", monthlyPriceUsd: 10, emailsPerCycle: 3000 },
        { id: "bearlymail_growth", monthlyPriceUsd: 20, emailsPerCycle: 10000 },
        {
          id: "bearlymail_enterprise",
          monthlyPriceUsd: 50,
          emailsPerCycle: 30000,
        },
      ];
      mockSubscriptionsService.getVolumeTierList.mockReturnValue(mockTiers);

      const result = controller.getTiers();

      expect(result).toEqual(mockTiers);
      expect(subscriptionsService.getVolumeTierList).toHaveBeenCalled();
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

  describe("adminGrantPlan", () => {
    it("should grant a complimentary plan to the target user's org", async () => {
      const mockRequest = { user: { userId: "admin-123" } };
      const body = { userId: "target-user-1", tier: "bearlymail_growth" };
      const mockResult = {
        success: true,
        org: { id: "org-1", planStatus: "active", tier: "bearlymail_growth" },
      };
      mockSubscriptionsService.adminGrantPlan.mockResolvedValue(mockResult);

      const result = await controller.adminGrantPlan(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(subscriptionsService.adminGrantPlan).toHaveBeenCalledWith(
        "admin-123",
        "target-user-1",
        "bearlymail_growth",
      );
    });
  });

  describe("adminRevokePlan", () => {
    it("should revoke the target user's complimentary plan", async () => {
      const mockRequest = { user: { userId: "admin-123" } };
      const body = { userId: "target-user-1" };
      const mockResult = {
        success: true,
        org: { id: "org-1", planStatus: "expired", tier: null },
      };
      mockSubscriptionsService.adminRevokePlan.mockResolvedValue(mockResult);

      const result = await controller.adminRevokePlan(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(subscriptionsService.adminRevokePlan).toHaveBeenCalledWith(
        "admin-123",
        "target-user-1",
      );
    });
  });

  describe("adminResetUsage", () => {
    it("should reset the target user's org usage counter", async () => {
      const mockRequest = { user: { userId: "admin-123" } };
      const body = { userId: "target-user-1" };
      const mockResult = {
        success: true,
        org: { id: "org-1", emailsUsedThisCycle: 0 },
      };
      mockSubscriptionsService.adminResetUsage.mockResolvedValue(mockResult);

      const result = await controller.adminResetUsage(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(subscriptionsService.adminResetUsage).toHaveBeenCalledWith(
        "admin-123",
        "target-user-1",
      );
    });
  });
});
