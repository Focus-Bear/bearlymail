import { BadRequestException, ConflictException } from "@nestjs/common";

import { AUTO_ARCHIVE_PROPOSAL_STATUS } from "../constants/auto-archive-proposal.constants";
import { AutoArchiveProposal } from "../database/entities/auto-archive-proposal.entity";
import { buildRealisticMailbox } from "./__fixtures__/realistic-mailbox.fixture";
import { AutoArchiveProposalsService } from "./auto-archive-proposals.service";
import { SenderGroupPlan } from "./sender-groups.helper";

const USER = "user-1";
const mailbox = buildRealisticMailbox();

const githubPlan: SenderGroupPlan = {
  senderKey: mailbox.github.senderKey,
  scope: mailbox.github.scope,
  senderPattern: mailbox.github.senderPattern,
  senderDisplay: "GitHub <notifications@github.com>",
  memberSenderKeys: [mailbox.github.senderKey],
  total: mailbox.github.emails.length,
  newSinceScan: 2,
};

function pendingProposal(overrides: Partial<AutoArchiveProposal> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: USER,
    senderKey: githubPlan.senderKey,
    memberSenderKeys: githubPlan.memberSenderKeys,
    scope: githubPlan.scope,
    status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING,
    conditionKey: "key",
    senderDisplay: githubPlan.senderDisplay,
    condition: {
      senderPattern: "notifications@github.com",
      subjectPatterns: ["check translations"],
      bodyPatterns: [],
    },
    evidence: { window: { matched: 48 } },
    workflowRuleId: null,
    respondedAt: null,
    ...overrides,
  } as AutoArchiveProposal;
}

function setup() {
  const proposalRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn(async (entity) => ({ id: "saved", ...entity })),
    delete: jest.fn(),
  };
  const scanStateRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const mailboxLoader = {
    findSenderGroups: jest.fn().mockResolvedValue([githubPlan]),
    loadGroupEmails: jest.fn().mockResolvedValue(mailbox.github.emails),
  };
  const workflowsService = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "workflow-1" }),
  };
  const service = new AutoArchiveProposalsService(
    proposalRepository as never,
    scanStateRepository as never,
    mailboxLoader as never,
    workflowsService as never,
  );
  return {
    service,
    proposalRepository,
    scanStateRepository,
    mailboxLoader,
    workflowsService,
  };
}

