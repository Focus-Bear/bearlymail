import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  EMAIL_TRACKING_STATUS,
  OPEN_SOURCE,
} from "../constants/email-tracking.constants";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import { EmailTrackingSummaryService } from "./email-tracking-summary.service";
import {
  buildTrackingPixelUrl,
  extractTrackingTokens,
  injectTrackingPixel,
} from "./tracking-pixel.helpers";

const USER_ID = "user-1";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const SENT_AT = new Date("2026-10-10T09:00:00.000Z");
const OPENED_AT = new Date("2026-10-10T11:00:00.000Z");
const withPixel = (html: string) =>
  injectTrackingPixel(html, buildTrackingPixelUrl("https://api.x.com", TOKEN));

const trackingRow = (overrides: Record<string, unknown> = {}) => ({
  id: "tracking-1",
  token: TOKEN,
  messageId: "provider-msg-1",
  threadId: "thread-1",
  sentAt: SENT_AT,
  recipientCount: 1,
  openCount: 2,
  firstOpenedAt: OPENED_AT,
  lastOpenedAt: OPENED_AT,
  automaticOpenCount: 0,
  lastAutomaticOpenAt: null,
  ...overrides,
});

describe("EmailTrackingSummaryService", () => {
  let service: EmailTrackingSummaryService;
  const query = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        EmailTrackingSummaryService,
        { provide: getRepositoryToken(EmailTracking), useValue: { query } },
      ],
    }).compile();
    service = module.get(EmailTrackingSummaryService);
  });

  describe("getStats", () => {
    it("derives open rate and median time-to-first-open from one aggregate query", async () => {
      query.mockResolvedValue([
        {
          sentCount: 12,
          trackedCount: 10,
          openedCount: 4,
          automaticOnlyCount: 3,
          medianMinutesToFirstOpen: "42.5",
        },
      ]);
      const since = new Date("2026-09-13T00:00:00.000Z");

      const stats = await service.getStats(USER_ID, since);

      expect(stats).toEqual({
        sentCount: 12,
        trackedCount: 10,
        openedCount: 4,
        automaticOnlyCount: 3,
        openRate: 0.4,
        medianMinutesToFirstOpen: 42.5,
      });
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("percentile_cont(0.5)");
      expect(params).toEqual([USER_ID, since, EMAIL_TRACKING_STATUS.TRACKED]);
    });

    it("reports no open rate when nothing was tracked", async () => {
      query.mockResolvedValue([
        {
          sentCount: 3,
          trackedCount: 0,
          openedCount: 0,
          automaticOnlyCount: 0,
          medianMinutesToFirstOpen: null,
        },
      ]);

      const stats = await service.getStats(USER_ID, new Date());

      expect(stats.openRate).toBeNull();
      expect(stats.medianMinutesToFirstOpen).toBeNull();
    });
  });

  describe("annotateThreadEmails", () => {
    it("credits the pixel to the earliest message only, strips every pixel, and lists recent opens", async () => {
      query
        .mockResolvedValueOnce([trackingRow({ messageId: null })])
        .mockResolvedValueOnce([
          {
            trackingId: "tracking-1",
            openedAt: OPENED_AT,
            openSource: OPEN_SOURCE.GMAIL_PROXY,
            isLikelyAutomatic: false,
          },
        ]);
      const sentByUser = {
        id: "sent",
        htmlBody: withPixel("<p>My question</p>"),
        receivedAt: SENT_AT,
      };
      // The recipient's reply quotes the original, pixel and all.
      const theirReply = {
        id: "reply",
        htmlBody: `<p>Answer</p><blockquote>${withPixel("<p>My question</p>")}</blockquote>`,
        receivedAt: OPENED_AT,
      };

      const annotated = await service.annotateThreadEmails(USER_ID, [
        theirReply,
        sentByUser,
      ]);

      const byId = new Map(annotated.map((email) => [email.id, email]));
      expect(byId.get("sent")?.openTracking).toMatchObject({
        openCount: 2,
        firstOpenedAt: OPENED_AT.toISOString(),
        recentOpens: [
          {
            openedAt: OPENED_AT.toISOString(),
            openSource: OPEN_SOURCE.GMAIL_PROXY,
            isLikelyAutomatic: false,
          },
        ],
      });
      expect(byId.get("reply")?.openTracking).toBeUndefined();
      for (const email of annotated) {
        expect(extractTrackingTokens(email.htmlBody)).toHaveLength(0);
      }
    });

    it("matches by provider message id when the synced body lost the pixel", async () => {
      query.mockResolvedValueOnce([trackingRow()]).mockResolvedValueOnce([]);

      const annotated = await service.annotateThreadEmails(USER_ID, [
        {
          id: "sent",
          messageId: "provider-msg-1",
          htmlBody: "<p>no pixel</p>",
          receivedAt: SENT_AT,
        },
      ]);

      expect(annotated[0].openTracking?.openCount).toBe(2);
    });

    it("skips the database entirely for threads with nothing to match", async () => {
      const annotated = await service.annotateThreadEmails(USER_ID, [
        { id: "a", htmlBody: "<p>hi</p>", receivedAt: SENT_AT },
      ]);

      expect(query).not.toHaveBeenCalled();
      expect(annotated[0].openTracking).toBeUndefined();
    });
  });

  describe("getLatestSummariesByThread", () => {
    it("fetches all visible threads in a single query keyed by thread id", async () => {
      query.mockResolvedValue([trackingRow()]);

      const summaries = await service.getLatestSummariesByThread(USER_ID, [
        "thread-1",
        "thread-2",
      ]);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('DISTINCT ON (t."threadId")');
      expect(summaries.get("thread-1")?.openCount).toBe(2);
      expect(summaries.has("thread-2")).toBe(false);
    });

    it("returns nothing without querying for an empty page", async () => {
      await expect(
        service.getLatestSummariesByThread(USER_ID, []),
      ).resolves.toEqual(new Map());
      expect(query).not.toHaveBeenCalled();
    });
  });
});
