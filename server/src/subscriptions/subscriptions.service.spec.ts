import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { OrganizationsService } from "../organizations/organizations.service";
import { mockPartial } from "../test/helpers/mock-utils";
import {
  EMAIL_VOLUME_WARNING_THRESHOLD_PERCENT,
  SubscriptionsService,
  VOLUME_TIERS,
} from "./subscriptions.service";
import { FREE_TIER_EMAIL_LIMIT } from "./volume-tiers.constants";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("SubscriptionsService", () => {
  let service: SubscriptionsService;
  let userRepository: jest.Mocked<Repository<User>>;
  let orgRepository: jest.Mocked<Repository<Organization>>;
  let memberRepository: jest.Mocked<Repository<OrganizationMember>>;
  let configService: jest.Mocked<ConfigService>;
  let organizationsService: { ensurePersonalOrg: jest.Mock };

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
      if (key === "REVENUECAT_PROJECT_ID") return "test-project-id";
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
            findAndCount: jest.fn(),
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
        {
          provide: OrganizationsService,
          useValue: {
            ensurePersonalOrg: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    userRepository = module.get(getRepositoryToken(User));
    orgRepository = module.get(getRepositoryToken(Organization));
    memberRepository = module.get(getRepositoryToken(OrganizationMember));
    configService = module.get(ConfigService);
    organizationsService = module.get(OrganizationsService);
    // alias
    repository = userRepository;

    jest.clearAllMocks();
    configService.get = mockConfigGet;
    // trackEmailProcessed always attempts a stale-cycle rollover UPDATE first;
    // default to "no rows matched" so existing tests exercise the normal path.
    orgRepository.update.mockResolvedValue(mockPartial({ affected: 0 }));
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
        if (key === "NODE_ENV") return "development";
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
          {
            provide: OrganizationsService,
            useValue: { ensurePersonalOrg: jest.fn() },
          },
        ],
      }).compile();
      const noSecretService =
        module.get<SubscriptionsService>(SubscriptionsService);
      expect(noSecretService.verifyWebhookSignature("Bearer anything")).toBe(
        true,
      );
    });

    it("should FAIL CLOSED in production when webhook secret is not configured", async () => {
      const prodNoSecretGet = jest.fn().mockImplementation((key: string) => {
        if (key === "REVENUECAT_API_KEY") return "test-api-key";
        if (key === "NODE_ENV") return "production";
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
          { provide: ConfigService, useValue: { get: prodNoSecretGet } },
          {
            provide: OrganizationsService,
            useValue: { ensurePersonalOrg: jest.fn() },
          },
        ],
      }).compile();
      const prodService =
        module.get<SubscriptionsService>(SubscriptionsService);
      // Without a configured secret, production must reject every webhook —
      // this endpoint grants paid entitlements.
      expect(prodService.verifyWebhookSignature("Bearer anything")).toBe(false);
      expect(prodService.verifyWebhookSignature(undefined)).toBe(false);
    });

    it("should FAIL CLOSED when NODE_ENV is unset or unknown (staging/preview)", async () => {
      const unsetEnvGet = jest.fn().mockImplementation((key: string) => {
        if (key === "REVENUECAT_API_KEY") return "test-api-key";
        // NODE_ENV unset; REVENUECAT_WEBHOOK_SECRET not configured
        return null;
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SubscriptionsService,
          {
            provide: getRepositoryToken(User),
            useValue: { findOne: jest.fn(), update: jest.fn() },
          },
          {
            provide: getRepositoryToken(Organization),
            useValue: { findOne: jest.fn(), update: jest.fn() },
          },
          {
            provide: getRepositoryToken(OrganizationMember),
            useValue: { findOne: jest.fn(), update: jest.fn() },
          },
          { provide: ConfigService, useValue: { get: unsetEnvGet } },
          {
            provide: OrganizationsService,
            useValue: { ensurePersonalOrg: jest.fn() },
          },
        ],
      }).compile();
      const stagingService =
        module.get<SubscriptionsService>(SubscriptionsService);
      // Fail-open is opt-in via explicit development/test only.
      expect(stagingService.verifyWebhookSignature("Bearer anything")).toBe(
        false,
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
          items: [
            { entitlement_id: "bearlymail_starter", expires_at: 1893456000000 },
          ],
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
    // Volume tiers are keyed by entitlement id; the store product_id is a Stripe SKU.
    const volumeEntitlement = "bearlymail_starter";

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

    it("INITIAL_PURCHASE: resolves the tier from the entitlement, ignoring the Stripe product_id", async () => {
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
          // Store SKU that is NOT a known tier — the entitlement decides the tier.
          product_id: "prod_Udh5PuHXFM1L21",
          entitlement_ids: [volumeEntitlement],
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          volumeTierProductId: volumeEntitlement,
          emailVolumeLimit: VOLUME_TIERS[volumeEntitlement].limit,
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

    it("INITIAL_PURCHASE: marks the org plan active and clears the trial end date", async () => {
      const trialOrg = {
        ...orgWithOwner,
        planStatus: "trial",
        trialEndsAt: new Date("2030-01-01"),
      } as Organization;
      userRepository.findOne
        .mockResolvedValueOnce(orgOwner)
        .mockResolvedValueOnce(orgOwner);
      orgRepository.findOne.mockResolvedValueOnce(trialOrg);
      orgRepository.save.mockResolvedValue(trialOrg);
      memberRepository.find.mockResolvedValue([]);

      await service.handleWebhook({
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "rc-org-user",
          product_id: "prod_Udh5PuHXFM1L21",
          entitlement_ids: [volumeEntitlement],
        },
      });

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "active",
          trialEndsAt: null,
        }),
      );
    });

    it("CANCELLATION: degrades to the free tier (1 seat, free limit, expired plan), deactivates members", async () => {
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
          maxSeats: 1,
          volumeTierProductId: null,
          emailVolumeLimit: FREE_TIER_EMAIL_LIMIT,
          planStatus: "expired",
        }),
      );
      expect(userRepository.update).toHaveBeenCalledWith("user-2", {
        subscriptionStatus: "expired",
      });
    });

    it("EXPIRATION: degrades to the free tier and clears volume tier", async () => {
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
          maxSeats: 1,
          volumeTierProductId: null,
          emailVolumeLimit: FREE_TIER_EMAIL_LIMIT,
          planStatus: "expired",
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
    it("rolls over a stale/never-started billing cycle before incrementing", async () => {
      orgRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 1,
        emailVolumeLimit: 3000,
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(orgRepository.update).toHaveBeenCalledWith(
        [
          { id: "org-1", billingCycleStart: expect.anything() },
          { id: "org-1", billingCycleStart: expect.anything() },
        ],
        { emailsUsedThisCycle: 0, billingCycleStart: expect.any(Date) },
      );
      const [criteria] = orgRepository.update.mock.calls[0] as [
        Array<{ billingCycleStart: { type: string } }>,
        unknown,
      ];
      expect(criteria[0].billingCycleStart.type).toBe("lessThan");
      expect(criteria[1].billingCycleStart.type).toBe("isNull");
      // The rollover must run before the increment so the tracked email counts
      // toward the fresh cycle rather than being wiped by the reset.
      expect(orgRepository.update.mock.invocationCallOrder[0]).toBeLessThan(
        orgRepository.increment.mock.invocationCallOrder[0],
      );
      expect(result.allowed).toBe(true);
    });

    it("leaves a fresh billing cycle alone (rollover UPDATE matches no rows)", async () => {
      orgRepository.update.mockResolvedValue(mockPartial({ affected: 0 }));
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 100,
        emailVolumeLimit: 3000,
        billingCycleStart: new Date(),
      });

      const result = await service.trackEmailProcessed("org-1");

      expect(result.allowed).toBe(true);
      expect(result.percentUsed).toBe(3);
    });

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

    it("should lazily expire an elapsed trial and enforce the free-tier limit", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
        emailsUsedThisCycle: 150,
        emailVolumeLimit: 3000,
      } as Organization);
      orgRepository.save.mockResolvedValue({} as Organization);

      const result = await service.trackEmailProcessed("org-1");

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "expired",
          emailVolumeLimit: FREE_TIER_EMAIL_LIMIT,
        }),
      );
      // 150 used > 100 free-tier limit once the trial expires
      expect(result.allowed).toBe(false);
    });

    it("should not expire a trial that has not ended yet", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailsUsedThisCycle: 150,
        emailVolumeLimit: 3000,
      } as Organization);

      const result = await service.trackEmailProcessed("org-1");

      expect(orgRepository.save).not.toHaveBeenCalled();
      expect(result.allowed).toBe(true);
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

    it("fails open without touching the DB when orgId is falsy", async () => {
      const result = await service.trackEmailProcessed("");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
      expect(orgRepository.update).not.toHaveBeenCalled();
      expect(orgRepository.increment).not.toHaveBeenCalled();
    });

    it("should return allowed=true and percentUsed=0 when org is not found", async () => {
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue(null);

      const result = await service.trackEmailProcessed("missing-org");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
    });
  });

  // ─── trackEmailForUser ────────────────────────────────────────────────────────

  describe("trackEmailForUser", () => {
    it("returns null when the user has no active org membership", async () => {
      memberRepository.findOne.mockResolvedValue(null);

      const result = await service.trackEmailForUser("user-1");

      expect(result).toBeNull();
      expect(orgRepository.increment).not.toHaveBeenCalled();
    });

    it("resolves the org and tracks the email against it", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.increment.mockResolvedValue(mockPartial({}));
      orgRepository.findOne.mockResolvedValue(
        mockPartial({
          id: "org-1",
          emailsUsedThisCycle: 10,
          emailVolumeLimit: 3000,
        }),
      );

      const result = await service.trackEmailForUser("user-1");

      expect(memberRepository.findOne).toHaveBeenCalledWith({
        where: { userId: "user-1", status: "active" },
      });
      expect(orgRepository.increment).toHaveBeenCalledWith(
        { id: "org-1" },
        "emailsUsedThisCycle",
        1,
      );
      expect(result).toEqual({ allowed: true, percentUsed: 0 });
    });
  });

  // ─── checkAiCapacity ──────────────────────────────────────────────────────────

  describe("checkAiCapacity", () => {
    it("fails open (allowed) when the user has no active org membership", async () => {
      memberRepository.findOne.mockResolvedValue(null);

      const result = await service.checkAiCapacity("user-1");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
      expect(orgRepository.findOne).not.toHaveBeenCalled();
      expect(orgRepository.increment).not.toHaveBeenCalled();
    });

    it("fails open (allowed) when the org record is missing", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue(null);

      const result = await service.checkAiCapacity("user-1");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
    });

    it("allows when usage is under the limit and does not increment", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 300,
        emailVolumeLimit: 3000,
      });

      const result = await service.checkAiCapacity("user-1");

      expect(result.allowed).toBe(true);
      // 300/3000 = 10%
      expect(result.percentUsed).toBe(10);
      // Non-incrementing: checking capacity must never record usage.
      expect(orgRepository.increment).not.toHaveBeenCalled();
    });

    it("blocks when usage is over the limit", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 3001,
        emailVolumeLimit: 3000,
      });

      const result = await service.checkAiCapacity("user-1");

      expect(result.allowed).toBe(false);
      expect(orgRepository.increment).not.toHaveBeenCalled();
    });

    it("lazily expires an elapsed trial and blocks when over the free-tier limit", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
        emailsUsedThisCycle: 150,
        emailVolumeLimit: 3000,
      } as Organization);
      orgRepository.save.mockResolvedValue({} as Organization);

      const result = await service.checkAiCapacity("user-1");

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "expired",
          emailVolumeLimit: FREE_TIER_EMAIL_LIMIT,
        }),
      );
      // 150 used > 100 free-tier limit once the trial expires
      expect(result.allowed).toBe(false);
    });

    it("still blocks with the in-memory downgrade when the expiry persist fails", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
        emailsUsedThisCycle: 150,
        emailVolumeLimit: 3000,
      } as Organization);
      orgRepository.save.mockRejectedValue(new Error("db down"));

      const result = await service.checkAiCapacity("user-1");

      expect(result.allowed).toBe(false);
    });
  });

  // ─── self-hosted mode ─────────────────────────────────────────────────────────

  describe("self-hosted mode (SELF_HOSTED=true)", () => {
    let selfHostedService: SubscriptionsService;

    beforeEach(async () => {
      const selfHostedConfigGet = jest
        .fn()
        .mockImplementation((key: string) =>
          key === "SELF_HOSTED" ? "true" : null,
        );
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SubscriptionsService,
          { provide: getRepositoryToken(User), useValue: userRepository },
          {
            provide: getRepositoryToken(Organization),
            useValue: orgRepository,
          },
          {
            provide: getRepositoryToken(OrganizationMember),
            useValue: memberRepository,
          },
          { provide: ConfigService, useValue: { get: selfHostedConfigGet } },
          {
            provide: OrganizationsService,
            useValue: { ensurePersonalOrg: jest.fn() },
          },
        ],
      }).compile();
      selfHostedService =
        module.get<SubscriptionsService>(SubscriptionsService);
    });

    it("checkAiCapacity allows even when the org is over its limit", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({
        ...mockOrg,
        emailsUsedThisCycle: 5000,
        emailVolumeLimit: 3000,
      });

      const result = await selfHostedService.checkAiCapacity("user-1");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
      // Short-circuits before any org lookup or trial-expiry write.
      expect(memberRepository.findOne).not.toHaveBeenCalled();
      expect(orgRepository.save).not.toHaveBeenCalled();
    });

    it("trackEmailProcessed skips metering and trial expiry entirely", async () => {
      const result = await selfHostedService.trackEmailProcessed("org-1");

      expect(result).toEqual({ allowed: true, percentUsed: 0 });
      expect(orgRepository.increment).not.toHaveBeenCalled();
      expect(orgRepository.findOne).not.toHaveBeenCalled();
      expect(orgRepository.save).not.toHaveBeenCalled();
    });

    it("trackEmailForUser returns null (no gate) without touching the org", async () => {
      const result = await selfHostedService.trackEmailForUser("user-1");

      expect(result).toBeNull();
      expect(memberRepository.findOne).not.toHaveBeenCalled();
      expect(orgRepository.increment).not.toHaveBeenCalled();
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
          {
            provide: OrganizationsService,
            useValue: { ensurePersonalOrg: jest.fn() },
          },
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

    it("should check RevenueCat (v2 active entitlements) when user is linked", async () => {
      const revenueCatUser = {
        ...mockUser,
        revenueCatUserId: "rc-user-123",
        subscriptionStatus: "active",
      };
      repository.findOne.mockResolvedValue(revenueCatUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          items: [
            { entitlement_id: "bearlymail_starter", expires_at: 1893456000000 },
          ],
        },
      });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const result = await service.checkSubscriptionStatus("user-1");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.revenuecat.com/v2/projects/test-project-id/customers/rc-user-123/active_entitlements",
        {
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        },
      );
      expect(result.isActive).toBe(true);
      expect(result.status).toBe("active");
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
          items: [
            { entitlement_id: "bearlymail_starter", expires_at: 1893456000000 },
          ],
        },
      });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      const payload = {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "rc-user-123",
          product_id: "prod_individual_sku",
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

  describe("getVolumeTierList", () => {
    it("should return every volume tier with id, price and email allowance", () => {
      const tiers = service.getVolumeTierList();

      expect(tiers).toEqual([
        { id: "bearlymail_starter", monthlyPriceUsd: 10, emailsPerCycle: 3000 },
        { id: "bearlymail_growth", monthlyPriceUsd: 20, emailsPerCycle: 10000 },
        {
          id: "bearlymail_enterprise",
          monthlyPriceUsd: 50,
          emailsPerCycle: 30000,
        },
      ]);
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
      repository.findAndCount.mockResolvedValue([users as User[], 2]);
      memberRepository.find.mockResolvedValue([]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result.users).toHaveLength(2);
      expect(result.users[0]).toMatchObject({
        id: "user-1",
        subscriptionStatus: "active",
      });
      expect(result.users[1]).toMatchObject({
        id: "user-2",
        subscriptionStatus: "trial",
      });
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(repository.findAndCount).toHaveBeenCalledWith({
        select: {
          id: true,
          email: true,
          name: true,
          subscriptionStatus: true,
          subscriptionExpiresAt: true,
          trialStartedAt: true,
          createdAt: true,
          needsRelogin: true,
          lastLogoutReason: true,
          lastLogoutAt: true,
        },
        order: { createdAt: "DESC" },
        skip: 0,
        take: 50,
      });
    });

    it("should return empty array when no users", async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("should include each user's org plan summary", async () => {
      repository.findAndCount.mockResolvedValue([
        [{ ...mockUser }] as User[],
        1,
      ]);
      memberRepository.find.mockResolvedValue([
        mockPartial<OrganizationMember>({
          userId: "user-1",
          organizationId: "org-1",
          status: "active",
        }),
      ]);
      orgRepository.find.mockResolvedValue([
        {
          ...mockOrg,
          planStatus: "active",
          volumeTierProductId: "bearlymail_growth",
          emailVolumeLimit: 10000,
          emailsUsedThisCycle: 42,
          trialEndsAt: null,
          revenueCatOrgSubscriptionId: "rc-org-sub-1",
        } as Organization,
      ]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result.users[0].org).toEqual({
        id: "org-1",
        planStatus: "active",
        tier: "bearlymail_growth",
        emailVolumeLimit: 10000,
        emailsUsedThisCycle: 42,
        trialEndsAt: null,
        maxSeats: 5,
        hasRevenueCatSubscription: true,
      });
    });

    it("should return org=null for a user without an active membership", async () => {
      repository.findAndCount.mockResolvedValue([
        [{ ...mockUser }] as User[],
        1,
      ]);
      memberRepository.find.mockResolvedValue([]);

      const result = await service.getAllUsersWithSubscriptions();

      expect(result.users[0].org).toBeNull();
      expect(orgRepository.find).not.toHaveBeenCalled();
    });
  });

  // ─── adminGrantPlan / adminRevokePlan / adminResetUsage ──────────────────────

  describe("adminGrantPlan", () => {
    const freshOrg = () =>
      ({
        ...mockOrg,
        revenueCatOrgSubscriptionId: null,
        planStatus: "trial",
        trialEndsAt: new Date("2026-07-10"),
      }) as Organization;

    it("should grant a tier: planStatus=active, tier + limit set, trial cleared", async () => {
      const org = freshOrg();
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue(org);
      orgRepository.save.mockImplementation(
        async (entity) => entity as Organization,
      );

      const result = await service.adminGrantPlan(
        "admin-1",
        "user-1",
        "bearlymail_growth",
      );

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "active",
          volumeTierProductId: "bearlymail_growth",
          emailVolumeLimit: VOLUME_TIERS.bearlymail_growth.limit,
          trialEndsAt: null,
        }),
      );
      expect(result.success).toBe(true);
      expect(result.org.tier).toBe("bearlymail_growth");
      expect(result.org.hasRevenueCatSubscription).toBe(false);
    });

    it("should provision a personal org via ensurePersonalOrg when the user has none", async () => {
      memberRepository.findOne.mockResolvedValue(null);
      const provisioned = freshOrg();
      organizationsService.ensurePersonalOrg.mockResolvedValue(provisioned);
      orgRepository.save.mockImplementation(
        async (entity) => entity as Organization,
      );

      const result = await service.adminGrantPlan(
        "admin-1",
        "user-1",
        "bearlymail_starter",
      );

      expect(organizationsService.ensurePersonalOrg).toHaveBeenCalledWith(
        "user-1",
      );
      expect(result.org.emailVolumeLimit).toBe(
        VOLUME_TIERS.bearlymail_starter.limit,
      );
    });

    it("should refuse (409) when the org has a live RevenueCat subscription", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({ ...mockOrg } as Organization);

      await expect(
        service.adminGrantPlan("admin-1", "user-1", "bearlymail_growth"),
      ).rejects.toThrow(/RevenueCat/);
      expect(orgRepository.save).not.toHaveBeenCalled();
    });

    it("should reject an unknown tier", async () => {
      await expect(
        service.adminGrantPlan("admin-1", "user-1", "bearlymail_bogus"),
      ).rejects.toThrow(/Unknown volume tier/);
    });
  });

  describe("adminRevokePlan", () => {
    it("should drop the org to the free tier", async () => {
      const org = {
        ...mockOrg,
        revenueCatOrgSubscriptionId: null,
        planStatus: "active",
        volumeTierProductId: "bearlymail_growth",
        emailVolumeLimit: 10000,
      } as Organization;
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue(org);
      orgRepository.save.mockImplementation(
        async (entity) => entity as Organization,
      );

      const result = await service.adminRevokePlan("admin-1", "user-1");

      expect(orgRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "expired",
          volumeTierProductId: null,
          emailVolumeLimit: FREE_TIER_EMAIL_LIMIT,
          trialEndsAt: null,
        }),
      );
      expect(result.org.planStatus).toBe("expired");
    });

    it("should refuse (409) when the org has a live RevenueCat subscription", async () => {
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue({ ...mockOrg } as Organization);

      await expect(
        service.adminRevokePlan("admin-1", "user-1"),
      ).rejects.toThrow(/RevenueCat/);
      expect(orgRepository.save).not.toHaveBeenCalled();
    });

    it("should throw when the user has no organisation", async () => {
      memberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.adminRevokePlan("admin-1", "user-1"),
      ).rejects.toThrow(/no organisation/);
    });
  });

  describe("adminResetUsage", () => {
    it("should zero the usage counter and restart the billing cycle", async () => {
      const org = {
        ...mockOrg,
        revenueCatOrgSubscriptionId: null,
        emailsUsedThisCycle: 2999,
        billingCycleStart: new Date("2026-01-01"),
      } as Organization;
      memberRepository.findOne.mockResolvedValue(
        mockPartial({ organizationId: "org-1" }),
      );
      orgRepository.findOne.mockResolvedValue(org);
      orgRepository.save.mockImplementation(
        async (entity) => entity as Organization,
      );

      const result = await service.adminResetUsage("admin-1", "user-1");

      const saved = orgRepository.save.mock.calls[0][0] as Organization;
      expect(saved.emailsUsedThisCycle).toBe(0);
      expect(saved.billingCycleStart!.getTime()).toBeGreaterThan(
        Date.now() - 5000,
      );
      expect(result.org.emailsUsedThisCycle).toBe(0);
    });

    it("should throw when the user has no organisation", async () => {
      memberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.adminResetUsage("admin-1", "user-1"),
      ).rejects.toThrow(/no organisation/);
    });
  });
});
