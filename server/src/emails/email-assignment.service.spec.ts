import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { EmailAssignmentService } from "./email-assignment.service";

const mockMemberRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
};

const mockThreadRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const ORG_ID = "org-111";
const OWNER_USER_ID = "user-owner";
const MEMBER_USER_ID = "user-member";
const ADMIN_USER_ID = "user-admin";
const THREAD_ID = "thread-abc";

const makeActiveMembership = (
  userId: string,
  role: "owner" | "admin" | "member" = "member",
) => ({
  id: `member-${userId}`,
  userId,
  organizationId: ORG_ID,
  status: "active",
  role,
});

const makeThread = (overrides: Partial<EmailThread> = {}) =>
  ({
    id: THREAD_ID,
    userId: OWNER_USER_ID,
    assigneeId: null,
    ...overrides,
  }) as unknown as EmailThread;

describe("EmailAssignmentService", () => {
  let service: EmailAssignmentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAssignmentService,
        { provide: getRepositoryToken(EmailThread), useValue: mockThreadRepo },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: mockMemberRepo,
        },
      ],
    }).compile();

    service = module.get<EmailAssignmentService>(EmailAssignmentService);
  });

  // ─── assignThread ──────────────────────────────────────────────────────────

  describe("assignThread", () => {
    it("allows an admin to assign a thread to another member", async () => {
      // requireActiveMembership now uses find() — return single-element array
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne
        // assignee membership validation
        .mockResolvedValueOnce(makeActiveMembership(MEMBER_USER_ID))
        // thread owner in org check
        .mockResolvedValueOnce(makeActiveMembership(OWNER_USER_ID));

      mockThreadRepo.findOne.mockResolvedValueOnce(makeThread());
      const savedThread = makeThread({ assigneeId: MEMBER_USER_ID });
      mockThreadRepo.save.mockResolvedValueOnce(savedThread);

      const result = await service.assignThread(
        ADMIN_USER_ID,
        THREAD_ID,
        MEMBER_USER_ID,
      );

      expect(result.assigneeId).toBe(MEMBER_USER_ID);
      expect(mockThreadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: MEMBER_USER_ID }),
      );
    });

    it("allows a member to self-assign", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(MEMBER_USER_ID, "member"),
      ]);
      mockMemberRepo.findOne
        .mockResolvedValueOnce(makeActiveMembership(MEMBER_USER_ID))
        .mockResolvedValueOnce(makeActiveMembership(OWNER_USER_ID));

      mockThreadRepo.findOne.mockResolvedValueOnce(makeThread());
      const savedThread = makeThread({ assigneeId: MEMBER_USER_ID });
      mockThreadRepo.save.mockResolvedValueOnce(savedThread);

      const result = await service.assignThread(
        MEMBER_USER_ID,
        THREAD_ID,
        MEMBER_USER_ID,
      );

      expect(result.assigneeId).toBe(MEMBER_USER_ID);
    });

    it("throws ForbiddenException when a regular member tries to assign to someone else", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(MEMBER_USER_ID, "member"),
      ]);

      await expect(
        service.assignThread(MEMBER_USER_ID, THREAD_ID, ADMIN_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException when actor is not an org member", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([]);

      await expect(
        service.assignThread("stranger-id", THREAD_ID, MEMBER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws BadRequestException when actor belongs to multiple orgs", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
        makeActiveMembership(ADMIN_USER_ID, "member"),
      ]);

      await expect(
        service.assignThread(ADMIN_USER_ID, THREAD_ID, MEMBER_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when assignee is not in the org", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne
        // assignee not found
        .mockResolvedValueOnce(null);

      await expect(
        service.assignThread(ADMIN_USER_ID, THREAD_ID, "outsider-user"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when thread does not exist", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne.mockResolvedValueOnce(
        makeActiveMembership(MEMBER_USER_ID),
      );

      mockThreadRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.assignThread(ADMIN_USER_ID, THREAD_ID, MEMBER_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when thread owner is not in the same org", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne
        .mockResolvedValueOnce(makeActiveMembership(MEMBER_USER_ID))
        // thread owner membership check returns null (different org)
        .mockResolvedValueOnce(null);

      mockThreadRepo.findOne.mockResolvedValueOnce(makeThread());

      await expect(
        service.assignThread(ADMIN_USER_ID, THREAD_ID, MEMBER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── unassignThread ────────────────────────────────────────────────────────

  describe("unassignThread", () => {
    it("unassigns a thread and returns the updated entity", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne.mockResolvedValueOnce(
        makeActiveMembership(OWNER_USER_ID),
      );

      const thread = makeThread({ assigneeId: MEMBER_USER_ID });
      mockThreadRepo.findOne.mockResolvedValueOnce(thread);
      const unassigned = makeThread({ assigneeId: null });
      mockThreadRepo.save.mockResolvedValueOnce(unassigned);

      const result = await service.unassignThread(ADMIN_USER_ID, THREAD_ID);

      expect(result.assigneeId).toBeNull();
    });

    it("throws ForbiddenException when actor is not an org member", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([]);

      await expect(
        service.unassignThread("stranger", THREAD_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listThreadsAssignedToUser ─────────────────────────────────────────────

  describe("listThreadsAssignedToUser", () => {
    const mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    it("returns assigned threads for valid org member", async () => {
      // requireActiveMembership uses find(); subsequent target lookup uses findOne()
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne.mockResolvedValueOnce(
        makeActiveMembership(MEMBER_USER_ID),
      );

      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
        makeActiveMembership(MEMBER_USER_ID),
        makeActiveMembership(OWNER_USER_ID, "owner"),
      ]);

      const threads = [makeThread({ assigneeId: MEMBER_USER_ID })];
      mockQb.getMany.mockResolvedValueOnce(threads);
      mockThreadRepo.createQueryBuilder.mockReturnValueOnce(mockQb);

      const result = await service.listThreadsAssignedToUser(
        ADMIN_USER_ID,
        MEMBER_USER_ID,
      );

      expect(result).toHaveLength(1);
    });

    it("throws NotFoundException when target is not in the org", async () => {
      mockMemberRepo.find.mockResolvedValueOnce([
        makeActiveMembership(ADMIN_USER_ID, "admin"),
      ]);
      mockMemberRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.listThreadsAssignedToUser(ADMIN_USER_ID, "outsider"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
