import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  MAX_OPEN_EVENTS_PER_MESSAGE,
  OPEN_DEDUPE_WINDOW_MS,
  OPEN_GRACE_WINDOW_MS,
  OPEN_SOURCE,
} from "../constants/email-tracking.constants";
import { EmailOpenEvent } from "../database/entities/email-open-event.entity";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import { EmailOpenRecorderService } from "./email-open-recorder.service";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const OPENED_AT = new Date("2026-10-13T10:00:00.000Z");
const DIRECT_UA = "Mozilla/5.0 (Windows NT 10.0) Outlook/16.0";

/**
 * Minimal stand-in for TypeORM's update query builder that records the
 * conditions and parameters and returns whatever rows the test configures.
 */
function createUpdateBuilder(returnedRows: () => unknown[]) {
  const recorded = {
    set: {} as Record<string, unknown>,
    where: [] as string[],
    params: {} as Record<string, unknown>,
  };
  const builder = {
    update: jest.fn(() => builder),
    set: jest.fn((values: Record<string, unknown>) => {
      recorded.set = values;
      return builder;
    }),
    where: jest.fn((clause: string, params: Record<string, unknown>) => {
      recorded.where.push(clause);
      Object.assign(recorded.params, params);
      return builder;
    }),
    andWhere: jest.fn((clause: string, params: Record<string, unknown>) => {
      recorded.where.push(clause);
      Object.assign(recorded.params, params);
      return builder;
    }),
    setParameter: jest.fn(() => builder),
    returning: jest.fn(() => builder),
    execute: jest.fn(async () => ({ raw: returnedRows() })),
  };
  return { builder, recorded };
}

describe("EmailOpenRecorderService", () => {
  let service: EmailOpenRecorderService;
  let returnedRows: unknown[];
  let update: ReturnType<typeof createUpdateBuilder>;
  const openEventRepository = {
    create: jest.fn((row: Partial<EmailOpenEvent>) => row),
    save: jest.fn(async (row: Partial<EmailOpenEvent>) => row),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    returnedRows = [{ id: "tracking-1", openCount: 1, automaticOpenCount: 0 }];
    update = createUpdateBuilder(() => returnedRows);

    const module = await Test.createTestingModule({
      providers: [
        EmailOpenRecorderService,
        {
          provide: getRepositoryToken(EmailTracking),
          useValue: { createQueryBuilder: jest.fn(() => update.builder) },
        },
        {
          provide: getRepositoryToken(EmailOpenEvent),
          useValue: openEventRepository,
        },
      ],
    }).compile();
    service = module.get(EmailOpenRecorderService);
  });

  const hit = (
    overrides: Partial<Parameters<typeof service.recordOpen>[0]> = {},
  ) => ({
    token: TOKEN,
    ipAddress: "203.0.113.9",
    userAgent: DIRECT_UA,
    openedAt: OPENED_AT,
    ...overrides,
  });

  it("counts a direct open and stores the event", async () => {
    await expect(service.recordOpen(hit())).resolves.toBe(true);

    expect(Object.keys(update.recorded.set)).toEqual(
      expect.arrayContaining(["openCount", "firstOpenedAt", "lastOpenedAt"]),
    );
    expect(update.recorded.params.token).toBe(TOKEN);
    expect(openEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingId: "tracking-1",
        openSource: OPEN_SOURCE.DIRECT,
        isLikelyAutomatic: false,
        ipAddress: "203.0.113.9",
        userAgent: DIRECT_UA,
      }),
    );
  });

  it("only counts hits after the post-send grace window and outside the dedupe window", async () => {
    await service.recordOpen(hit());

    expect(update.recorded.where).toEqual(
      expect.arrayContaining([
        `"sentAt" <= :graceCutoff`,
        `("lastOpenedAt" IS NULL OR "lastOpenedAt" <= :dedupeCutoff)`,
      ]),
    );
    expect(update.recorded.params.graceCutoff).toEqual(
      new Date(OPENED_AT.getTime() - OPEN_GRACE_WINDOW_MS),
    );
    expect(update.recorded.params.dedupeCutoff).toEqual(
      new Date(OPENED_AT.getTime() - OPEN_DEDUPE_WINDOW_MS),
    );
  });

  it("ignores grace-window, duplicate or unknown hits (no row updated) without storing anything", async () => {
    returnedRows = [];

    await expect(service.recordOpen(hit())).resolves.toBe(false);
    expect(openEventRepository.save).not.toHaveBeenCalled();
  });

  it("counts Apple Mail Privacy Protection separately as likely automatic", async () => {
    returnedRows = [{ id: "tracking-1", openCount: 0, automaticOpenCount: 1 }];

    await service.recordOpen(hit({ userAgent: "Mozilla/5.0" }));

    expect(Object.keys(update.recorded.set)).toEqual(
      expect.arrayContaining(["automaticOpenCount", "lastAutomaticOpenAt"]),
    );
    expect(update.recorded.set).not.toHaveProperty("openCount");
    expect(openEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        openSource: OPEN_SOURCE.APPLE_PRIVACY_PROXY,
        isLikelyAutomatic: true,
      }),
    );
  });

  it("keeps counting but stops storing events past the per-message cap", async () => {
    returnedRows = [
      {
        id: "tracking-1",
        openCount: MAX_OPEN_EVENTS_PER_MESSAGE + 1,
        automaticOpenCount: 0,
      },
    ];

    await expect(service.recordOpen(hit())).resolves.toBe(true);
    expect(openEventRepository.save).not.toHaveBeenCalled();
  });

  it("never touches the database for a malformed token", async () => {
    await expect(service.recordOpen(hit({ token: "nope" }))).resolves.toBe(
      false,
    );
    expect(update.builder.execute).not.toHaveBeenCalled();
  });

  it("swallows database errors so the pixel still loads", async () => {
    update.builder.execute.mockRejectedValueOnce(new Error("db down"));

    await expect(service.recordOpen(hit())).resolves.toBe(false);
  });
});
