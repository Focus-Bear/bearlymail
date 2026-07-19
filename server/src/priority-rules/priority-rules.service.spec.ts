import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { Email } from "../database/entities/email.entity";
import { PriorityRule } from "../database/entities/priority-rule.entity";
import { PriorityRulesService } from "./priority-rules.service";

const makeRule = (overrides: Partial<PriorityRule> = {}): PriorityRule =>
  ({
    id: "rule-1",
    userId: "user-1",
    compositeSpec: {
      v: 3,
      fromMatchesAny: ["boss@acme.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
    },
    band: "high",
    representativeScore: 80,
    source: "mined",
    sampleCount: 30,
    dominantBandShare: 0.95,
    isEnabled: true,
    hitCount: 0,
    shadowSampleCount: 0,
    shadowDivergenceCount: 0,
    lastValidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PriorityRule;

const makeEmail = (overrides: Partial<Email> = {}): Email =>
  ({
    id: "email-1",
    from: "boss@acme.com",
    subject: "hi",
    body: "body",
    htmlBody: null,
    emailThreadId: "thread-1",
    senderEmailHmac: "hmac-boss",
    ...overrides,
  }) as Email;

/** Chainable query-builder stub whose getRawMany resolves to `rows`. */
const makeQb = (rows: Array<{ threadId: string; score: number }>) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    "innerJoin",
    "select",
    "addSelect",
    "where",
    "andWhere",
    "distinct",
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
};

describe("PriorityRulesService", () => {
  let service: PriorityRulesService;
  let ruleRepo: jest.Mocked<Repository<PriorityRule>>;
  let emailRepo: jest.Mocked<Repository<Email>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PriorityRulesService,
        {
          provide: getRepositoryToken(PriorityRule),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            increment: jest.fn(),
            create: jest.fn((x) => x),
            save: jest.fn((x) => Promise.resolve(x)),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: CloudWatchService, useValue: { putMetric: jest.fn() } },
      ],
    }).compile();
    service = module.get(PriorityRulesService);
    ruleRepo = module.get(getRepositoryToken(PriorityRule));
    emailRepo = module.get(getRepositoryToken(Email));
    // Default: no existing rules. Tests that need one override this.
    ruleRepo.find.mockResolvedValue([]);
  });

  const email = { from: "boss@acme.com", subject: "hi", bodyTextForMatch: "x" };
  const meta = { from: "boss@acme.com", subject: "hi", bodyTextForMatch: "x" };

  describe("matching", () => {
    it("returns the band + score of the matching rule", async () => {
      ruleRepo.find.mockResolvedValue([makeRule()]);
      expect(await service.peekMatchingRule("user-1", email)).toEqual({
        ruleId: "rule-1",
        band: "high",
        representativeScore: 80,
      });
    });

    it("returns null when no rule matches", async () => {
      ruleRepo.find.mockResolvedValue([makeRule()]);
      expect(
        await service.peekMatchingRule("user-1", {
          from: "stranger@acme.com",
          subject: "",
        }),
      ).toBeNull();
    });

    it("peek does NOT record a hit; findMatchingRule does", async () => {
      ruleRepo.find.mockResolvedValue([makeRule()]);
      await service.peekMatchingRule("user-1", email);
      expect(ruleRepo.increment).not.toHaveBeenCalled();
      await service.findMatchingRule("user-1", email);
      expect(ruleRepo.increment).toHaveBeenCalledWith(
        { id: "rule-1" },
        "hitCount",
        1,
      );
    });
  });

  describe("mineAndUpsertRule", () => {
    const scoreRows = (count: number, score: number) =>
      Array.from({ length: count }, (_, i) => ({
        threadId: `t-${score}-${i}`,
        score,
      }));

    it("skips when there are fewer than 25 labelled threads", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb(scoreRows(10, 80)) as never,
      );
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      expect(outcome.status).toBe("skipped");
      expect(ruleRepo.save).not.toHaveBeenCalled();
    });

    it("skips when the scores have no dominant band", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb([...scoreRows(15, 80), ...scoreRows(15, 35)]) as never,
      );
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      expect(outcome.status).toBe("skipped");
    });

    it("creates a sender-anchored rule when scores cluster in one band", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb([...scoreRows(29, 80), ...scoreRows(1, 50)]) as never,
      );
      // No existing rule for this sender.
      ruleRepo.find.mockResolvedValue([]);
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      expect(outcome).toEqual({
        status: "created",
        band: "high",
        sampleCount: 30,
      });
      expect(ruleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          band: "high",
          representativeScore: 80,
          sampleCount: 30,
          compositeSpec: expect.objectContaining({
            fromMatchesAny: ["boss@acme.com"],
          }),
        }),
      );
    });

    it("updates an existing rule for the same sender", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb(scoreRows(30, 80)) as never,
      );
      ruleRepo.find.mockResolvedValue([makeRule({ id: "existing-1" })]);
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      expect(outcome.status).toBe("updated");
      expect(ruleRepo.update).toHaveBeenCalledWith(
        { id: "existing-1" },
        expect.objectContaining({ band: "high", representativeScore: 80 }),
      );
      expect(ruleRepo.save).not.toHaveBeenCalled();
    });

    it("does not resurrect a disabled rule when re-mining (preserves isEnabled)", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb(scoreRows(30, 80)) as never,
      );
      ruleRepo.find.mockResolvedValue([
        makeRule({ id: "disabled-1", isEnabled: false }),
      ]);
      await service.mineAndUpsertRule("user-1", makeEmail(), meta, "w1");
      expect(ruleRepo.update).toHaveBeenCalledWith(
        { id: "disabled-1" },
        expect.objectContaining({ isEnabled: false }),
      );
    });

    it("retires an existing rule when the sender's scores lose consistency", async () => {
      // 30 samples split evenly across two bands → no dominant band, but enough
      // samples to conclude the sender has drifted.
      emailRepo.createQueryBuilder.mockReturnValue(
        makeQb([...scoreRows(15, 95), ...scoreRows(15, 35)]) as never,
      );
      ruleRepo.find.mockResolvedValue([makeRule({ id: "stale-1" })]);
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      expect(outcome.status).toBe("skipped");
      expect(ruleRepo.update).toHaveBeenCalledWith(
        { id: "stale-1" },
        { isEnabled: false },
      );
    });
  });

  describe("shadowAndMine", () => {
    it("no-ops when the email has no thread or sender hmac", async () => {
      await service.shadowAndMine(
        "user-1",
        makeEmail({ emailThreadId: null as never }),
        80,
        "w1",
      );
      expect(emailRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("logs a divergence when an existing rule disagrees with the LLM band", async () => {
      const warn = jest.spyOn(service["logger"], "warn").mockImplementation();
      // Mining is skipped (few scores), so only the shadow path runs.
      emailRepo.createQueryBuilder.mockReturnValue(makeQb([]) as never);
      ruleRepo.find.mockResolvedValue([makeRule({ band: "low" })]);
      // LLM scored this email 95 (urgent) but the rule says "low" → diverge.
      await service.shadowAndMine("user-1", makeEmail(), 95, "w1");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("shadow DIVERGE"),
      );
    });

    it("retires a rule once its shadow divergence crosses the threshold", async () => {
      // Mining skipped (no scores). Rule says "low" but the LLM says urgent (95).
      emailRepo.createQueryBuilder.mockReturnValue(makeQb([]) as never);
      ruleRepo.find.mockResolvedValue([
        makeRule({ id: "drift-1", band: "low" }),
      ]);
      // Post-increment state read by maybeRetireForDrift: 4/10 diverged > 0.3.
      ruleRepo.findOne.mockResolvedValue(
        makeRule({
          id: "drift-1",
          band: "low",
          shadowSampleCount: 10,
          shadowDivergenceCount: 4,
        }),
      );
      await service.shadowAndMine("user-1", makeEmail(), 95, "w1");
      expect(ruleRepo.increment).toHaveBeenCalledWith(
        { id: "drift-1" },
        "shadowDivergenceCount",
        1,
      );
      expect(ruleRepo.update).toHaveBeenCalledWith(
        { id: "drift-1" },
        { isEnabled: false },
      );
    });

    it("does not auto-retire a user-managed rule for drift", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(makeQb([]) as never);
      ruleRepo.find.mockResolvedValue([
        makeRule({ id: "u1", band: "low", source: "user" }),
      ]);
      ruleRepo.findOne.mockResolvedValue(
        makeRule({
          id: "u1",
          band: "low",
          source: "user",
          shadowSampleCount: 10,
          shadowDivergenceCount: 9,
        }),
      );
      await service.shadowAndMine("user-1", makeEmail(), 95, "w1");
      expect(ruleRepo.update).not.toHaveBeenCalledWith(
        { id: "u1" },
        { isEnabled: false },
      );
    });
  });

  describe("create / update / delete", () => {
    it("creates a user-managed rule with the band's representative score", async () => {
      const dto = await service.createRule("user-1", {
        senders: ["  boss@acme.com  ", ""],
        band: "urgent",
      });
      expect(ruleRepo.save).toHaveBeenCalled();
      expect(dto).toMatchObject({
        source: "user",
        band: "urgent",
        representativeScore: 95,
        senders: ["boss@acme.com"],
      });
    });

    it("rejects creation with no senders", async () => {
      await expect(
        service.createRule("user-1", { senders: ["  "], band: "high" }),
      ).rejects.toThrow();
    });

    it("rejects an invalid band", async () => {
      await expect(
        service.createRule("user-1", {
          senders: ["a@b.co"],
          band: "nope" as never,
        }),
      ).rejects.toThrow();
    });

    it("editing the band marks the rule source='user'", async () => {
      ruleRepo.findOne.mockResolvedValue(makeRule({ id: "m1" }));
      await service.updateRule("user-1", "m1", { band: "urgent" });
      expect(ruleRepo.update).toHaveBeenCalledWith(
        { id: "m1", userId: "user-1" },
        expect.objectContaining({
          band: "urgent",
          representativeScore: 95,
          source: "user",
        }),
      );
    });

    it("toggling isEnabled does NOT change the source", async () => {
      ruleRepo.findOne.mockResolvedValue(makeRule({ id: "m1" }));
      await service.updateRule("user-1", "m1", { isEnabled: false });
      const patch = ruleRepo.update.mock.calls[0][1];
      expect(patch).toEqual({ isEnabled: false });
      expect(patch).not.toHaveProperty("source");
    });

    it("returns null when updating a non-existent rule", async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      expect(
        await service.updateRule("user-1", "missing", { band: "low" }),
      ).toBeNull();
    });

    it("deletes a rule scoped to the user", async () => {
      ruleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });
      expect(await service.deleteRule("user-1", "r1")).toBe(true);
      expect(ruleRepo.delete).toHaveBeenCalledWith({
        id: "r1",
        userId: "user-1",
      });
    });
  });

  describe("miner protection", () => {
    const rows30 = Array.from({ length: 30 }, (_, i) => ({
      threadId: `t-${i}`,
      score: 80,
    }));

    it("skips mining a sender that already has a user-managed rule (no duplicate)", async () => {
      emailRepo.createQueryBuilder.mockReturnValue(makeQb(rows30) as never);
      ruleRepo.find.mockResolvedValue([makeRule({ id: "u1", source: "user" })]);
      const outcome = await service.mineAndUpsertRule(
        "user-1",
        makeEmail(),
        meta,
        "w1",
      );
      // The user rule is found → miner skips entirely: no overwrite, no parallel
      // mined duplicate created.
      expect(outcome.status).toBe("skipped");
      expect(ruleRepo.update).not.toHaveBeenCalledWith(
        { id: "u1" },
        expect.anything(),
      );
      expect(ruleRepo.save).not.toHaveBeenCalled();
    });
  });
});
