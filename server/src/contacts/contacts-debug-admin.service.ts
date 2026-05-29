import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import { Repository } from "typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { Contact } from "../database/entities/contact.entity";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

/**
 * Soft cap on rows returned to the admin UI. The SQL fetch is also capped
 * (see `SQL_CANDIDATES_FETCH_CAP`) — we just don't ship more than this
 * many full row snapshots back to the browser.
 */
const SQL_CANDIDATES_RESPONSE_CAP = 50;

/**
 * The production `searchContacts()` call uses `.take(8)` (the client always
 * passes `limit=8`). We surface that number so the diagnostic can report
 * "your target was at position 47 / would not have survived take(8)".
 */
const PROD_SEARCH_TAKE_LIMIT = 8;

/**
 * Truncated hash length used by `SearchIndexHelper.hashToken`. Sourced from
 * `QUERY_LIMITS` so this stays in lockstep with the helper if the constant
 * ever moves — otherwise diagnostic hashes would silently stop matching
 * stored tokens.
 */
const TOKEN_HASH_HEX_LENGTH = QUERY_LIMITS.SEARCH_INDEX_TRIGRAM_PAD;

/** Max chars of the stored `searchTokens` JSON to ship back to the admin UI per row. */
const STORED_TOKENS_PREVIEW_CHARS = 200;

/** Pad width around the query for trigram generation (mirrors `SearchIndexHelper`). */
const TRIGRAM_LENGTH = 3;

/** Max prefix length generated per word (mirrors `SearchIndexHelper`). */
const MAX_PREFIX_LENGTH = 10;

/** Pages fetched from Google People API when surfacing the Gmail fallback for diagnostics. */
const GMAIL_SEARCH_PAGE_SIZE = 10;

/**
 * Max rows the bulk-rebuild action processes per HTTP request. Each row
 * decrypts via TypeORM transformers, regenerates the token set, and writes
 * the blind-index column — small per-row but linear in row count, so we
 * cap the request and let the admin re-run if `remaining > 0`.
 */
const REBUILD_BATCH_SIZE = 500;

/**
 * `{ input, hash }` so the admin UI can see *why* each token exists
 * (full query, word, prefix, trigram).
 */
export interface AnnotatedToken {
  input: string;
  source:
    | "full-query"
    | "word"
    | "word-prefix"
    | "trigram"
    | "exact-email-hash";
  hash: string;
}

export interface SqlCandidateRow {
  id: string;
  provider: string;
  providerId: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  contactFrequency: number;
  isFavorite: boolean;
  storedTokensLength: number;
  storedTokensPreview: string;
  matchedQueryTokens: AnnotatedToken[];
  passesPostFilter: boolean;
  postFilterReason: string;
  /** Zero-based position in the SQL ORDER BY ordering (frequency DESC). */
  positionInSqlOrder: number;
  wouldSurviveTake8: boolean;
}

export interface TargetContactDiagnostic {
  found: boolean;
  lookedUpEmailHash: string;
  id?: string;
  provider?: string;
  providerId?: string;
  email?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  contactFrequency?: number;
  storedTokensRaw?: string | null;
  storedTokensParsedCount?: number | null;
  storedTokensParseError?: string | null;
  queryTokensInStored?: Array<AnnotatedToken & { presentInStored: boolean }>;
  wouldMatchSql?: boolean;
  passesPostFilter?: boolean;
  postFilterReason?: string;
  /** Zero-based position inside the (capped) SQL candidate ordering; -1 if not present in the scanned set. */
  positionInSqlOrder?: number;
  wouldSurviveTake8?: boolean;
  /**
   * True when the target's `searchTokens` matches the OR clause but its row was
   * not in the scanned set — i.e. the target is ranked beyond
   * `QUERY_LIMITS.CONTACTS_DEBUG_SCAN_CAP` by frequency.
   */
  rankedBeyondScanCap?: boolean;
}

