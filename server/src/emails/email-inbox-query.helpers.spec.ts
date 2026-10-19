import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import {
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
} from "./email-inbox.types";
import {
  INBOX_PREVIEW_BODY_COLUMNS_SQL,
  runInboxQuery,
} from "./email-inbox-query.helpers";

/**
 * These tests lock in the performance fix where per-category inbox fetches narrow
 * threads by categoryId in SQL instead of fetching + decrypting the whole inbox
 * and filtering afterwards. They assert the generated SQL / bound params rather
 * than hitting a database.
 */
describe("runInboxQuery — SQL category narrowing", () => {
  function makeRepo(): { repo: Repository<Email>; query: jest.Mock } {
    const query = jest.fn().mockResolvedValue([]);
    const repo = { query } as unknown as Repository<Email>;
    return { repo, query };
  }

  const USER = "user-1";
  const UUID_A = "11111111-1111-1111-1111-111111111111";
  const UUID_B = "22222222-2222-2222-2222-222222222222";

  it("adds a categoryId IN filter and binds the UUIDs when only real categories are requested", async () => {
    const { repo, query } = makeRepo();

    await runInboxQuery(repo, USER, "triage", { categoryIds: [UUID_A] });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('thread."categoryId" IN');
    // userId is $1; the single category UUID is bound as the next param.
    expect(params).toEqual([USER, UUID_A]);
  });

  it("binds multiple UUIDs with one placeholder each", async () => {
    const { repo, query } = makeRepo();

    await runInboxQuery(repo, USER, "triage", {
      categoryIds: [UUID_A, UUID_B],
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('thread."categoryId" IN ($2, $3)');
    expect(params).toEqual([USER, UUID_A, UUID_B]);
  });

  it("does NOT narrow in SQL for the uncategorized / Other bucket (post-query filter owns it)", async () => {
    for (const key of [
      INBOX_UNCATEGORIZED_CATEGORY_KEY,
      INBOX_OTHER_CATEGORY_NAME,
    ]) {
      const { repo, query } = makeRepo();
      await runInboxQuery(repo, USER, "triage", { categoryIds: [key] });
      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toContain('thread."categoryId" IN');
      expect(params).toEqual([USER]);
    }
  });

  it("does NOT narrow when the request mixes a real UUID with the Other bucket", async () => {
    const { repo, query } = makeRepo();

    await runInboxQuery(repo, USER, "triage", {
      categoryIds: [UUID_A, INBOX_UNCATEGORIZED_CATEGORY_KEY],
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain('thread."categoryId" IN');
    expect(params).toEqual([USER]);
  });

  it("does not add a categoryId filter when no categoryIds are provided", async () => {
    const { repo, query } = makeRepo();

    await runInboxQuery(repo, USER, "triage");

    const [sql, params] = query.mock.calls[0];
    expect(sql).not.toContain('thread."categoryId" IN');
    expect(params).toEqual([USER]);
  });

  it("keeps placeholder numbering correct when category narrowing follows other filters", async () => {
    const { repo, query } = makeRepo();

    await runInboxQuery(repo, USER, "triage", {
      minPriority: 50,
      categoryIds: [UUID_A],
    });

    const [sql, params] = query.mock.calls[0];
    // minPriority binds $2, so the category UUID must bind $3.
    expect(sql).toContain('COALESCE(thread."priorityScore", 0) >= $2');
    expect(sql).toContain('thread."categoryId" IN ($3)');
    expect(params).toEqual([USER, 50, UUID_A]);
  });
});

/**
 * body / htmlBody are the widest columns by far; the list response never
 * includes them, so they must only leave Postgres for rows that need the
 * deterministic preview fallback (no stored summary and none in flight).
 */
describe("runInboxQuery — body columns only for the preview fallback", () => {
  async function inboxSql(): Promise<string> {
    const query = jest.fn().mockResolvedValue([]);
    const repo = { query } as unknown as Repository<Email>;
    await runInboxQuery(repo, "user-1", "triage", {
      categoryIds: ["11111111-1111-1111-1111-111111111111"],
    });
    return query.mock.calls[0][0] as string;
  }

  it("projects body and htmlBody through the preview-needed CASE", async () => {
    const sql = await inboxSql();

    expect(sql).toContain(INBOX_PREVIEW_BODY_COLUMNS_SQL);
    expect(INBOX_PREVIEW_BODY_COLUMNS_SQL).toMatch(
      /CASE WHEN \(em\.summary IS NULL OR em\.summary = ''\) AND em\."isProcessingSummary" IS NOT TRUE THEN em\.body END AS body/,
    );
    expect(INBOX_PREVIEW_BODY_COLUMNS_SQL).toMatch(
      /THEN em\."htmlBody" END AS "htmlBody"/,
    );
  });

  it("never selects the raw email body columns unconditionally", async () => {
    const sql = await inboxSql();

    // The outer SELECT's e.body / e."htmlBody" read the lateral's CASE output;
    // the lateral itself must not project the raw columns.
    expect(sql).not.toMatch(/em\.body,\s*em\."htmlBody"/);
  });
});
