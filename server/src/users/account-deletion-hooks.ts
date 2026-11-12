import type { Logger } from "@nestjs/common";

import { getErrorMessage } from "../types/common";

/** What the steps run before an account deletion report back to the user. */
export interface AccountDeletionReport {
  /** Snoozed threads that could not be put back in the user's inbox. */
  stillSnoozedThreads: number;
}

/**
 * A step that runs before an account's data is deleted, while its mailbox
 * tokens still exist. It must not throw: a failure is logged and the deletion
 * goes ahead, because a user asking to be deleted must never be blocked.
 */
export type BeforeAccountDeletionHook = (
  userId: string,
) => Promise<Partial<AccountDeletionReport>>;

/**
 * Lets modules that depend on UsersModule (and so can't be imported by it),
 * such as SnoozeModule, run a step before UsersService deletes an account.
 */
export class BeforeAccountDeletionHooks {
  private readonly hooks: BeforeAccountDeletionHook[] = [];

  constructor(private readonly logger: Logger) {}

  register(hook: BeforeAccountDeletionHook): void {
    this.hooks.push(hook);
  }

  async run(userId: string): Promise<AccountDeletionReport> {
    const report: AccountDeletionReport = { stillSnoozedThreads: 0 };
    for (const hook of this.hooks) {
      try {
        const result = await hook(userId);
        report.stillSnoozedThreads += result.stillSnoozedThreads ?? 0;
      } catch (error) {
        this.logger.warn(
          `[UsersService.deleteAccount] A pre-deletion step failed for user ${userId}: ${getErrorMessage(error)}`,
        );
      }
    }
    return report;
  }
}
