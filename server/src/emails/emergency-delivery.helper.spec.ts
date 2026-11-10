import { FindOperator, Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { applyEmergencyDelivery } from "./emergency-delivery.helper";

const THREAD_ID = "thread-1";
const USER_ID = "user-1";
const MORE_THAN_OPERATOR = "moreThan";

function makeRepository(): jest.Mocked<
  Pick<Repository<EmailThread>, "update">
> {
  return { update: jest.fn().mockResolvedValue({ affected: 1 }) };
}

function apply(
  repository: jest.Mocked<Pick<Repository<EmailThread>, "update">>,
  isBatched: boolean,
): Promise<void> {
  return applyEmergencyDelivery(
    repository as unknown as Repository<EmailThread>,
    {
      emailThreadId: THREAD_ID,
      userId: USER_ID,
      finalScore: PRIORITY_SCORES.HIGH_THRESHOLD,
      isBatched,
    },
  );
}

describe("applyEmergencyDelivery", () => {
  it("does not call a high-priority email from the first import 'delivered early'", async () => {
    // Initial sync skips batching (isBatched=false, "Initial sync"), so the
    // thread was already in the inbox when the LLM later scored it high. It
    // used to fall through to the emergency update because only starred
    // threads were exempt, flagging week-old imported mail as delivered early.
    const repository = makeRepository();

    await apply(repository, false);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("delivers a thread held in a batch early and flags it", async () => {
    const repository = makeRepository();

    await apply(repository, true);

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: THREAD_ID, userId: USER_ID }),
      expect.objectContaining({ isBatched: false, wasDeliveredEarly: true }),
    );
  });

  it("only flags a thread whose batch window has not already passed", async () => {
    // Batched threads stay isBatched=true after their release time (release is
    // evaluated lazily), so a re-score of an old, already-released thread must
    // not count as early delivery either.
    const repository = makeRepository();
    const before = Date.now();

    await apply(repository, true);

    const [where] = repository.update.mock.calls[0];
    const { isBatched, batchReleaseAt } = where as {
      isBatched: boolean;
      batchReleaseAt: FindOperator<Date>;
    };
    expect(isBatched).toBe(true);
    expect(batchReleaseAt).toBeInstanceOf(FindOperator);
    expect(batchReleaseAt.type).toBe(MORE_THAN_OPERATOR);
    expect((batchReleaseAt.value as Date).getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });
});
