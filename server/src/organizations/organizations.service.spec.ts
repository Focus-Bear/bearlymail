import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { InviteService } from "./invite.service";
import { OrganizationsService } from "./organizations.service";

// EncryptionHelper.hashEmail is used for emailHash computation;
// mock it to return a stable value in tests.
jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      hashEmail: (email: string) => `hash:${email.toLowerCase()}`,
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

const mockOrgRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  // ensurePersonalOrg wraps creation in a transaction via orgRepo.manager.
  // Tests that exercise that path bind a stub implementation in their
  // describe-block beforeEach (afterEach() resets all mocks).
  manager: { transaction: jest.fn() },
};

const mockMemberRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockInviteService = {
  sendInviteEmail: jest.fn(),
};

const USER_ID = "user-uuid-1";
const ORG_ID = "org-uuid-1";

const makeUser = (overrides: Partial<User> = {}): Partial<User> => ({
  id: USER_ID,
  email: "alice@example.com",
  emailHash: "hash:alice@example.com",
  displayName: "Alice",
  name: "Alice",
  ...overrides,
});

const makeOrg = (
  overrides: Partial<Organization> = {},
): Partial<Organization> => ({
  id: ORG_ID,
  name: "Acme Inc",
  ownerId: USER_ID,
  ...overrides,
});

const makeMember = (
  overrides: Partial<OrganizationMember> = {},
): Partial<OrganizationMember> => ({
  id: "member-uuid-1",
  organizationId: ORG_ID,
  userId: USER_ID,
  email: "alice@example.com",
  emailHash: "hash:alice@example.com",
  role: "owner",
  status: "active",
  inviteToken: null,
  inviteExpires: null,
  invitedBy: USER_ID,
  ...overrides,
});