describe("AutoArchiveProposalsService", () => {
  describe("mineForUser", () => {
    it("runs a full pass the first time and stores pending proposals with evidence", async () => {
      const { service, proposalRepository, scanStateRepository } = setup();
      const result = await service.mineForUser(USER);

      expect(result).toMatchObject({ fullScan: true, groupsAnalysed: 1 });
      const saved = proposalRepository.save.mock.calls.map(
        ([entity]) => entity,
      );
      expect(saved.length).toBeGreaterThan(0);
      for (const entity of saved) {
        expect(entity).toMatchObject({
          userId: USER,
          status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING,
          senderKey: githubPlan.senderKey,
        });
        expect(entity.evidence.window.engaged).toBe(0);
        expect(entity.conditionKey).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(
        saved.map((entity) => entity.condition.subjectPatterns),
      ).toContainEqual(["check translations"]);
      expect(scanStateRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER,
          lastFullScanAt: expect.any(Date),
        }),
      );
    });

    it("skips senders without enough new mail on an incremental pass", async () => {
      const { service, scanStateRepository, mailboxLoader } = setup();
      scanStateRepository.findOne.mockResolvedValue({
        userId: USER,
        lastScannedAt: new Date(),
        lastFullScanAt: new Date(),
      });
      const result = await service.mineForUser(USER);

      expect(result).toMatchObject({ fullScan: false, groupsAnalysed: 0 });
      expect(mailboxLoader.loadGroupEmails).not.toHaveBeenCalled();
    });

    it("never re-proposes a dismissed rule", async () => {
      const { service, proposalRepository } = setup();
      proposalRepository.find.mockImplementation(async ({ where }) =>
        where.senderKey
          ? [
              pendingProposal({
                status: AUTO_ARCHIVE_PROPOSAL_STATUS.DISMISSED,
                conditionKey: "dismissed",
              }),
            ]
          : [],
      );
      await service.mineForUser(USER);

      const saved = proposalRepository.save.mock.calls.map(
        ([entity]) => entity,
      );
      expect(
        saved.map((entity) => entity.condition.subjectPatterns),
      ).not.toContainEqual(["check translations"]);
    });

    it("does not propose what an existing archive workflow already covers", async () => {
      const { service, proposalRepository, workflowsService } = setup();
      workflowsService.findAll.mockResolvedValue([
        {
          enabled: true,
          actions: [{ type: "archive" }],
          condition: {
            fromPatterns: ["notifications@github.com"],
            subjectPatterns: ["Check Translations"],
          },
        },
      ]);
      await service.mineForUser(USER);

      const saved = proposalRepository.save.mock.calls.map(
        ([entity]) => entity,
      );
      expect(
        saved.map((entity) => entity.condition.subjectPatterns),
      ).not.toContainEqual(["check translations"]);
    });

    it("drops a pending proposal the data no longer supports", async () => {
      const { service, proposalRepository, mailboxLoader } = setup();
      mailboxLoader.loadGroupEmails.mockResolvedValue([]);
      proposalRepository.find.mockImplementation(async ({ where }) =>
        where.senderKey ? [pendingProposal({ id: "stale" })] : [],
      );
      await service.mineForUser(USER);

      expect(proposalRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER }),
      );
    });
  });

  describe("approve", () => {
    it("creates an ordinary archive workflow from the proposal", async () => {
      const { service, proposalRepository, workflowsService } = setup();
      proposalRepository.findOne.mockResolvedValue(pendingProposal());

      const view = await service.approve(USER, "id", {
        name: "Auto-archive GitHub",
      });

      expect(workflowsService.create).toHaveBeenCalledWith(USER, {
        name: "Auto-archive GitHub",
        enabled: true,
        condition: {
          fromPatterns: ["notifications@github.com"],
          subjectPatterns: ["check translations"],
          bodyPatterns: [],
          categories: [],
          priorityLevels: [],
          naturalLanguageCondition: null,
        },
        actions: [{ type: "archive" }],
      });
      expect(view.status).toBe(AUTO_ARCHIVE_PROPOSAL_STATUS.APPROVED);
      expect(view.workflowRuleId).toBe("workflow-1");
    });

    it("uses the user's edited keywords, cleaned", async () => {
      const { service, proposalRepository, workflowsService } = setup();
      proposalRepository.findOne.mockResolvedValue(pendingProposal());

      await service.approve(USER, "id", {
        name: "Rule",
        keywords: {
          subjectPatterns: [" Check Translations ", "", "Check Translations"],
          bodyPatterns: ["some jobs were not successful"],
        },
      });

      expect(workflowsService.create.mock.calls[0][1].condition).toMatchObject({
        subjectPatterns: ["Check Translations"],
        bodyPatterns: ["some jobs were not successful"],
      });
    });

    it("rejects an invalid regex keyword", async () => {
      const { service, proposalRepository } = setup();
      proposalRepository.findOne.mockResolvedValue(pendingProposal());

      await expect(
        service.approve(USER, "id", {
          name: "Rule",
          keywords: { subjectPatterns: ["/[unclosed/"], bodyPatterns: [] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a proposal that was already answered", async () => {
      const { service, proposalRepository } = setup();
      proposalRepository.findOne.mockResolvedValue(
        pendingProposal({ status: AUTO_ARCHIVE_PROPOSAL_STATUS.DISMISSED }),
      );

      await expect(
        service.approve(USER, "id", { name: "Rule" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it("dismiss remembers the answer", async () => {
    const { service, proposalRepository } = setup();
    proposalRepository.findOne.mockResolvedValue(pendingProposal());

    const view = await service.dismiss(USER, "id");

    expect(view.status).toBe(AUTO_ARCHIVE_PROPOSAL_STATUS.DISMISSED);
    expect(proposalRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ respondedAt: expect.any(Date) }),
    );
  });

  it("preview replays edited keywords over the sender's mail", async () => {
    const { service, proposalRepository } = setup();
    proposalRepository.findOne.mockResolvedValue(pendingProposal());

    const preview = await service.preview(USER, "id", {
      subjectPatterns: ["[Focus-Bear/Mac-App]"],
      bodyPatterns: [],
    });

    expect(preview.window.matched).toBeGreaterThan(48);
    expect(preview.window.engaged).toBeGreaterThan(0);
    expect(preview.sampleSubjects.length).toBeGreaterThan(0);
  });
});
