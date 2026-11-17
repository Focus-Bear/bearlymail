import { Repository } from "typeorm";

import type { CrmSenderMatch } from "../../../database/entities/crm-sender-match.entity";
import {
  BIGIN_RESPONSE_RECORDS_KEY,
  BIGIN_TOOLS,
} from "../bigin-sender-context.constants";

/** An MCP tools/call result whose text part is `payload` as JSON, as Zoho sends it. */
export const mcpJsonResult = (payload: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

export const biginList = (records: unknown[]) =>
  mcpJsonResult({
    [BIGIN_RESPONSE_RECORDS_KEY]: records,
    info: { count: records.length },
  });

/** Bigin answers a search miss with 204 No Content, i.e. an empty text part. */
export const BIGIN_EMPTY_RESULT = { content: [{ type: "text", text: "" }] };

export const BIGIN_ERROR_RESULT = {
  isError: true,
  content: [{ type: "text", text: "LIMIT_EXCEEDED" }],
};

export const ALL_BIGIN_TOOLS = Object.values(BIGIN_TOOLS).map((name) => ({
  name,
  description: "",
  inputSchema: {},
}));

export const CONTACT_RECORD = {
  id: "contact-1",
  First_Name: "Ada",
  Last_Name: "Lovelace",
  Email: "ada@acme.example",
  Title: "CTO",
  Account_Name: { id: "account-1", name: "Acme" },
  Owner: { id: "user-1", name: "Jeremy" },
  Modified_Time: "2026-11-01T10:00:00+11:00",
};

export const ACCOUNT_RECORD = {
  id: "account-1",
  Account_Name: "Acme",
  Website: "https://www.acme.example/about",
  Modified_Time: "2026-10-01T10:00:00+11:00",
};

export const OPEN_DEAL = {
  id: "deal-open",
  Deal_Name: "Acme pilot",
  Stage: "Proposal",
  Amount: 12000,
  Closing_Date: "2026-12-01",
  Sub_Pipeline: "Sales",
  Modified_Time: "2026-10-20T10:00:00+11:00",
};

export const CLOSED_DEAL = {
  id: "deal-closed",
  Deal_Name: "Acme 2025",
  Stage: "Closed Won",
  Amount: 5000,
  Modified_Time: "2026-11-05T10:00:00+11:00",
};

export const NOTE_RECORD = {
  id: "note-1",
  Note_Title: "Call",
  Note_Content: "Wants a quote before Christmas.",
  Created_Time: "2026-11-02T09:00:00+11:00",
};

/** Bigin's answer to a get-by-ID for a deleted or unknown record ID. */
export const BIGIN_RECORD_GONE_RESULT = {
  isError: true,
  content: [
    {
      type: "text",
      text: '{"code":"INVALID_DATA","details":{},"message":"the related id given seems to be invalid","status":"error"}',
    },
  ],
};

type MatchRow = Partial<CrmSenderMatch> & { id: string };
type MatchWhere = Pick<CrmSenderMatch, "userId" | "serverId" | "emailHash">;

const sameKey = (row: MatchRow, where: MatchWhere) =>
  row.userId === where.userId &&
  row.serverId === where.serverId &&
  row.emailHash === where.emailHash;

/**
 * A crm_sender_matches repository backed by an array, with the three methods
 * CrmSenderMatchStore uses, so tests exercise the real store logic.
 */
export function createInMemoryMatchRepo() {
  const rows: MatchRow[] = [];
  const repo = {
    rows,
    findOne: jest.fn(({ where }: { where: MatchWhere }) =>
      Promise.resolve(rows.find((row) => sameKey(row, where)) ?? null),
    ),
    upsert: jest.fn((entity: MatchWhere & Partial<CrmSenderMatch>) => {
      const existing = rows.find((row) => sameKey(row, entity));
      if (existing) Object.assign(existing, entity);
      else rows.push({ id: `match-${rows.length + 1}`, ...entity });
      return Promise.resolve();
    }),
    delete: jest.fn((where: MatchWhere) => {
      const index = rows.findIndex((row) => sameKey(row, where));
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    }),
  };
  return {
    repo,
    asRepository: repo as unknown as Repository<CrmSenderMatch>,
  };
}
