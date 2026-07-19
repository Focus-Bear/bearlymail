import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { PriorityRuleMiningCron } from "./priority-rule-mining.cron";

const makeQb = (rows: Array<{ userId: string; hmac: string }>) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    "innerJoin",
    "select",
    "addSelect",
    "where",
    "andWhere",
    "groupBy",
    "addGroupBy",
    "having",
    "orderBy",
    "limit",
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
};

describe("PriorityRuleMiningCron", () => {
  let cron: PriorityRuleMiningCron;
  let emailRepo: jest.Mocked<Repository<Email>>;
  let mineAndUpsertRule: jest.Mock;

  beforeEach(async () => {
    emailRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Email>>;
    mineAndUpsertRule = jest.fn().mockResolvedValue({ status: "skipped" });

    const module = await Test.createTestingModule({
      providers: [
        PriorityRuleMiningCron,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: {} },
        { provide: getRepositoryToken(Email), useValue: emailRepo },
        {
          provide: UserEncryptionService,
          useValue: {
            withUserKey: (_u: string, cb: () => unknown) => cb(),
          },
        },
        { provide: PriorityRulesService, useValue: { mineAndUpsertRule } },
      ],
    }).compile();
    cron = module.get(PriorityRuleMiningCron);
  });

  it("mines each candidate sender under its user's key", async () => {
    emailRepo.createQueryBuilder.mockReturnValue(
      makeQb([
        { userId: "u1", hmac: "h1" },
        { userId: "u1", hmac: "h2" },
        { userId: "u2", hmac: "h3" },
      ]) as never,
    );
    emailRepo.findOne.mockImplementation((opts) =>
      Promise.resolve({
        id: "e",
        senderEmailHmac: (opts as { where: { senderEmailHmac: string } }).where
          .senderEmailHmac,
        from: "sender@acme.com",
      } as Email),
    );

    await cron.sweep();

    expect(mineAndUpsertRule).toHaveBeenCalledTimes(3);
    expect(mineAndUpsertRule).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ senderEmailHmac: "h1" }),
      expect.objectContaining({ from: "sender@acme.com" }),
      "mining-cron",
    );
  });

  it("no-ops when there are no candidates", async () => {
    emailRepo.createQueryBuilder.mockReturnValue(makeQb([]) as never);
    await cron.sweep();
    expect(mineAndUpsertRule).not.toHaveBeenCalled();
  });

  it("isolates a failing sender and continues", async () => {
    emailRepo.createQueryBuilder.mockReturnValue(
      makeQb([
        { userId: "u1", hmac: "h1" },
        { userId: "u1", hmac: "h2" },
      ]) as never,
    );
    emailRepo.findOne
      .mockResolvedValueOnce({
        id: "e1",
        senderEmailHmac: "h1",
        from: "a@acme.com",
      } as Email)
      .mockResolvedValueOnce({
        id: "e2",
        senderEmailHmac: "h2",
        from: "b@acme.com",
      } as Email);
    mineAndUpsertRule.mockRejectedValueOnce(new Error("boom"));

    await cron.sweep();

    // Both attempted despite the first throwing.
    expect(mineAndUpsertRule).toHaveBeenCalledTimes(2);
  });
});
