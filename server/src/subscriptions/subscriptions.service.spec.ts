/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { mockPartial } from "../test/helpers/mock-utils";
import {
  EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT,
  SubscriptionsService,
  VOLUME_TIERS,
} from "./subscriptions.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("SubscriptionsService", () => {
  let service: SubscriptionsService;
  let userRepository: jest.Mocked<Repository<User>>;
  let orgRepository: jest.Mocked<Repository<Organization>>;
  let memberRepository: jest.Mocked<Repository<OrganizationMember>>;
  let configService: jest.Mocked<ConfigService>;

  // Alias for legacy tests that used `repository`
  let repository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: "user-1",
    email: "test@example.com",
    subscriptionStatus: null,
    subscriptionExpiresAt: null,
    trialStartedAt: null,
    revenueCatUserId: null,
    createdAt: new Date("2024-01-01"),
  } as User;

  const mockOrg: Organization = {
    id: "org-1",
    name: "Test Org",
    ownerId: "user-1",
    maxSeats: 5,
    revenueCatOrgSubscriptionId: "rc-org-sub-1",
    volumeTierProductId: null,
    emailsUsedThisCycle: 0,
    emailVolumeLimit: 3000,
    billingCycleStart: null,
  } as Organization;

  const mockMember: OrganizationMember = {
    id: "member-1",
    organizationId: "org-1",
    userId: "user-2",
    status: "active",
    role: "member",
  } as OrganizationMember;

  let mockConfigGet: jest.Mock;

  beforeEach(async () => {
    mockConfigGet = jest.fn().mockImplementation((key: string) => {
      if (key === "REVENUECAT_API_KEY") return "test-api-key";
      if (key === "REVENUECAT_WEBHOOK_SECRET") return "test-webhook-secret";
      return null;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            find: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: mockConfigGet,
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    userRepository = module.get(getRepositoryToken(User));
    orgRepository = module.get(getRepositoryToken(Organization));
    memberRepository = module.get(getRepositoryToken(OrganizationMember));
    configService = module.get(ConfigService);
    // alias
    repository = userRepository;

    jest.clearAllMocks();
    configService.get = mockConfigGet;
  });

  // ─── verifyWebhookSignature ───────────────────────────────────────────────────

  describe("verifyWebhookSignature", () => {
    it("should return true when authorization header matches secret", () => {
      const result = service.verifyWebhookSignature(
        "Bearer test-webhook-secret",
      );
      expect(result).toBe(true);
    });

    it("should return false when authorization header does not match", () => {
      const result = service.verifyWebhookSignature("Bearer wrong-secret");
      expect(result).toBe(false);
    });

    it("should return false when authorization header is undefined", () => {
      const result = service.verifyWebhookSignature(undefined);
      expect(result).toBe(false);
    });

    it("should return false when header is empty string", () => {
      const result = service.verifyWebhookSignature("");
      expect(result).toBe(false);
    });

    it("should return true (fail-open) when webhook secret is not configured", async () => {
      const noSecretGet = jest.fn().mockImplementation((key: string) => {
        if (key === "REVENUECAT_API_KEY") return "test-api-key";
        // REVENUECAT_WEBHOOK_SECRET not configured
        return null;
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SubscriptionsService,
          {
            provide: getRepositoryToken(User),
            useValue: {
              findOne: jest.fn(),
              update: jest.fn(),
              find: jest.fn(),
              increment: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(Organization),
            useValue: {
              findOne: jest.fn(),
              update: jest.fn(),
              find: jest.fn(),
              save: jest.fn(),
              increment: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(OrganizationMember),
            useValue: {
              findOne: jest.fn(),
              update: jest.fn(),
              find: jest.fn(),
            },
          },
          { provide: ConfigService, useValue: { get: noSecretGet } },
        ],
      }).compile();
      const noSecretService =
        module.get<SubscriptionsService>(SubscriptionsService);
      expect(noSecretService.verifyWebhookSignature("Bearer anything")).toBe(
        true,
      );
    });

    it("should use constant-time comparison (no early return on mismatched characters)", () => {
      // Both strings are the same length but differ in content
      const expected = "Bearer test-webhook-secret";
      const attacker = "Bearer test-webhook-XXXXXX";
      expect(attacker.length).toBe(expected.length);
      const result = service.verifyWebhookSignature(attacker);
      expect(result).toBe(false);
    });
  });

  // ─── activateTeamSeat ─────────────────────────────────────────────────────────

  describe("activateTeamSeat", () => {
    it("should activate team seat with computed expiry from billing cycle", async () => {
      // billing cycle started 5 days ago, 25 days remain — expiry is in the future
      const futureStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const orgWithBilling = {
        ...mockOrg,
        billingCycleStart: futureStart,
      };
      orgRepository.findOne.mockResolvedValue(orgWithBilling);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.activateTeamSeat("user-1", "org-1");

      expect(userRepository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          subscriptionStatus: "active",
          subscriptionExpiresAt: expect.any(Date),
        }),
      );
    });

    it("should activate team seat without expiry when billingCycleStart is null", async () => {
      const orgNoBilling = { ...mockOrg, billingCycleStart: null };
      orgRepository.findOne.mockResolvedValue(orgNoBilling);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.activateTeamSeat("user-1", "org-1");

      expect(userRepository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "active",
      });
    });

    it("should fall back to 30 days from now if computed expiry is in the past", async () => {
      // billingCycleStart that would produce a past expiry (over 30 days ago)
      const oldStart = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      const orgOldBilling = { ...mockOrg, billingCycleStart: oldStart };
      orgRepository.findOne.mockResolvedValue(orgOldBilling);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const before = new Date();
      await service.activateTeamSeat("user-1", "org-1");

      const updateCall = userRepository.update.mock.calls[0][1] as {
        subscriptionExpiresAt: Date;
      };
      expect(updateCall.subscriptionExpiresAt.getTime()).toBeGreaterThan(
        before.getTime(),
      );
    });

    it("should do nothing if org not found", async () => {
      orgRepository.findOne.mockResolvedValue(null);

      await service.activateTeamSeat("user-1", "nonexistent-org");

      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  // ─── deactivateTeamSeat ───────────────────────────────────────────────────────

  describe("deactivateTeamSeat", () => {
    it("should set subscriptionStatus to expired", async () => {
      const user = { ...mockUser, revenueCatUserId: null };
      userRepository.findOne.mockResolvedValue(user);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.deactivateTeamSeat("user-1");

      expect(userRepository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "expired",
      });
    });

    it("should NOT deactivate if user has own active RevenueCat subscription", async () => {
      const rcUser = {
        ...mockUser,
        revenueCatUserId: "rc-123",
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date("2030-01-01"),
      };
      // First call: load user; second call: checkSubscriptionStatus internals
      userRepository.findOne
        .mockResolvedValueOnce(rcUser)
        .mockResolvedValueOnce(rcUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          subscriber: {
            entitlements: {
              premium: {
                expires_date: "2030-01-01T00:00:00Z",
                will_renew: true,
              },
            },
          },
        },
      });

      await service.deactivateTeamSeat("user-1");

      // deactivateTeamSeat must NOT set subscriptionStatus to "expired".
      // (checkSubscriptionStatus may sync the RC-sourced active status back — that is expected.)
      expect(userRepository.update).not.toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ subscriptionStatus: "expired" }),
      );
    });

    it("should deactivate if RevenueCat check fails", async () => {
      const rcUser = { ...mockUser, revenueCatUserId: "rc-123" };
      userRepository.findOne.mockResolvedValue(rcUser);
      mockedAxios.get.mockRejectedValue(new Error("RC API down"));
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.deactivateTeamSeat("user-1");

      expect(userRepository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "expired",
      });
    });

    it("should do nothing if user not found", async () => {
      userRepository.findOne.mockResolvedValue(null);

      await service.deactivateTeamSeat("nonexistent");

      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  // ─── handleOrgSubscriptionEvent (via handleWebhook with org product) ─────────

  describe("handleOrgSubscriptionEvent (via handleWebhook)", () => {
    const orgProduct = "bearlymail_seat_5";
    const volumeProduct = "bearlymail_starter";

    const orgOwner = {
      ...mockUser,
      id: "owner-1",
      revenueCatUserId: "rc-org-user",
    };
    const orgWithOwner = {
      ...mockOrg,
      ownerId: "owner-1",
      billingCycleStart: null,
    };

    beforeEach(() => {
      mockedAxios.get.mockReset();
      mockedAxios.post.mockReset();
    });

    it("INITIAL_PURCHASE: sets maxSeats for a seat product", async () => {
      // handleWebhook finds user by RC id, then findOrgForRcUser does owner lookup
      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner);
      orgRepository.findOne.mockResolvedValueOnce(orgWithOwner);
      orgRepository.save.mockResolvedValue({
        ...orgWithOwner,
        maxSeats: 1,
      } as Organization);
      memberRepository.find.mockResolvedValue([]);

      await service.handleWebhook({
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "rc-org-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSeats: 1,
          revenueCatOrgSubscriptionId: "rc-org-user",
        }),
      );
    });

    it("INITIAL_PURCHASE: sets volumeTierProductId and emailVolumeLimit for volume product", async () => {
      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner);
      orgRepository.findOne.mockResolvedValueOnce(orgWithOwner);
      orgRepository.save.mockResolvedValue(orgWithOwner as Organization);
      memberRepository.find.mockResolvedValue([]);

      await service.handleWebhook({
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "rc-org-user",
          product_id: volumeProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          volumeTierProductId: volumeProduct,
          emailVolumeLimit: VOLUME_TIERS[volumeProduct].limit,
        }),
      );
    });

    it("RENEWAL: resets emailsUsedThisCycle and activates member seats", async () => {
      const activeMember = { ...mockMember, userId: "user-2" };

      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner);
      orgRepository.findOne
        .mockResolvedValueOnce(orgWithOwner)
        .mockResolvedValueOnce({
          ...orgWithOwner,
          billingCycleStart: new Date(),
        });
      orgRepository.save.mockResolvedValue(orgWithOwner as Organization);
      memberRepository.find.mockResolvedValue([activeMember]);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      // activateTeamSeat does a second orgRepository.findOne for the member's org
      orgRepository.findOne.mockResolvedValue({
        ...orgWithOwner,
        billingCycleStart: new Date(),
      });

      await service.handleWebhook({
        event: {
          type: "RENEWAL",
          app_user_id: "rc-org-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ emailsUsedThisCycle: 0 }),
      );
      expect(userRepository.update).toHaveBeenCalledWith(
        "user-2",
        expect.objectContaining({ subscriptionStatus: "active" }),
      );
    });

    it("CANCELLATION: zeroes maxSeats, clears volume tier, deactivates members", async () => {
      const orgWithVolume = {
        ...mockOrg,
        ownerId: "owner-1",
        volumeTierProductId: "bearlymail_starter",
        emailVolumeLimit: 3000,
        maxSeats: 5,
      };
      const activeMember = { ...mockMember, userId: "user-2" };
      const deactivatedMemberUser = {
        ...mockUser,
        id: "user-2",
        revenueCatUserId: null,
      };

      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(deactivatedMemberUser);
      orgRepository.findOne.mockResolvedValueOnce(orgWithVolume);
      orgRepository.save.mockResolvedValue(orgWithVolume as Organization);
      memberRepository.find.mockResolvedValue([activeMember]);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.handleWebhook({
        event: {
          type: "CANCELLATION",
          app_user_id: "rc-org-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSeats: 0,
          volumeTierProductId: null,
          emailVolumeLimit: 0,
        }),
      );
      expect(userRepository.update).toHaveBeenCalledWith("user-2", {
        subscriptionStatus: "expired",
      });
    });

    it("EXPIRATION: zeroes maxSeats and clears volume tier", async () => {
      const orgWithVolume = {
        ...mockOrg,
        ownerId: "owner-1",
        volumeTierProductId: "bearlymail_growth",
        emailVolumeLimit: 10000,
        maxSeats: 3,
      };

      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner);
      orgRepository.findOne.mockResolvedValueOnce(orgWithVolume);
      orgRepository.save.mockResolvedValue(orgWithVolume as Organization);
      memberRepository.find.mockResolvedValue([]);

      await service.handleWebhook({
        event: {
          type: "EXPIRATION",
          app_user_id: "rc-org-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          maxSeats: 0,
          volumeTierProductId: null,
          emailVolumeLimit: 0,
        }),
      );
    });

    it("logs a warning and returns early when no org is found", async () => {
      userRepository.findOne.mockResolvedValue(null);
      orgRepository.findOne.mockResolvedValue(null);

      await service.handleWebhook({
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "unknown-rc-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).not.toHaveBeenCalled();
    });

    it("falls back to revenueCatOrgSubscriptionId lookup when no owner user is found", async () => {
      // handleWebhook user lookup returns owner; findOrgForRcUser finds no owner by RC id
      // so it falls back to the revenueCatOrgSubscriptionId column
      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(null);
      orgRepository.findOne.mockResolvedValueOnce(orgWithOwner);
      orgRepository.save.mockResolvedValue(orgWithOwner as Organization);
      memberRepository.find.mockResolvedValue([]);

      await service.handleWebhook({
        event: {
          type: "RENEWAL",
          app_user_id: "rc-org-user",
          product_id: orgProduct,
        },
      });

      expect(orgRepository.save).toHaveBeenCalled();
    });
  });

  // ─── trackEmailProcessed ──────────────────────────────────────────────────────

  describe("trackEmailProcessed", () => {
    it("should increment and return allowed=true when under limit", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 100,
        emailVolumeLimit: 3000,
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(orgRepository.increment).toHaveBeenCalledWith(
        { id: "org-1" },
        "emailsUsedThisCycle",
        1,
      );
      expect(result.allowed).toBe(true);
      // 100/3000 = 3%
      expect(result.percentUsed).toBe(3);
    });

    it("should return allowed=false when at or over limit", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 3001,
        emailVolumeLimit: 3000,
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(result.allowed).toBe(false);
    });

    it("should emit warning when percent used >= threshold", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      const used = Math.ceil(
        (EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT / 100) * 3000,
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: used,
        emailVolumeLimit: 3000,
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(result.percentUsed).toBeGreaterThanOrEqual(
        EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT,
      );
    });

    it("should return percentUsed=0 when emailVolumeLimit is 0", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 100,
        emailVolumeLimit: 0,
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(result.percentUsed).toBe(0);
    });

    it("should return allowed=true and percentUsed=0 when org is not found", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue(null);

      const result = await service.trackEmailProcessed("missing-org");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
    });
  });

  // ─── grantComplimentaryAccess ─────────────────────────────────────────────────

  describe("grantComplimentaryAccess", () => {
    it("should update subscription status and expiry", async () => {
      userRepository.findOne.mockResolvedValue({
        ...mockUser,
        revenueCatUserId: null,
      });
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.grantComplimentaryAccess("user-1", 30);

      expect(result).toEqual({ success: true });
      const updateCall = userRepository.update.mock.calls[0][1] as {
        subscriptionStatus: string;
        subscriptionExpiresAt: Date;
      };
      expect(updateCall.subscriptionStatus).toBe("active");
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      expect(
        Math.abs(
          updateCall.subscriptionExpiresAt.getTime() - expectedExpiry.getTime(),
        ),
      ).toBeLessThan(5000);
    });

    it("should succeed and NOT call RevenueCat (stubbed pending TODO#1836) when user has RC id", async () => {
      // RevenueCat promotional entitlement call is stubbed until product IDs are configured
      const rcUser = { ...mockUser, revenueCatUserId: "rc-123" };
      userRepository.findOne.mockResolvedValue(rcUser);
      userRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.grantComplimentaryAccess("user-1", 14);

      expect(result).toEqual({ success: true });
      // Local DB update still happens
      expect(userRepository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ subscriptionStatus: "active" }),
      );
      // RevenueCat call is not made (stubbed)
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should throw if user not found", async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.grantComplimentaryAccess("nonexistent", 7),
      ).rejects.toThrow("User not found");
    });
  });

  // ─── applyPromoCode ───────────────────────────────────────────────────────────

  describe("applyPromoCode", () => {
    it("should return not-implemented when API key is configured (stub per TODO#1836)", async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser });

      const result = await service.applyPromoCode("user-1", "PROMO50");

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not yet available/i);
    });

    it("should return failure when API key is not configured", async () => {
      const noKeyGet = jest.fn().mockReturnValue(null);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SubscriptionsService,
          {
            provide: getRepositoryToken(User),
            useValue: {
              findOne: jest.fn().mockResolvedValue({ ...mockUser }),
              update: jest.fn(),
              find: jest.fn(),
              increment: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(Organization),
            useValue: {
              findOne: jest.fn(),
              update: jest.fn(),
              find: jest.fn(),
              save: jest.fn(),
              increment: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(OrganizationMember),
            useValue: {
              findOne: jest.fn(),
              update: jest.fn(),
              find: jest.fn(),
            },
          },
          { provide: ConfigService, useValue: { get: noKeyGet } },
        ],
      }).compile();
      const noKeyService =
        module.get<SubscriptionsService>(SubscriptionsService);

      const result = await noKeyService.applyPromoCode("user-1", "CODE");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not configured/i);
    });

    it("should throw if user not found", async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.applyPromoCode("nonexistent", "CODE"),
      ).rejects.toThrow("User not found");
    });
  });

  // ─── linkOrgRevenueCat ────────────────────────────────────────────────────────

  describe("linkOrgRevenueCat", () => {
    it("should update org revenueCatOrgSubscriptionId", async () => {
      orgRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.linkOrgRevenueCat("org-1", "rc-sub-abc");

      expect(orgRepository.update).toHaveBeenCalledWith("org-1", {
        revenueCatOrgSubscriptionId: "rc-sub-abc",
      });
    });
  });

  // ─── Legacy tests (pre-existing) ─────────────────────────────────────────────

  describe("startTrial", () => {
    it("should start a 7-day trial for user without subscription", async () => {
      const userWithoutSubscription = { ...mockUser, subscriptionStatus: null };
      repository.findOne.mockResolvedValue(userWithoutSubscription);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.startTrial("user-1");

      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          subscriptionStatus: "trial",
          trialStartedAt: expect.any(Date),
          subscriptionExpiresAt: expect.any(Date),
        }),
      );

      const updateCall = repository.update.mock.calls[0][1];
      const expiresAt = updateCall.subscriptionExpiresAt as Date;
      const trialStart = updateCall.trialStartedAt as Date;
      const daysDiff =
        (expiresAt.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(7, 0);
    });

    it("should not start trial if user already has active subscription", async () => {
      const activeUser = { ...mockUser, subscriptionStatus: "active" };
      repository.findOne.mockResolvedValue(activeUser);

      const result = await service.startTrial("user-1");

      expect(result.success).toBe(false);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("should not start trial if user already has trial", async () => {
      const trialUser = { ...mockUser, subscriptionStatus: "trial" };
      repository.findOne.mockResolvedValue(trialUser);

      const result = await service.startTrial("user-1");

      expect(result.success).toBe(false);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("should throw error if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.startTrial("nonexistent")).rejects.toThrow(
        "User not found",
      );
    });
  });

  describe("checkSubscriptionStatus", () => {
    it("should return active status for user with active subscription", async () => {
      const activeUser = {
        ...mockUser,
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date("2027-01-01"),
      };
      repository.findOne.mockResolvedValue(activeUser);

      const result = await service.checkSubscriptionStatus("user-1");

      expect(result.status).toBe("active");
      expect(result.isActive).toBe(true);
    });

    it("should return expired status when subscription has expired", async () => {
      const expiredUser = {
        ...mockUser,
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date("2020-01-01"),
      };
      repository.findOne
        .mockResolvedValueOnce(expiredUser)
        .mockResolvedValueOnce({
          ...expiredUser,
          subscriptionStatus: "expired",
        });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.checkSubscriptionStatus("user-1");

      expect(result.status).toBe("expired");
      expect(result.isActive).toBe(false);
      expect(repository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "expired",
      });
    });

    it("should check RevenueCat when user has RevenueCat ID and API key", async () => {
      configService.get.mockReturnValue("test-api-key");
      const revenueCatUser = {
        ...mockUser,
        revenueCatUserId: "rc-user-123",
        subscriptionStatus: "active",
      };
      repository.findOne.mockResolvedValue(revenueCatUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          subscriber: {
            entitlements: {
              premium: {
                expires_date: "2025-01-01T00:00:00Z",
                will_renew: true,
              },
            },
          },
        },
      });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.checkSubscriptionStatus("user-1");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.revenuecat.com/v1/subscribers/rc-user-123",
        {
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        },
      );
      expect(result.isActive).toBe(true);
    });

    it("should fall back to database status when RevenueCat check fails", async () => {
      configService.get.mockReturnValue("test-api-key");
      const revenueCatUser = {
        ...mockUser,
        revenueCatUserId: "rc-user-123",
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date("2027-01-01"),
      };
      repository.findOne.mockResolvedValue(revenueCatUser);
      (mockedAxios as unknown as jest.Mock).mockRejectedValue(
        new Error("API Error"),
      );

      const result = await service.checkSubscriptionStatus("user-1");

      expect(result.status).toBe("active");
      expect(result.isActive).toBe(true);
    });

    it("should throw error if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.checkSubscriptionStatus("nonexistent"),
      ).rejects.toThrow("User not found");
    });
  });

  describe("hasActiveSubscription", () => {
    it("should return true for active subscription", async () => {
      const activeUser = {
        ...mockUser,
        subscriptionStatus: "active",
        subscriptionExpiresAt: new Date("2027-01-01"),
      };
      repository.findOne.mockResolvedValue(activeUser);

      const result = await service.hasActiveSubscription("user-1");

      expect(result).toBe(true);
    });

    it("should return false for expired subscription", async () => {
      const expiredUser = {
        ...mockUser,
        subscriptionStatus: "expired",
      };
      repository.findOne.mockResolvedValue(expiredUser);

      const result = await service.hasActiveSubscription("user-1");

      expect(result).toBe(false);
    });
  });

  describe("handleWebhook", () => {
    beforeEach(() => {
      configService.get.mockReturnValue("test-api-key");
      mockedAxios.get.mockReset();
      mockedAxios.post.mockReset();
    });

    it("should handle INITIAL_PURCHASE event", async () => {
      const user = { ...mockUser, revenueCatUserId: "rc-user-123" };
      repository.findOne.mockResolvedValue(user);
      mockedAxios.get.mockResolvedValue({
        data: {
          subscriber: {
            entitlements: {
              premium: {
                expires_date: "2027-01-01T00:00:00Z",
                will_renew: true,
              },
            },
          },
        },
      });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const payload = {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "rc-user-123",
          product_id: "premium",
        },
      };

      await service.handleWebhook(payload);

      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          subscriptionStatus: "active",
          subscriptionExpiresAt: expect.any(Date),
        }),
      );
    });

    it("should handle CANCELLATION event", async () => {
      const user = { ...mockUser, revenueCatUserId: "rc-user-123" };
      repository.findOne.mockResolvedValue(user);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const payload = {
        event: {
          type: "CANCELLATION",
          app_user_id: "rc-user-123",
        },
      };

      await service.handleWebhook(payload);

      expect(repository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "cancelled",
      });
    });

    it("should handle EXPIRATION event", async () => {
      const user = { ...mockUser, revenueCatUserId: "rc-user-123" };
      repository.findOne.mockResolvedValue(user);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const payload = {
        event: {
          type: "EXPIRATION",
          app_user_id: "rc-user-123",
        },
      };

      await service.handleWebhook(payload);

      expect(repository.update).toHaveBeenCalledWith("user-1", {
        subscriptionStatus: "expired",
      });
    });

    it.skip("should ignore webhook if API key not configured", async () => {
      configService.get.mockReturnValue(null);
      const payload = {
        event: { type: "INITIAL_PURCHASE", app_user_id: "123" },
      };

      await service.handleWebhook(payload);

      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it("should ignore webhook if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      const payload = {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "nonexistent",
        },
      };

      await service.handleWebhook(payload);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("linkRevenueCatUser", () => {
    it("should link RevenueCat user ID to user", async () => {
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.linkRevenueCatUser("user-1", "rc-user-123");

      expect(repository.update).toHaveBeenCalledWith("user-1", {
        revenueCatUserId: "rc-user-123",
      });
    });
  });

  describe("extendTrial", () => {
    it("should extend trial by specified days", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const trialUser = {
        ...mockUser,
        subscriptionStatus: "trial",
        subscriptionExpiresAt: futureDate,
      };
      repository.findOne.mockResolvedValue(trialUser);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.extendTrial("user-1", 7);

      expect(result.success).toBe(true);
      expect(result.newExpiresAt).toBeDefined();
      expect(repository.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          subscriptionExpiresAt: expect.any(Date),
        }),
      );

      const updateCall = repository.update.mock.calls[0][1];
      const newExpiresAt = updateCall.subscriptionExpiresAt as Date;
      const daysDiff =
        (newExpiresAt.getTime() - trialUser.subscriptionExpiresAt!.getTime()) /
        (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(7);
    });

    it("should extend from now if expiration is in the past", async () => {
      const expiredUser = {
        ...mockUser,
        subscriptionStatus: "expired",
        subscriptionExpiresAt: new Date("2020-01-01"),
      };
      repository.findOne.mockResolvedValue(expiredUser);
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.extendTrial("user-1", 7);

      expect(result.success).toBe(true);
      const updateCall = repository.update.mock.calls[0][1];
      expect(updateCall.subscriptionStatus).toBe("trial");
    });

    it("should throw error if user not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.extendTrial("nonexistent", 7)).rejects.toThrow(
        "User not found",
      );
    });
  });

  describe("getAllUsersWithSubscriptions", () => {
    it("should return all users with subscription info", async () => {
      const users = [
        {
          ...mockUser,
          subscriptionStatus: "active",
          subscriptionExpiresAt: new Date("2025-01-01"),
        },
        {
          ...mockUser,
          id: "user-2",
          subscriptionStatus: "trial",
          subscriptionExpiresAt: new Date("2024-02-01"),
          trialStartedAt: new Date("2024-01-25"),
        },
      ];
      repository.find.mockResolvedValue(users as User[]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "user-1",
        subscriptionStatus: "active",
      });
      expect(result[1]).toMatchObject({
        id: "user-2",
        subscriptionStatus: "trial",
      });
      expect(repository.find).toHaveBeenCalledWith({
        select: [
          "id",
          "email",
          "name",
          "subscriptionStatus",
          "subscriptionExpiresAt",
          "trialStartedAt",
          "createdAt",
        ],
        order: { createdAt: "DESC" },
      });
    });

    it("should return empty array when no users", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result).toEqual([]);
    });
  });
});
