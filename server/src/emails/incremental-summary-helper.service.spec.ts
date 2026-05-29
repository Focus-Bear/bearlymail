import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import { EmailsService } from "./emails.service";
import { IncrementalSummaryHelperService } from "./incremental-summary-helper.service";

describe("IncrementalSummaryHelperService", () => {
  let service: IncrementalSummaryHelperService;
  let emailRepository: jest.Mocked<Pick<Repository<Email>, "findOne">>;
  let emailThreadRepository: jest.Mocked<
    Pick<Repository<EmailThread>, "findOne">
  >;
  let emailsService: jest.Mocked<Pick<EmailsService, "getThreadEmails">>;
  let incrementalAnalysisService: jest.Mocked<
    Pick<IncrementalAnalysisService, "updateSummaryIncrementally">
  >;

  beforeEach(() => {
    emailRepository = { findOne: jest.fn() } as never;
    emailThreadRepository = { findOne: jest.fn() } as never;
    emailsService = { getThreadEmails: jest.fn() } as never;
    incrementalAnalysisService = {
      updateSummaryIncrementally: jest.fn(),
    } as never;

    service = new IncrementalSummaryHelperService(
      emailRepository as never,
      emailThreadRepository as never,
      {} as never,
      emailsService as never,
      incrementalAnalysisService as never,
    );
  });

  describe("computeIncrementalSummary", () => {
    const lastSummarizedAt = new Date("2026-01-10T00:00:00Z");
    const newEmail = {
      id: "new-email",
      threadId: "provider-thread-1",
      emailThreadId: "thread-row-1",
      from: "sender@example.com",
      subject: "Re: Topic",
      body: "newest reply",
      receivedAt: new Date("2026-01-11T00:00:00Z"),
    } as Email;

    beforeEach(() => {
      emailRepository.findOne.mockResolvedValue({
        summary: "existing summary",
      } as Email);
      emailThreadRepository.findOne.mockResolvedValue({
        id: "thread-row-1",
        lastSummarizedAt,
      } as EmailThread);
      incrementalAnalysisService.updateSummaryIncrementally.mockResolvedValue({
        updatedSummary: "updated summary",
        significantChange: true,
      });
    });

    it("fetches newest-first and still finds the new email on threads longer than the fetch limit", async () => {
      // 50 older messages (all before lastSummarizedAt) returned newest-first,
      // followed by the one genuinely new email. An ASC+limit window would have
      // returned only the oldest 50 and missed the new arrival entirely.
      const olderEmails = Array.from(
        { length: 50 },
        (_, index) =>
          ({
            id: `old-${index}`,
            from: "sender@example.com",
            subject: "Re: Topic",
            body: `old body ${index}`,
            receivedAt: new Date("2026-01-09T00:00:00Z"),
          }) as Email,
      );
      emailsService.getThreadEmails.mockResolvedValue([
        newEmail,
        ...olderEmails,
      ]);

      const result = await service.computeIncrementalSummary(
        "user-1",
        newEmail,
      );

      expect(emailsService.getThreadEmails).toHaveBeenCalledWith(
        "user-1",
        "provider-thread-1",
        { order: "DESC", limit: 50 },
      );
      expect(
        incrementalAnalysisService.updateSummaryIncrementally,
      ).toHaveBeenCalledTimes(1);
      expect(
        incrementalAnalysisService.updateSummaryIncrementally,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          existingSummary: "existing summary",
          newEmail: expect.objectContaining({ body: "newest reply" }),
        }),
      );
      expect(result).toBe("updated summary");
    });

    it("returns the existing summary unchanged when no emails are newer than lastSummarizedAt", async () => {
      emailsService.getThreadEmails.mockResolvedValue([
        {
          id: "old-1",
          from: "sender@example.com",
          subject: "Re: Topic",
          body: "old",
          receivedAt: new Date("2026-01-01T00:00:00Z"),
        } as Email,
      ]);

      const result = await service.computeIncrementalSummary(
        "user-1",
        newEmail,
      );

      expect(
        incrementalAnalysisService.updateSummaryIncrementally,
      ).not.toHaveBeenCalled();
      expect(result).toBe("existing summary");
    });

    it("returns null when the thread has no existing summary (caller falls back to full summarisation)", async () => {
      emailRepository.findOne.mockResolvedValue(null);

      const result = await service.computeIncrementalSummary(
        "user-1",
        newEmail,
      );

      expect(result).toBeNull();
      expect(emailsService.getThreadEmails).not.toHaveBeenCalled();
    });
  });
});
