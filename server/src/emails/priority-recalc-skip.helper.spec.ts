import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  shouldSkipPriorityRecalculation,
  threadHasNewEmails,
} from "./priority-recalc-skip.helper";

const silentLogger = { log: jest.fn() } as unknown as Logger;

function makeEmailRepo(mostRecent: Partial<Email> | null): Repository<Email> {
  return {
    findOne: jest.fn().mockResolvedValue(mostRecent),
  } as unknown as Repository<Email>;
}

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: "email-new",
    emailThreadId: "thread-1",
    receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    ...overrides,
  } as Email;
}

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: "thread-1",
    createdAt: new Date("2026-02-10T00:00:00.000Z"),
    updatedAt: new Date("2026-02-10T00:00:00.000Z"),
    priorityExplanation: null,
    isProcessingPriority: false,
    categorySource: null,
    categoryId: null,
    ...overrides,
  } as EmailThread;
}

const validBreakdown = {
  breakdown: [{ factor: "Urgency", value: 20, description: "urgent" }],
  calculatedAt: undefined as string | undefined,
};

describe("threadHasNewEmails", () => {
  it("detects a new email even when updatedAt was just bumped by an unrelated write", async () => {
    // The bug: sync bumps updatedAt to 'now' (newer than the new email), and the
    // thread has NO recorded calculatedAt. The old code fell back to updatedAt
    // and concluded "no new email" → skipped categorisation forever.
    const email = makeEmail({
      receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    });
    const thread = makeThread({
      createdAt: new Date("2026-02-10T00:00:00.000Z"),
      // updatedAt bumped AFTER the email arrived (unrelated sync write)
      updatedAt: new Date("2026-07-08T07:11:16.530Z"),
    });
    const repo = makeEmailRepo({
      id: "email-new",
      receivedAt: email.receivedAt,
    });

    const result = await threadHasNewEmails(repo, thread, email, {});

    expect(result).toBe(true);
  });

  it("skips when the recorded calculatedAt is newer than the email (genuine dedup)", async () => {
    const email = makeEmail({
      receivedAt: new Date("2026-07-08T07:00:00.000Z"),
    });
    const thread = makeThread();
    const repo = makeEmailRepo({
      id: "email-new",
      receivedAt: email.receivedAt,
    });

    const result = await threadHasNewEmails(repo, thread, email, {
      // priority calculated AFTER the email arrived → genuine dedup
      calculatedAt: "2026-07-08T07:05:00.000Z",
    });

    expect(result).toBe(false);
  });
});

describe("shouldSkipPriorityRecalculation", () => {
  const base = {
    logger: silentLogger,
    forceRecalculate: false,
    workerId: "w1",
    emailId: "email-new",
  };

  it("skips a thread with a valid, current breakdown and no new mail", async () => {
    const email = makeEmail({
      receivedAt: new Date("2026-02-09T00:00:00.000Z"),
    });
    const thread = makeThread({
      categorySource: "priority",
      categoryId: "cat-1",
      priorityExplanation: {
        ...validBreakdown,
        calculatedAt: "2026-02-10T00:00:00.000Z",
      },
    });
    const repo = makeEmailRepo({
      id: "email-old",
      receivedAt: email.receivedAt,
    });

    const skip = await shouldSkipPriorityRecalculation({
      ...base,
      emailRepository: repo,
      thread,
      email,
    });

    expect(skip).toBe(true);
  });

  it("never skips a thread with categorySource set but no categoryId (broken/Other)", async () => {
    const email = makeEmail({
      receivedAt: new Date("2026-02-09T00:00:00.000Z"),
    });
    const thread = makeThread({
      categorySource: "priority",
      // contradictory: "set by priority" yet no category stored
      categoryId: null,
      priorityExplanation: {
        ...validBreakdown,
        calculatedAt: "2026-02-10T00:00:00.000Z",
      },
    });
    const repo = makeEmailRepo({
      id: "email-old",
      receivedAt: email.receivedAt,
    });

    const skip = await shouldSkipPriorityRecalculation({
      ...base,
      emailRepository: repo,
      thread,
      email,
    });

    expect(skip).toBe(false);
  });

  it("skips a thread the user deliberately moved to Other (categorySource 'user', categoryId null)", async () => {
    const email = makeEmail({
      receivedAt: new Date("2026-02-09T00:00:00.000Z"),
    });
    const thread = makeThread({
      categorySource: "user",
      categoryId: null,
      priorityExplanation: {
        ...validBreakdown,
        calculatedAt: "2026-02-10T00:00:00.000Z",
      },
    });
    const repo = makeEmailRepo({
      id: "email-old",
      receivedAt: email.receivedAt,
    });

    const skip = await shouldSkipPriorityRecalculation({
      ...base,
      emailRepository: repo,
      thread,
      email,
    });

    expect(skip).toBe(true);
  });
});
