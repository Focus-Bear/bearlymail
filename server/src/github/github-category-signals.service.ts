/**
 * Resolves the GitHub facts the category step sees for an email, refreshing
 * the thread's cached GitHub metadata INLINE first when it is missing or
 * older than the email (a new comment may have just flipped the board status
 * from "QA failed" to "QA passed"). The refresh is bounded by a timeout and
 * every failure is swallowed — categorisation proceeds with whatever metadata
 * exists. The background `FETCH_GITHUB_METADATA` job keeps refreshing the
 * inbox badge independently.
 */
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { GITHUB_METADATA_INLINE_FETCH_TIMEOUT_MS } from "../constants/github-notification.constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getErrorMessage } from "../types/common";
import {
  buildGithubCategorySignals,
  GithubCategorySignals,
  GithubSignalsEmailInput,
  needsGithubMetadataRefresh,
  ThreadGithubMetadata,
} from "./github-category-signals.helper";
import { GitHubEmailInfoService } from "./github-email-info.service";

/** The email fields the resolver needs (a full `Email` row satisfies it). */
export interface GithubSignalsEmail extends GithubSignalsEmailInput {
  id: string;
  emailThreadId?: string | null;
}

/** The thread fields the resolver needs (a full `EmailThread` row satisfies it). */
export interface GithubSignalsThread {
  id: string;
  githubMetadata: ThreadGithubMetadata | null;
}

const TIMEOUT_ERROR_MESSAGE = "inline GitHub metadata fetch timed out";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(TIMEOUT_ERROR_MESSAGE)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

@Injectable()
export class GithubCategorySignalsService {
  private readonly logger = new Logger(GithubCategorySignalsService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly githubEmailInfoService: GitHubEmailInfoService,
  ) {}

  /** Signals from the metadata as cached right now — no fetch (debug views). */
  buildForEmail(
    email: GithubSignalsEmailInput,
    thread: GithubSignalsThread | null | undefined,
  ): GithubCategorySignals | null {
    return buildGithubCategorySignals(email, thread?.githubMetadata ?? null);
  }

  /**
   * Signals for the category step: refreshes the thread's metadata inline
   * (bounded, best-effort) when it is missing or stale for this email, then
   * builds the signals from the freshest metadata available. Must run inside
   * the caller's `withUserKey` scope (the fetch reads encrypted email bodies).
   */
  async resolveForEmail(
    userId: string,
    email: GithubSignalsEmail,
    thread: GithubSignalsThread | null | undefined,
  ): Promise<GithubCategorySignals | null> {
    if (!thread || !needsGithubMetadataRefresh(email, thread.githubMetadata)) {
      return this.buildForEmail(email, thread);
    }
    const refreshed = await this.refreshMetadata(userId, email, thread);
    return this.buildForEmail(email, refreshed ?? thread);
  }

  private async refreshMetadata(
    userId: string,
    email: GithubSignalsEmail,
    thread: GithubSignalsThread,
  ): Promise<GithubSignalsThread | null> {
    try {
      await withTimeout(
        this.githubEmailInfoService.processEmailGitHubMetadataForJob(
          userId,
          email.id,
          thread.id,
          true,
        ),
        GITHUB_METADATA_INLINE_FETCH_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Inline GitHub metadata refresh skipped for thread ${thread.id} (email ${email.id}): ${getErrorMessage(error)}`,
      );
      return null;
    }
    return this.emailThreadRepository.findOne({
      where: { id: thread.id, userId },
      select: { id: true, githubMetadata: true },
    });
  }
}