describe("OrganizationsService", () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: mockMemberRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: InviteService, useValue: mockInviteService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => jest.resetAllMocks());

  // ─── createOrganization ────────────────────────────────────────────────────

  describe("createOrganization", () => {
    it("creates an org and adds the owner as an active member", async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      // No existing org owned by this user
      mockOrgRepo.findOne.mockResolvedValue(null);
      const savedOrg = makeOrg();
      mockOrgRepo.create.mockReturnValue(savedOrg);
      mockOrgRepo.save.mockResolvedValue(savedOrg);
      mockMemberRepo.create.mockReturnValue(makeMember());
      mockMemberRepo.save.mockResolvedValue(makeMember());

      const result = await service.createOrganization(USER_ID, {
        name: "Acme Inc",
      });

      expect(mockOrgRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMemberRepo.save).toHaveBeenCalledTimes(1);
      expect(mockMemberRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: "owner", status: "active" }),
      );
      expect(result).toEqual(savedOrg);
    });

    it("starts the new org on a trial with the trial email limit", async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockOrgRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.create.mockReturnValue(makeOrg());
      mockOrgRepo.save.mockResolvedValue(makeOrg());
      mockMemberRepo.create.mockReturnValue(makeMember());
      mockMemberRepo.save.mockResolvedValue(makeMember());

      const before = Date.now();
      await service.createOrganization(USER_ID, { name: "Acme Inc" });

      expect(mockOrgRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "trial",
          emailVolumeLimit: 3000,
          trialEndsAt: expect.any(Date),
        }),
      );
      const { trialEndsAt } = mockOrgRepo.create.mock.calls[0][0] as {
        trialEndsAt: Date;
      };
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(trialEndsAt.getTime() - before).toBeGreaterThanOrEqual(
        sevenDaysMs - 60 * 1000,
      );
      expect(trialEndsAt.getTime() - before).toBeLessThanOrEqual(
        sevenDaysMs + 60 * 1000,
      );
    });

    it("throws ConflictException if user already owns an org", async () => {
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockOrgRepo.findOne.mockResolvedValue(makeOrg());

      await expect(
        service.createOrganization(USER_ID, { name: "Another Org" }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws NotFoundException when user not found", async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createOrganization(USER_ID, { name: "Acme" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMyOrganization ─────────────────────────────────────────────────────

  describe("getMyOrganization", () => {
    it("returns org and members for active member", async () => {
      const memberWithOrg = { ...makeMember(), organization: makeOrg() };
      mockMemberRepo.findOne.mockResolvedValue(memberWithOrg);
      const members = [makeMember()];
      mockMemberRepo.find.mockResolvedValue(members);

      const result = await service.getMyOrganization(USER_ID);
      expect(result.organization).toEqual(makeOrg());
      expect(result.members).toEqual(members);
    });

    it("throws NotFoundException when user has no active membership", async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);
      await expect(service.getMyOrganization(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── inviteMember ──────────────────────────────────────────────────────────

  describe("inviteMember", () => {
    const activeMembership = makeMember({ role: "owner" });

    it("creates a pending member and dispatches invite email", async () => {
      // First call: requireActiveMembership; second: check existing email
      mockMemberRepo.findOne
        .mockResolvedValueOnce(activeMembership)
        .mockResolvedValueOnce(null);
      // getSeatUsage: org has maxSeats=5, 1 active member
      mockOrgRepo.findOneOrFail.mockResolvedValue(makeOrg({ maxSeats: 5 }));
      mockMemberRepo.count.mockResolvedValue(1);
      const pendingMember = makeMember({
        status: "pending",
        role: "member",
        email: "bob@example.com",
        emailHash: "hash:bob@example.com",
        inviteToken: "tok",
        userId: null,
      });
      mockMemberRepo.create.mockReturnValue(pendingMember);
      mockMemberRepo.save.mockResolvedValue(pendingMember);
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockOrgRepo.findOne.mockResolvedValue(makeOrg({ maxSeats: 5 }));
      mockInviteService.sendInviteEmail.mockResolvedValue(undefined);

      const result = await service.inviteMember(USER_ID, {
        email: "bob@example.com",
        role: "member",
      });

      expect(mockMemberRepo.save).toHaveBeenCalledTimes(1);
      expect(mockInviteService.sendInviteEmail).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("pending");
    });

    it("throws ForbiddenException when seat limit is reached", async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce(activeMembership);
      mockOrgRepo.findOneOrFail.mockResolvedValue(makeOrg({ maxSeats: 2 }));
      mockMemberRepo.count.mockResolvedValue(2);

      await expect(
        service.inviteMember(USER_ID, {
          email: "bob@example.com",
          role: "member",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ConflictException when email already active in org", async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce(activeMembership)
        .mockResolvedValueOnce(makeMember({ status: "active" }));
      mockOrgRepo.findOneOrFail.mockResolvedValue(makeOrg({ maxSeats: 5 }));
      mockMemberRepo.count.mockResolvedValue(1);

      await expect(
        service.inviteMember(USER_ID, {
          email: "alice@example.com",
          role: "member",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("throws ForbiddenException when requester is a plain member", async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce(
        makeMember({ role: "member" }),
      );

      await expect(
        service.inviteMember(USER_ID, {
          email: "bob@example.com",
          role: "member",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── validateInviteToken ───────────────────────────────────────────────────

  describe("validateInviteToken", () => {
    it("returns null for unknown token", async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);
      const result = await service.validateInviteToken("bad-token");
      expect(result).toBeNull();
    });

    it("returns null for expired token", async () => {
      const expiredMember = makeMember({
        status: "pending",
        inviteToken: "tok",
        inviteExpires: new Date("2000-01-01"),
        organization: makeOrg() as Organization,
        invitedByUser: makeUser() as User,
      });
      mockMemberRepo.findOne.mockResolvedValue(expiredMember);
      const result = await service.validateInviteToken("tok");
      expect(result).toBeNull();
    });

    it("returns org info for valid token (inviterName, not inviterEmail)", async () => {
      const future = new Date(Date.now() + 86_400_000);
      const validMember = {
        ...makeMember({
          status: "pending",
          inviteToken: "tok",
          inviteExpires: future,
          role: "member" as const,
        }),
        organization: makeOrg() as Organization,
        invitedByUser: makeUser() as User,
      };
      mockMemberRepo.findOne.mockResolvedValue(validMember);

      const result = await service.validateInviteToken("tok");
      expect(result).not.toBeNull();
      expect(result?.orgName).toBe("Acme Inc");
      // Must return inviterName (display name), NOT inviterEmail
      expect(result).toHaveProperty("inviterName");
      expect(result).not.toHaveProperty("inviterEmail");
      // makeUser() has displayName: "Alice"
      expect(result?.inviterName).toBe("Alice");
    });
  });

  // ─── acceptInvite ──────────────────────────────────────────────────────────

  describe("acceptInvite", () => {
    it("activates the membership on valid accept", async () => {
      const pending = makeMember({
        status: "pending",
        inviteToken: "tok",
        inviteExpires: new Date(Date.now() + 86_400_000),
        emailHash: "hash:alice@example.com",
        userId: null,
      });
      // First call: invite lookup; second: check for existing active membership
      mockMemberRepo.findOne
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(null);
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const saved = {
        ...pending,
        status: "active",
        userId: USER_ID,
        inviteToken: null,
      };
      mockMemberRepo.save.mockResolvedValue(saved);

      const result = await service.acceptInvite("tok", USER_ID);
      expect(result.status).toBe("active");
      expect(result.inviteToken).toBeNull();
    });

    it("throws BadRequestException for invalid token", async () => {
      mockMemberRepo.findOne.mockResolvedValue(null);
      await expect(service.acceptInvite("bad", USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException for expired invite", async () => {
      mockMemberRepo.findOne.mockResolvedValue(
        makeMember({
          status: "pending",
          inviteToken: "tok",
          inviteExpires: new Date("2000-01-01"),
        }),
      );
      await expect(service.acceptInvite("tok", USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws ForbiddenException when email does not match invite", async () => {
      const pending = makeMember({
        status: "pending",
        inviteToken: "tok",
        inviteExpires: new Date(Date.now() + 86_400_000),
        emailHash: "hash:other@example.com",
        userId: null,
      });
      mockMemberRepo.findOne
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(null);
      // makeUser() has email alice@example.com, whose hash won't match hash:other@example.com
      mockUserRepo.findOne.mockResolvedValue(makeUser());

      await expect(service.acceptInvite("tok", USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── updateMemberRole ──────────────────────────────────────────────────────

  describe("updateMemberRole", () => {
    const MEMBER_2_ID = "member-uuid-2";
    const USER_2_ID = "user-uuid-2";

    it("updates role for a non-owner member (happy path)", async () => {
      const requesterMembership = makeMember({ role: "owner" });
      const targetMember = makeMember({
        id: MEMBER_2_ID,
        userId: USER_2_ID,
        role: "member",
      });
      mockMemberRepo.findOne
        // requireActiveMembership
        .mockResolvedValueOnce(requesterMembership)
        // target lookup
        .mockResolvedValueOnce(targetMember);
      const saved = { ...targetMember, role: "admin" };
      mockMemberRepo.save.mockResolvedValue(saved);

      const result = await service.updateMemberRole(USER_ID, MEMBER_2_ID, {
        role: "admin",
      });

      expect(mockMemberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin" }),
      );
      expect(result.role).toBe("admin");
    });

    it("throws ForbiddenException when trying to change the owner role", async () => {
      const requesterMembership = makeMember({ role: "owner" });
      const targetOwner = makeMember({
        id: MEMBER_2_ID,
        userId: USER_2_ID,
        role: "owner",
      });
      mockMemberRepo.findOne
        .mockResolvedValueOnce(requesterMembership)
        .mockResolvedValueOnce(targetOwner);

      await expect(
        service.updateMemberRole(USER_ID, MEMBER_2_ID, { role: "admin" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when a non-owner admin tries to change their own role", async () => {
      const adminMembership = makeMember({
        id: "member-uuid-1",
        userId: USER_ID,
        role: "admin",
      });
      // Target is the same user (self-change as admin)
      const selfTarget = makeMember({
        id: "member-uuid-1",
        userId: USER_ID,
        role: "admin",
      });
      mockMemberRepo.findOne
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(selfTarget);

      await expect(
        service.updateMemberRole(USER_ID, "member-uuid-1", { role: "member" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when requester is a plain member", async () => {
      mockMemberRepo.findOne.mockResolvedValueOnce(
        makeMember({ role: "member" }),
      );

      await expect(
        service.updateMemberRole(USER_ID, MEMBER_2_ID, { role: "admin" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when target member does not exist", async () => {
      const requesterMembership = makeMember({ role: "owner" });
      mockMemberRepo.findOne
        .mockResolvedValueOnce(requesterMembership)
        .mockResolvedValueOnce(null);

      await expect(
        service.updateMemberRole(USER_ID, "nonexistent-id", { role: "admin" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("allows owner to change their own role (owner can self-update)", async () => {
      const ownerMembership = makeMember({ role: "owner", userId: USER_ID });
      // Owner changing their own record — role guard doesn't block owners
      // but role === "owner" does block (cannot change owner role)
      // So set target as admin role owned by same userId to test the owner self-change path
      const selfTarget = makeMember({
        id: "member-uuid-1",
        userId: USER_ID,
        // not owner, so passes the owner-role check
        role: "admin",
      });
      mockMemberRepo.findOne
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce(selfTarget);
      const saved = { ...selfTarget, role: "member" };
      mockMemberRepo.save.mockResolvedValue(saved);

      // Owner changing self: target.userId === requesterId but requesterMembership.role === "owner"
      // so the ForbiddenException guard does NOT fire
      const result = await service.updateMemberRole(USER_ID, "member-uuid-1", {
        role: "member",
      });
      expect(result.role).toBe("member");
    });
  });

  // ─── removeMember ──────────────────────────────────────────────────────────

  describe("removeMember", () => {
    it("deactivates a non-owner member", async () => {
      // First call: requester membership; second: target member
      mockMemberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: "owner" }))
        .mockResolvedValueOnce(
          makeMember({ id: "member-2", role: "member", userId: "user-2" }),
        );
      mockMemberRepo.save.mockResolvedValue({});

      await service.removeMember(USER_ID, "member-2");
      expect(mockMemberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "deactivated" }),
      );
    });

    it("throws ForbiddenException when trying to remove the owner", async () => {
      mockMemberRepo.findOne
        .mockResolvedValueOnce(makeMember({ role: "owner" }))
        .mockResolvedValueOnce(makeMember({ role: "owner", id: "member-2" }));

      await expect(service.removeMember(USER_ID, "member-2")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── getSeatUsage ──────────────────────────────────────────────────────────

  describe("getSeatUsage", () => {
    it("returns seat usage from org.maxSeats and active member count", async () => {
      mockOrgRepo.findOneOrFail.mockResolvedValue(makeOrg({ maxSeats: 5 }));
      mockMemberRepo.count.mockResolvedValue(3);

      const result = await service.getSeatUsage(ORG_ID);

      expect(result).toEqual({ activeSeats: 3, maxSeats: 5, canInvite: true });
    });

    it("returns canInvite=false when seat limit reached", async () => {
      mockOrgRepo.findOneOrFail.mockResolvedValue(makeOrg({ maxSeats: 2 }));
      mockMemberRepo.count.mockResolvedValue(2);

      const result = await service.getSeatUsage(ORG_ID);

      expect(result).toEqual({ activeSeats: 2, maxSeats: 2, canInvite: false });
    });
  });

  // ─── getVolumeUsage ────────────────────────────────────────────────────────

  describe("getVolumeUsage", () => {
    it("returns volume usage percentages", async () => {
      mockOrgRepo.findOneOrFail.mockResolvedValue(
        makeOrg({
          emailsUsedThisCycle: 1500,
          emailVolumeLimit: 3000,
          volumeTierProductId: "bearlymail_starter",
          planStatus: "active",
        } as Partial<Organization>),
      );

      const result = await service.getVolumeUsage(ORG_ID);

      expect(result).toEqual({
        emailsUsed: 1500,
        emailLimit: 3000,
        percentUsed: 50,
        tier: "bearlymail_starter",
        planStatus: "active",
        trialEndsAt: null,
        selfHosted: false,
      });
    });

    it("lazily expires an elapsed trial and reports the free-tier limit", async () => {
      const trialOrg = makeOrg({
        emailsUsedThisCycle: 150,
        emailVolumeLimit: 3000,
        volumeTierProductId: null,
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
      } as Partial<Organization>) as Organization;
      mockOrgRepo.findOneOrFail.mockResolvedValue(trialOrg);
      mockOrgRepo.save.mockResolvedValue(trialOrg);

      const result = await service.getVolumeUsage(ORG_ID);

      expect(mockOrgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          planStatus: "expired",
          emailVolumeLimit: 100,
        }),
      );
      expect(result.planStatus).toBe("expired");
      expect(result.emailLimit).toBe(100);
    });

    it("returns tier=none when no volume tier is set", async () => {
      mockOrgRepo.findOneOrFail.mockResolvedValue(
        makeOrg({
          emailsUsedThisCycle: 0,
          emailVolumeLimit: 3000,
          volumeTierProductId: null,
        } as Partial<Organization>),
      );

      const result = await service.getVolumeUsage(ORG_ID);

      expect(result.tier).toBe("none");
    });
  });

  // ─── self-hosted mode ────────────────────────────────────────────────────────

  describe("self-hosted mode (SELF_HOSTED=true)", () => {
    let selfHostedService: OrganizationsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OrganizationsService,
          { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
          {
            provide: getRepositoryToken(OrganizationMember),
            useValue: mockMemberRepo,
          },
          { provide: getRepositoryToken(User), useValue: mockUserRepo },
          { provide: InviteService, useValue: mockInviteService },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) =>
                key === "SELF_HOSTED" ? "true" : undefined,
              ),
            },
          },
        ],
      }).compile();
      selfHostedService =
        module.get<OrganizationsService>(OrganizationsService);
    });

    it("never applies trial expiry, even when the trial has elapsed", async () => {
      const trialOrg = makeOrg({
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
        emailVolumeLimit: 3000,
      } as Partial<Organization>) as Organization;

      const result = await selfHostedService.expireTrialIfDue(trialOrg);

      expect(mockOrgRepo.save).not.toHaveBeenCalled();
      expect(result.planStatus).toBe("trial");
      expect(result.emailVolumeLimit).toBe(3000);
    });

    it("reports selfHosted=true in volume usage", async () => {
      mockOrgRepo.findOneOrFail.mockResolvedValue(
        makeOrg({
          emailsUsedThisCycle: 0,
          emailVolumeLimit: 3000,
        } as Partial<Organization>),
      );

      const result = await selfHostedService.getVolumeUsage(ORG_ID);

      expect(result.selfHosted).toBe(true);
    });
  });

  // ─── ensurePersonalOrg ───────────────────────────────────────────────────────

  describe("ensurePersonalOrg", () => {
    // afterEach() resets all mocks (including manager.transaction's
    // implementation), so re-bind the tx stub before each case.
    beforeEach(() => {
      mockOrgRepo.manager.transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => {
          const tx = {
            create: (entity: { name: string }, payload: unknown) => {
              if (entity === Organization) return mockOrgRepo.create(payload);
              if (entity === OrganizationMember)
                return mockMemberRepo.create(payload);
              throw new Error(
                `Unexpected entity in tx.create: ${entity?.name}`,
              );
            },
            save: (payload: { organizationId?: string }) => {
              if (payload && "organizationId" in payload) {
                return mockMemberRepo.save(payload);
              }
              return mockOrgRepo.save(payload);
            },
          };
          return cb(tx);
        },
      );
    });

    it("returns the existing org when the user already owns one", async () => {
      const owned = makeOrg();
      mockOrgRepo.findOne.mockResolvedValue(owned);

      const result = await service.ensurePersonalOrg(USER_ID);

      expect(result).toBe(owned);
      expect(mockOrgRepo.create).not.toHaveBeenCalled();
      expect(mockMemberRepo.save).not.toHaveBeenCalled();
    });

    it("returns the team org when the user is an active member (no personal org)", async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);
      const teamOrg = makeOrg({ id: "team-org", ownerId: "someone-else" });
      mockMemberRepo.findOne.mockResolvedValue(
        makeMember({ organization: teamOrg } as Partial<OrganizationMember>),
      );

      const result = await service.ensurePersonalOrg(USER_ID);

      expect(result).toBe(teamOrg);
      expect(mockOrgRepo.create).not.toHaveBeenCalled();
    });

    it("provisions a single-seat personal org + owner member when the user has none", async () => {
      // no owned org, no membership
      mockOrgRepo.findOne.mockResolvedValueOnce(null);
      mockMemberRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const savedOrg = makeOrg();
      mockOrgRepo.create.mockReturnValue(savedOrg);
      mockOrgRepo.save.mockResolvedValue(savedOrg);
      mockMemberRepo.create.mockImplementation((member) => member);
      mockMemberRepo.save.mockImplementation((member) =>
        Promise.resolve(member),
      );

      const result = await service.ensurePersonalOrg(USER_ID);

      expect(result).toBe(savedOrg);
      expect(mockOrgRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: USER_ID,
          maxSeats: 1,
          planStatus: "trial",
          emailVolumeLimit: 3000,
          trialEndsAt: expect.any(Date),
        }),
      );
      expect(mockMemberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          userId: USER_ID,
          role: "owner",
          status: "active",
        }),
      );
    });

    it("recovers from a concurrent-creation race by re-reading the org", async () => {
      // owned lookup: none initially, then the racing winner's org on retry
      const racedOrg = makeOrg();
      mockOrgRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(racedOrg);
      mockMemberRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockOrgRepo.create.mockReturnValue(makeOrg());
      // save throws as if the unique ownerId index was violated
      mockOrgRepo.save.mockRejectedValue(new Error("duplicate key value"));

      const result = await service.ensurePersonalOrg(USER_ID);

      expect(result).toBe(racedOrg);
    });

    it("throws NotFound when the user does not exist", async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);
      mockMemberRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.ensurePersonalOrg(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── expireTrialIfDue ─────────────────────────────────────────────────────────

  describe("expireTrialIfDue", () => {
    it("expires an elapsed trial and downgrades to the free-tier limit", async () => {
      const org = makeOrg({
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() - 1000),
        emailVolumeLimit: 3000,
        maxSeats: 1,
      } as Partial<Organization>) as Organization;
      mockOrgRepo.save.mockResolvedValue(org);

      const result = await service.expireTrialIfDue(org);

      expect(result.planStatus).toBe("expired");
      expect(result.emailVolumeLimit).toBe(100);
      // Owner keeps access to the org
      expect(result.maxSeats).toBe(1);
      expect(mockOrgRepo.save).toHaveBeenCalledWith(org);
    });

    it("leaves a still-running trial unchanged", async () => {
      const org = makeOrg({
        planStatus: "trial",
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVolumeLimit: 3000,
      } as Partial<Organization>) as Organization;

      const result = await service.expireTrialIfDue(org);

      expect(result.planStatus).toBe("trial");
      expect(result.emailVolumeLimit).toBe(3000);
      expect(mockOrgRepo.save).not.toHaveBeenCalled();
    });

    it("does not touch active or already-expired orgs", async () => {
      const activeOrg = makeOrg({
        planStatus: "active",
        trialEndsAt: null,
        emailVolumeLimit: 10000,
      } as Partial<Organization>) as Organization;

      const result = await service.expireTrialIfDue(activeOrg);

      expect(result.planStatus).toBe("active");
      expect(result.emailVolumeLimit).toBe(10000);
      expect(mockOrgRepo.save).not.toHaveBeenCalled();
    });
  });
});
