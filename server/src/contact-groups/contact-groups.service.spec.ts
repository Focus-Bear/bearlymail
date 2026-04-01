import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { ContactGroup } from "../database/entities/contact-group.entity";
import { ContactGroupMember } from "../database/entities/contact-group-member.entity";
import { ContactGroupsService } from "./contact-groups.service";

const makeRepo = (overrides: Partial<Record<string, jest.Mock>> = {}) => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(async (x) => x),
  remove: jest.fn(),
  delete: jest.fn(),
  ...overrides,
});

describe("ContactGroupsService", () => {
  let service: ContactGroupsService;
  let groupRepo: ReturnType<typeof makeRepo>;
  let memberRepo: ReturnType<typeof makeRepo>;
  let contactRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    groupRepo = makeRepo();
    memberRepo = makeRepo();
    contactRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactGroupsService,
        { provide: getRepositoryToken(ContactGroup), useValue: groupRepo },
        {
          provide: getRepositoryToken(ContactGroupMember),
          useValue: memberRepo,
        },
        { provide: getRepositoryToken(Contact), useValue: contactRepo },
      ],
    }).compile();

    service = module.get<ContactGroupsService>(ContactGroupsService);
  });

  describe("createGroup", () => {
    it("creates group with no members", async () => {
      groupRepo.save.mockResolvedValue({
        id: "g1",
        name: "Team",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      memberRepo.find.mockResolvedValue([]);

      const result = await service.createGroup("u1", {
        name: "Team",
        memberContactIds: [],
      });

      expect(result.name).toBe("Team");
      expect(result.memberCount).toBe(0);
    });

    it("creates group with members after verifying ownership", async () => {
      groupRepo.save.mockResolvedValue({
        id: "g1",
        name: "Engineering",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      contactRepo.find.mockResolvedValue([
        { id: "c1", email: "a@co.com", name: "Alice" },
        { id: "c2", email: "b@co.com", name: "Bob" },
      ]);
      memberRepo.find.mockResolvedValue([
        { contactId: "c1", contact: { email: "a@co.com", name: "Alice" } },
        { contactId: "c2", contact: { email: "b@co.com", name: "Bob" } },
      ]);

      const result = await service.createGroup("u1", {
        name: "Engineering",
        memberContactIds: ["c1", "c2"],
      });

      expect(result.memberCount).toBe(2);
      expect(memberRepo.save).toHaveBeenCalled();
    });
  });

  describe("updateGroup", () => {
    it("throws NotFoundException for unknown group", async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateGroup("u1", "bad-id", { name: "X" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when group belongs to another user", async () => {
      groupRepo.findOne.mockResolvedValue({
        id: "g1",
        userId: "u2",
        name: "X",
      });
      await expect(
        service.updateGroup("u1", "g1", { name: "Y" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("deleteGroup", () => {
    it("removes a group the user owns", async () => {
      const group = { id: "g1", userId: "u1", name: "T" };
      groupRepo.findOne.mockResolvedValue(group);
      await service.deleteGroup("u1", "g1");
      expect(groupRepo.remove).toHaveBeenCalledWith(group);
    });

    it("throws ForbiddenException when group belongs to another user", async () => {
      groupRepo.findOne.mockResolvedValue({
        id: "g1",
        userId: "u2",
        name: "T",
      });
      await expect(service.deleteGroup("u1", "g1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("searchGroups", () => {
    it("returns groups whose name contains query (case-insensitive)", async () => {
      groupRepo.find.mockResolvedValue([
        {
          id: "g1",
          name: "Engineering Team",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "g2",
          name: "Board Members",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      memberRepo.find.mockResolvedValue([]);

      const results = await service.searchGroups("u1", "engi");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Engineering Team");
    });
  });
});