/**
 * Per-account health summary of the blind-index column. A high `nullSearchTokens`
 * count is the single most common cause of "contact is in DB but search misses
 * it" — `LIKE` on `NULL` never matches, so those rows are invisible to fuzzy
 * search regardless of what the user types.
 */
export interface AccountStats {
  totalContacts: number;
  nullSearchTokens: number;
  emptySearchTokens: number;
  populatedSearchTokens: number;
}

export interface ContactSearchDebugResult {
  query: string;
  userId: string;
  queryTokens: AnnotatedToken[];
  exactMatchEmailHash: string;
  exactMatch: { id: string; email: string } | null;
  /** Total rows whose `searchTokens` matched the OR clause (un-capped count). */
  sqlMatchingTotalCount: number;
  /** Hard cap applied to the diagnostic's `.getMany()` to bound decrypt cost. */
  sqlScanCap: number;
  /** Number of rows actually fetched and decrypted (≤ `sqlScanCap`). */
  sqlCandidatesScannedCount: number;
  /** True when `sqlMatchingTotalCount > sqlScanCap` — extra rows existed but were not inspected. */
  sqlScanCapHit: boolean;
  sqlCandidates: SqlCandidateRow[];
  prodSearchTakeLimit: number;
  gmailConnected: boolean;
  gmailResults: Array<{ providerId: string; email: string; name?: string }>;
  gmailError: string | null;
  targetContact: TargetContactDiagnostic | null;
  accountStats: AccountStats;
}

export interface RebuildSearchTokensResult {
  /** How many rows the rebuild scanned (loaded + decrypted). */
  scanned: number;
  /** How many rows had their `searchTokens` rewritten. */
  updated: number;
  /** How many rows still need a rebuild after this pass (mode=missing only). */
  remaining: number;
  /** Per-row failures encountered during rebuild (decrypt errors, etc.). */
  errors: Array<{ contactId: string; error: string }>;
}

@Injectable()
export class ContactsDebugAdminService {
  private readonly logger = new Logger(ContactsDebugAdminService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    private gmailContactsProvider: GmailContactsProvider,
  ) {}

  async diagnoseSearch(
    userId: string,
    query: string,
    targetEmail?: string,
  ): Promise<ContactSearchDebugResult> {
    const queryTokens = buildAnnotatedQueryTokens(query);
    const tokenHashes = queryTokens.map((token) => token.hash);

    const exactMatchEmailHash = SearchIndexHelper.hashExact(query);
    const exactMatchRow = await this.contactRepository.findOne({
      where: { userId, emailHash: exactMatchEmailHash },
    });

    // Run the SAME query the prod search runs, capped at
    // QUERY_LIMITS.CONTACTS_DEBUG_SCAN_CAP so we don't pull and decrypt
    // thousands of rows for broad queries on large contact lists. The
    // accurate total is surfaced via a parallel `.getCount()` so we can
    // flag when extra matching rows existed beyond the cap.
    const buildCandidateQuery = () =>
      this.contactRepository
        .createQueryBuilder("contact")
        .where("contact.userId = :userId", { userId })
        .andWhere(
          `(${tokenHashes
            .map((_, i) => `contact.searchTokens LIKE :token${i}`)
            .join(" OR ")})`,
          tokenHashes.reduce(
            (acc, token, i) => {
              acc[`token${i}`] = `%${token}%`;
              return acc;
            },
            {} as Record<string, string>,
          ),
        )
        .orderBy("contact.contactFrequency", "DESC")
        .addOrderBy("contact.isFavorite", "DESC");

    const [sqlCandidates, sqlMatchingTotalCount] = tokenHashes.length
      ? await Promise.all([
          buildCandidateQuery()
            .take(QUERY_LIMITS.CONTACTS_DEBUG_SCAN_CAP)
            .getMany(),
          buildCandidateQuery().getCount(),
        ])
      : [[] as Contact[], 0];

    const sqlScanCapHit =
      sqlMatchingTotalCount > QUERY_LIMITS.CONTACTS_DEBUG_SCAN_CAP;

    const annotated: SqlCandidateRow[] = sqlCandidates.map((row, index) =>
      annotateRow(row, index, queryTokens, query),
    );

    const gmailConnected = await this.gmailContactsProvider.isConnected(userId);
    let gmailResults: Array<{
      providerId: string;
      email: string;
      name?: string;
    }> = [];
    let gmailError: string | null = null;
    try {
      const raw = await this.gmailContactsProvider.searchContacts(
        userId,
        query,
        GMAIL_SEARCH_PAGE_SIZE,
      );
      gmailResults = raw.map((rawContact) => ({
        providerId: rawContact.providerId,
        email: rawContact.email,
        name: rawContact.name,
      }));
    } catch (error) {
      gmailError = error instanceof Error ? error.message : String(error);
    }

    let targetContact: TargetContactDiagnostic | null = null;
    if (targetEmail) {
      targetContact = await this.diagnoseTargetContact(targetEmail, {
        userId,
        query,
        queryTokens,
        sqlCandidates: annotated,
        sqlScanCapHit,
      });
    }

    const accountStats = await this.collectAccountStats(userId);

    return {
      query,
      userId,
      queryTokens,
      exactMatchEmailHash,
      exactMatch: exactMatchRow
        ? { id: exactMatchRow.id, email: exactMatchRow.email }
        : null,
      sqlMatchingTotalCount,
      sqlScanCap: QUERY_LIMITS.CONTACTS_DEBUG_SCAN_CAP,
      sqlCandidatesScannedCount: annotated.length,
      sqlScanCapHit,
      sqlCandidates: annotated.slice(0, SQL_CANDIDATES_RESPONSE_CAP),
      prodSearchTakeLimit: PROD_SEARCH_TAKE_LIMIT,
      gmailConnected,
      gmailResults,
      gmailError,
      targetContact,
      accountStats,
    };
  }

