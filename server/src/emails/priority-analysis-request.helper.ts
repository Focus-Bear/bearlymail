import { Email } from "../database/entities/email.entity";
import {
  formatGithubFactsForPrompt,
  type GithubCategorySignals,
} from "../github/github-category-signals.helper";
import type {
  PriorityAnalysisService,
  PriorityResult,
} from "../llm/priority-analysis.service";
import type { PriorityCacheService } from "../priority/priority-cache.service";

export interface PriorityAnalysisRequestDeps {
  priorityAnalysisService: Pick<PriorityAnalysisService, "analyzePriority">;
  priorityCacheService: Pick<PriorityCacheService, "getUserTimezone">;
}

export interface PriorityAnalysisRequest {
  userId: string;
  email: Email;
  /** Body handed to the prompt: the cleaned/summarised text, plus any rule hint. */
  bodyWithCategoryHint: string;
  avgTimeToReply: number;
  userContext: Parameters<
    PriorityAnalysisService["analyzePriority"]
  >[0]["userContext"];
  replyStatus: Parameters<
    PriorityAnalysisService["analyzePriority"]
  >[0]["threadInfo"];
  /** True when a rule already pinned the category, so the prompt can skip the list. */
  categoryPreAssigned: boolean;
  githubSignals: GithubCategorySignals | null;
}

/**
 * Issues the single-email `analyze_priority` call. The assigned category is
 * chosen first (inside `analyzePriority`), which is why the resolved GitHub
 * facts are handed in — the categoriser treats them as authoritative over the
 * message prose.
 */
export async function runPriorityAnalysisForEmail(
  deps: PriorityAnalysisRequestDeps,
  request: PriorityAnalysisRequest,
): Promise<PriorityResult> {
  const { userId, email, githubSignals } = request;
  const userTimezone = await deps.priorityCacheService.getUserTimezone(userId);
  return deps.priorityAnalysisService.analyzePriority({
    email: {
      from: email.from || "",
      fromName: email.fromName,
      senderJobTitle: email.senderJobTitle,
      subject: email.subject || "",
      body: request.bodyWithCategoryHint,
      receivedAt: email.receivedAt ?? undefined,
    },
    userHistory: { averageTimeToReply: request.avgTimeToReply },
    userId,
    userContext: request.userContext,
    threadInfo: request.replyStatus,
    preComputedSentimentScore: email.sentimentScore ?? undefined,
    userTimezone,
    categoryPreAssigned: request.categoryPreAssigned,
    githubFacts: githubSignals
      ? formatGithubFactsForPrompt(githubSignals)
      : null,
  });
}
