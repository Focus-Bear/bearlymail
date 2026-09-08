import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type {
  GithubCategorySignals,
  GithubSignalsEmailInput,
} from "../github/github-category-signals.helper";
import type { GithubCategorySignalsService } from "../github/github-category-signals.service";

/** The email fields the GitHub signals resolver and its trace line read. */
export function githubSignalsEmailFields(
  email: Email,
): GithubSignalsEmailInput {
  return {
    from: email.from || "",
    subject: email.subject || "",
    body: email.body,
    htmlBody: email.htmlBody,
    receivedAt: email.receivedAt,
  };
}

/**
 * GitHub facts from the thread's ALREADY-cached metadata — no inline fetch.
 * Used by the rule-drafting jobs, which run after the category step has
 * already refreshed the metadata for the email they are drafting from.
 */
export async function cachedGithubSignalsForEmail(
  emailThreadRepository: Repository<EmailThread>,
  signalsService: Pick<GithubCategorySignalsService, "buildForEmail">,
  email: Email,
): Promise<GithubCategorySignals | null> {
  const thread = email.emailThreadId
    ? await emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
        select: { id: true, githubMetadata: true },
      })
    : null;
  return signalsService.buildForEmail(githubSignalsEmailFields(email), thread);
}