  /**
   * Counts NULL / empty / populated `searchTokens` for the user via a single
   * indexed aggregate query. Run unconditionally so the diagnostic surfaces
   * blind-index health alongside the per-query info — Donyl's hypothesis was
   * that most rows have NULL tokens, which `LIKE` cannot match.
   */
  private async collectAccountStats(userId: string): Promise<AccountStats> {
    const rows = await this.contactRepository.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "searchTokens" IS NULL)::int AS null_tokens,
         COUNT(*) FILTER (WHERE "searchTokens" IS NOT NULL
                             AND ("searchTokens" = '' OR "searchTokens" = '[]'))::int AS empty_tokens
       FROM contacts
       WHERE "userId" = $1`,
      [userId],
    );
    const row = rows[0] ?? { total: 0, null_tokens: 0, empty_tokens: 0 };
    const totalContacts = Number(row.total) || 0;
    const nullSearchTokens = Number(row.null_tokens) || 0;
    const emptySearchTokens = Number(row.empty_tokens) || 0;
    return {
      totalContacts,
      nullSearchTokens,
      emptySearchTokens,
      populatedSearchTokens:
        totalContacts - nullSearchTokens - emptySearchTokens,
    };
  }

  /**
   * Regenerates `searchTokens` for the user's contacts that currently have
   * NULL/empty values (or a specific contact, when `contactId` is supplied).
   * The rebuild loads each row through TypeORM so the encrypted name/email
   * columns are decrypted under the request's per-user KMS key, then runs
   * `SearchIndexHelper.generateSearchTokens` and writes the result back.
   *
   * Synchronous + capped per request. Admin can re-run to chew through
   * `remaining` on very large accounts.
   */
  async rebuildSearchTokens(
    userId: string,
    options: { contactId?: string },
  ): Promise<RebuildSearchTokensResult> {
    const errors: Array<{ contactId: string; error: string }> = [];
    let updated = 0;

    if (options.contactId) {
      const row = await this.contactRepository.findOne({
        where: { id: options.contactId, userId },
      });
      if (!row) {
        return { scanned: 0, updated: 0, remaining: 0, errors: [] };
      }
      try {
        await this.regenerateRow(row);
        updated = 1;
      } catch (error) {
        errors.push({
          contactId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { scanned: 1, updated, remaining: 0, errors };
    }

    const targets = await this.contactRepository
      .createQueryBuilder("contact")
      .where("contact.userId = :userId", { userId })
      .andWhere(
        `(contact.searchTokens IS NULL OR contact.searchTokens = '' OR contact.searchTokens = '[]')`,
      )
      .limit(REBUILD_BATCH_SIZE)
      .getMany();

    for (const row of targets) {
      try {
        await this.regenerateRow(row);
        updated += 1;
      } catch (error) {
        errors.push({
          contactId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Cheap follow-up count so the UI can show how many passes are still needed.
    const remainingRows = await this.contactRepository
      .createQueryBuilder("contact")
      .where("contact.userId = :userId", { userId })
      .andWhere(
        `(contact.searchTokens IS NULL OR contact.searchTokens = '' OR contact.searchTokens = '[]')`,
      )
      .getCount();

    return {
      scanned: targets.length,
      updated,
      remaining: remainingRows,
      errors,
    };
  }

  /**
   * Regenerates `searchTokens` for a single Contact row using whatever
   * decrypted name/firstName/lastName/company/email fields are available.
   * Skips encrypted-column transformers by writing only the blind-index
   * column directly (avoids re-encrypting unchanged PII).
   */
  private async regenerateRow(row: Contact): Promise<void> {
    const emailLocalPart = SearchIndexHelper.extractEmailLocalPart(row.email);
    const emailDomain = SearchIndexHelper.extractEmailDomain(row.email);
    const tokens = SearchIndexHelper.generateSearchTokens(
      row.name,
      row.firstName,
      row.lastName,
      row.company,
      emailLocalPart,
      emailDomain,
    );
    await this.contactRepository.update(
      { id: row.id },
      { searchTokens: JSON.stringify(tokens) },
    );
  }

  private async diagnoseTargetContact(
    targetEmail: string,
    ctx: {
      userId: string;
      query: string;
      queryTokens: AnnotatedToken[];
      sqlCandidates: SqlCandidateRow[];
      sqlScanCapHit: boolean;
    },
  ): Promise<TargetContactDiagnostic> {
    const lookedUpEmailHash = SearchIndexHelper.hashExact(targetEmail);
    const row = await this.contactRepository.findOne({
      where: { userId: ctx.userId, emailHash: lookedUpEmailHash },
    });

    if (!row) {
      return { found: false, lookedUpEmailHash };
    }

    const stored = row.searchTokens ?? null;
    let storedTokensParsedCount: number | null = null;
    let storedTokensParseError: string | null = null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        storedTokensParsedCount = Array.isArray(parsed) ? parsed.length : null;
      } catch (err) {
        storedTokensParseError =
          err instanceof Error ? err.message : String(err);
      }
    }

    const queryTokensInStored = ctx.queryTokens.map((token) => ({
      ...token,
      presentInStored: stored ? stored.includes(token.hash) : false,
    }));
    const wouldMatchSql = queryTokensInStored.some(
      (token) => token.presentInStored,
    );
    const postFilter = evaluatePostFilter(row, ctx.query);
    const positionInSqlOrder = ctx.sqlCandidates.findIndex(
      (candidate) => candidate.id === row.id,
    );

    return {
      found: true,
      lookedUpEmailHash,
      id: row.id,
      provider: row.provider,
      providerId: row.providerId,
      email: row.email,
      name: row.name ?? null,
      firstName: row.firstName ?? null,
      lastName: row.lastName ?? null,
      contactFrequency: row.contactFrequency,
      storedTokensRaw: stored,
      storedTokensParsedCount,
      storedTokensParseError,
      queryTokensInStored,
      wouldMatchSql,
      passesPostFilter: postFilter.passes,
      postFilterReason: postFilter.reason,
      positionInSqlOrder,
      wouldSurviveTake8:
        positionInSqlOrder >= 0 && positionInSqlOrder < PROD_SEARCH_TAKE_LIMIT,
      // Distinguishes "ranked beyond the diagnostic's scan cap" from "didn't
      // match the OR clause at all" — both surface as positionInSqlOrder=-1.
      rankedBeyondScanCap:
        wouldMatchSql && positionInSqlOrder === -1 && ctx.sqlScanCapHit,
    };
  }
}

/**
 * Mirrors the private `SearchIndexHelper.generateQueryTokens` logic but
 * preserves the *origin* of each hash so the UI can show "this hash is the
 * 'kyr' trigram" instead of just an opaque 16-char hex.
 */
function buildAnnotatedQueryTokens(query: string): AnnotatedToken[] {
  if (!query) return [];

  const tokens: AnnotatedToken[] = [];
  const normalized = query.toLowerCase().trim();
  const seen = new Set<string>();
  const push = (input: string, source: AnnotatedToken["source"]) => {
    const hash = hashToken(input);
    if (seen.has(hash)) return;
    seen.add(hash);
    tokens.push({ input, source, hash });
  };

  push(normalized, "full-query");

  const words = normalized.split(/\s+/).filter((word) => word.length > 0);
  for (const word of words) {
    push(word, "word");
    for (let i = 2; i <= Math.min(word.length, MAX_PREFIX_LENGTH); i++) {
      push(word.substring(0, i), "word-prefix");
    }
  }

  const padded = `  ${normalized}  `;
  for (let i = 0; i < padded.length - (TRIGRAM_LENGTH - 1); i++) {
    const trigram = padded.substring(i, i + TRIGRAM_LENGTH);
    if (trigram.trim().length > 0) {
      push(trigram, "trigram");
    }
  }

  return tokens;
}

/**
 * Same scheme as the private `SearchIndexHelper.hashToken` — sha256, first
 * 16 hex chars. Replicated here rather than widening the helper's API.
 */
function hashToken(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("hex")
    .substring(0, TOKEN_HASH_HEX_LENGTH);
}

function annotateRow(
  contact: Contact,
  positionInSqlOrder: number,
  queryTokens: AnnotatedToken[],
  query: string,
): SqlCandidateRow {
  const stored = contact.searchTokens ?? "";
  const matchedQueryTokens = queryTokens.filter((token) =>
    stored.includes(token.hash),
  );
  const postFilter = evaluatePostFilter(contact, query);

  return {
    id: contact.id,
    provider: contact.provider,
    providerId: contact.providerId,
    email: contact.email,
    name: contact.name ?? null,
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    contactFrequency: contact.contactFrequency,
    isFavorite: contact.isFavorite,
    storedTokensLength: stored.length,
    storedTokensPreview:
      stored.length > STORED_TOKENS_PREVIEW_CHARS
        ? `${stored.slice(0, STORED_TOKENS_PREVIEW_CHARS)}…`
        : stored,
    matchedQueryTokens,
    passesPostFilter: postFilter.passes,
    postFilterReason: postFilter.reason,
    positionInSqlOrder,
    wouldSurviveTake8: positionInSqlOrder < PROD_SEARCH_TAKE_LIMIT,
  };
}

/**
 * Replicates `ContactsService.contactMatchesQuery` and returns *why* it
 * passed/failed so the diagnostic can be self-explanatory.
 */
function evaluatePostFilter(
  contact: Pick<Contact, "email" | "name" | "firstName" | "lastName">,
  query: string,
): { passes: boolean; reason: string } {
  const normalizedQuery = query.toLowerCase().trim();
  const fields: Array<[string, string | null | undefined]> = [
    ["name", contact.name],
    ["firstName", contact.firstName],
    ["lastName", contact.lastName],
    ["email", contact.email],
  ];

  for (const [fieldName, value] of fields) {
    if (value && value.toLowerCase().includes(normalizedQuery)) {
      return {
        passes: true,
        reason: `${fieldName} contains "${normalizedQuery}"`,
      };
    }
  }

  return {
    passes: false,
    reason: `none of name/firstName/lastName/email contains "${normalizedQuery}"`,
  };
}
