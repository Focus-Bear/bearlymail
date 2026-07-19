import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";
import {
  GitHubService,
  isGitHubNotificationEmail,
  ParsedGitHubLink,
} from "./github.service";
import {
  GitHubApiService,
  GitHubIssueStatus,
  GitHubPRStatus,
} from "./github-api.service";

/**
 * The shape of a single GitHub link entry stored in thread metadata.
 * Matches the structure defined on the EmailThread entity's githubMetadata column.
 */
export type GitHubMetadataLink = NonNullable<
  EmailThread["githubMetadata"]
>["links"][number];

export interface GitHubEmailInfoResult {
  links: GitHubMetadataLink[];
  hasToken: boolean;
}

export interface EmailThreadMetadata {
  emailId: string;
  threadId: string | null;
  links: GitHubMetadataLink[];
  hasCachedStatus: boolean;
}

/**
 * Service that encapsulates all GitHub email/thread operations used by the controller.
 * Groups together the repository and service dependencies for email GitHub info retrieval,
 * keeping the controller constructor lean.
 */
@Injectable()
export class GitHubEmailInfoService {
  private readonly logger = new Logger(GitHubEmailInfoService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
    private readonly githubService: GitHubService,
    private readonly githubApiService: GitHubApiService,
    private readonly usersService: UsersService,
    private readonly emailsService: EmailsService,
  ) {}

  /**
   * Parse unique GitHub links from all emails in a thread.
   */
  async parseThreadGitHubLinks(
    userId: string,
    emailThreadId: string,
  ): Promise<ParsedGitHubLink[]> {
    const threadEmails = await this.emailRepository.find({
      where: { userId, emailThreadId },
    });

    // Dedupe keyed by lowercased URL so the same resource referenced with
    // different casing across thread messages doesn't show up twice.
    const allLinks = new Map<string, ParsedGitHubLink>();
    for (const threadEmail of threadEmails) {
      // Defensive decrypt: TypeORM hydration can leak ciphertext (partial selects,
      // missing per-user KMS context, etc.). Mirrors parseEmailGitHubLinks below
      // so the regex never scans `iv:tag:hex` and silently returns no links.
      const body = EncryptionHelper.tryDecrypt(threadEmail.body) ?? "";
      const htmlBody =
        EncryptionHelper.tryDecrypt(threadEmail.htmlBody) ?? undefined;
      const links = this.githubService.parseGitHubLinks(body, htmlBody);
      for (const link of links) {
        allLinks.set(link.url.toLowerCase(), link);
      }

      // Fallback: when body/HTML parsing found nothing, try the subject line.
      // GitHub notification emails have a reliable subject format:
      //   [owner/repo] title (#number)
      // This covers cases where the URL is only in an href attribute and
      // htmlBody is null, or where the plain-text body omits the raw URL.
      if (allLinks.size === 0) {
        const from = EncryptionHelper.tryDecrypt(threadEmail.from) ?? "";
        const subject = EncryptionHelper.tryDecrypt(threadEmail.subject) ?? "";
        if (isGitHubNotificationEmail(from)) {
          const subjectLinks = this.githubService.parseGitHubLinksFromSubject(
            subject,
            body,
          );
          for (const link of subjectLinks) {
            allLinks.set(link.url.toLowerCase(), link);
          }
        }
      }
    }
    return Array.from(allLinks.values());
  }

  /**
   * Build the metadata link objects from unique links and fetched statuses.
   */
  buildMetadataLinks(
    uniqueLinks: ParsedGitHubLink[],
    statuses: Map<string, GitHubIssueStatus | GitHubPRStatus>,
  ): GitHubMetadataLink[] {
    return uniqueLinks.map((link) => {
      const status = statuses.get(link.url);
      return {
        type: link.type,
        repo: link.repo,
        owner: link.owner,
        number: link.number,
        url: link.url,
        status: status
          ? {
              ...status,
              fetchedAt: new Date().toISOString(),
            }
          : undefined,
        fetchedAt: status ? new Date().toISOString() : undefined,
      };
    });
  }

  /**
   * Check if the cached metadata for a thread covers all current links and is fresh (< 1 hour).
   */
  private isCacheFresh(
    thread: EmailThread,
    uniqueLinks: ParsedGitHubLink[],
  ): boolean {
    if (!thread.githubMetadata || thread.githubMetadata.links.length === 0) {
      return false;
    }
    const oneHourAgo = new Date(Date.now() - MILLISECONDS.HOUR);
    const cachedLinksMap = new Map(
      thread.githubMetadata.links.map((link) => [link.url, link]),
    );
    return uniqueLinks.every((link) => {
      const cachedLink = cachedLinksMap.get(link.url);
      if (!cachedLink || !cachedLink.status || !cachedLink.fetchedAt) {
        return false;
      }
      return new Date(cachedLink.fetchedAt) > oneHourAgo;
    });
  }

  /**
   * Return the subset of cached links that match the current unique links, deduplicated.
   */
  private getCachedLinks(
    thread: EmailThread,
    uniqueLinks: ParsedGitHubLink[],
  ): GitHubMetadataLink[] {
    const cachedLinksMap = new Map(
      thread.githubMetadata.links.map((link) => [link.url, link]),
    );
    const matched = uniqueLinks
      .map((link) => cachedLinksMap.get(link.url))
      .filter((link): link is NonNullable<typeof link> => link !== undefined);

    const seenUrls = new Set<string>();
    return matched.filter((link) => {
      const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
      if (seenUrls.has(key)) return false;
      seenUrls.add(key);
      return true;
    });
  }

  /**
   * Fetch and cache fresh GitHub status for all links in a thread's emails.
   * Returns the metadata links and saves them to the thread.
   */
  private async fetchAndCacheStatuses(
    token: string,
    thread: EmailThread,
    uniqueLinks: ParsedGitHubLink[],
  ): Promise<GitHubMetadataLink[]> {
    const statuses = await this.githubApiService.fetchMultipleStatuses(
      token,
      uniqueLinks,
    );

    const metadataLinks = this.buildMetadataLinks(uniqueLinks, statuses);

    const updatedThread = thread;
    updatedThread.githubMetadata = { links: metadataLinks };
    await this.emailThreadRepository.save(updatedThread);

    return metadataLinks;
  }

  /**
   * Get GitHub info for an email (uses cache if fresh, otherwise fetches fresh data).
   */
  async getEmailGitHubInfo(
    userId: string,
    emailId: string,
  ): Promise<GitHubEmailInfoResult> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email || !email.emailThreadId) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });
    if (!thread) {
      throw new Error(ERROR_MESSAGES.THREAD_NOT_FOUND);
    }

    const user = await this.usersService.findOne(userId);
    if (!user || !user.githubToken) {
      return { links: [], hasToken: false };
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    const uniqueLinks = await this.parseThreadGitHubLinks(
      userId,
      email.emailThreadId,
    );

    if (uniqueLinks.length === 0) {
      return { links: [], hasToken: true };
    }

    if (this.isCacheFresh(thread, uniqueLinks)) {
      return {
        links: this.getCachedLinks(thread, uniqueLinks),
        hasToken: true,
      };
    }

    const metadataLinks = await this.fetchAndCacheStatuses(
      token,
      thread,
      uniqueLinks,
    );
    return { links: metadataLinks, hasToken: true };
  }

  /**
   * Force-refresh GitHub status for all links in an email's thread.
   */
  async refreshEmailGitHubInfo(
    userId: string,
    emailId: string,
  ): Promise<{ links: GitHubMetadataLink[]; message: string }> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email || !email.emailThreadId) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });
    if (!thread) {
      throw new Error(ERROR_MESSAGES.THREAD_NOT_FOUND);
    }

    const user = await this.usersService.findOne(userId);
    if (!user || !user.githubToken) {
      throw new Error(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    const uniqueLinks = await this.parseThreadGitHubLinks(
      userId,
      email.emailThreadId,
    );

    if (uniqueLinks.length === 0) {
      return { links: [], message: "No GitHub links found in thread" };
    }

    const metadataLinks = await this.fetchAndCacheStatuses(
      token,
      thread,
      uniqueLinks,
    );
    return {
      links: metadataLinks,
      message: "GitHub status refreshed successfully",
    };
  }

  /**
   * Decrypt and return the GitHub token for a user, or null if unavailable.
   */
  async getUserGitHubToken(userId: string): Promise<string | null> {
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) return null;
    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    return token || null;
  }

  /**
   * Process GitHub metadata for a background job: parse links from all emails
   * in the thread, fetch statuses, update the thread, and return info for repo
   * auto-discovery. Returns null only when no GitHub links are found in the thread.
   *
   * Always writes at least the parsed links to githubMetadata so the inbox badge
   * appears even when the user has no GitHub token or the GitHub API is unavailable.
   * Status is fetched and merged when a token is available and the cache is stale.
   *
   * Scans all thread emails (not just the triggering email) so that GitHub links
   * in earlier messages are captured even when the newest email is a plain reply.
   *
   * When forceRefresh is true the cache-freshness check is skipped so a follow-up
   * email re-fetches live status even if the cached status is still within its
   * freshness window (the new email may have changed that status).
   */
  async processEmailGitHubMetadataForJob(
    userId: string,
    emailId: string,
    threadId: string,
    forceRefresh = false,
  ): Promise<{ links: ParsedGitHubLink[]; category?: string } | null> {
    // Parse links first — no GitHub token required for this step.
    const links = await this.parseThreadGitHubLinks(userId, threadId);
    if (links.length === 0) {
      this.logger.debug(
        `No GitHub links found in thread ${threadId} (triggered by email ${emailId})`,
      );
      return null;
    }

    // Fetch the thread once and reuse it for the cache freshness check and the
    // category lookup — avoids two extra findOne round-trips (one inside
    // fetchAndMergeThreadMetadata, one for the categoryId resolution below).
    const thread = await this.emailThreadRepository.findOne({
      where: { id: threadId, userId },
    });
    if (!thread) {
      this.logger.warn(`Thread ${threadId} not found for user ${userId}`);
      return null;
    }

    const token = await this.getUserGitHubToken(userId);
    if (token) {
      if (forceRefresh || !this.isCacheFresh(thread, links)) {
        try {
          await this.fetchAndMergeThreadMetadata(
            userId,
            threadId,
            token,
            links,
            thread,
          );
        } catch (error) {
          // GitHub API unavailable (rate limit, network error, etc.).
          // Fall back to storing the links without status so the inbox badge still
          // appears. The status will be fetched on the next job run.
          this.logger.warn(
            `GitHub API failed for thread ${threadId}, storing links without status: ${error}`,
          );
          await this.storeLinksWithoutStatus(threadId, userId, links, thread);
        }
      }
    } else {
      // No token: store the links so the inbox badge appears.
      // Don't overwrite existing status data (user may have had a token previously).
      this.logger.debug(
        `No GitHub token for user ${userId}, storing links without status for thread ${threadId}`,
      );
      await this.storeLinksWithoutStatus(threadId, userId, links, thread);
    }

    // Resolve category display name from categoryId — downstream consumers do name-based matching.
    let categoryName: string | undefined;
    if (thread.categoryId) {
      const categoryCtx = await this.userContextRepository.findOne({
        where: {
          contextId: thread.categoryId,
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
        select: {
          contextValue: true,
        },
      });
      if (categoryCtx) {
        decryptUserContextEntityForApi(categoryCtx);
        categoryName = parseCategoryName(categoryCtx.contextValue);
      }
    }
    return { links, category: categoryName };
  }

  /**
   * Persist parsed links to the thread's githubMetadata without fetching GitHub API
   * status. Existing statuses for matching link URLs are preserved so we never
   * downgrade a link that already has fresh cached status data, while still picking
   * up newly discovered links from later messages in the thread.
   */
  private async storeLinksWithoutStatus(
    threadId: string,
    userId: string,
    links: ParsedGitHubLink[],
    thread: EmailThread,
  ): Promise<void> {
    const existingByUrl = new Map<string, GitHubMetadataLink>(
      (thread.githubMetadata?.links ?? []).map((link) => [link.url, link]),
    );
    const metadataLinks: GitHubMetadataLink[] = links.map((link) => {
      const base = this.buildMetadataLinks([link], new Map())[0];
      const existing = existingByUrl.get(link.url);
      if (existing?.status) {
        return { ...base, status: existing.status };
      }
      return base;
    });

    thread.githubMetadata = { links: metadataLinks };
    await this.emailThreadRepository.save(thread);
    this.logger.debug(
      `Stored ${metadataLinks.length} GitHub link(s) (without fresh status) for thread ${threadId}`,
    );
  }

  /**
   * Parse GitHub links from a single email's body (by emailId), decrypting as needed.
   */
  async parseEmailGitHubLinks(
    userId: string,
    emailId: string,
  ): Promise<ParsedGitHubLink[]> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
    if (!email) return [];
    const body = email.body ? EncryptionHelper.tryDecrypt(email.body) : "";
    const htmlBody = email.htmlBody
      ? EncryptionHelper.tryDecrypt(email.htmlBody)
      : undefined;
    const links = this.githubService.parseGitHubLinks(body || "", htmlBody);
    if (links.length > 0) return links;

    // Fallback: parse from subject for GitHub notification emails
    const from = email.from ? EncryptionHelper.tryDecrypt(email.from) : "";
    const subject = email.subject
      ? EncryptionHelper.tryDecrypt(email.subject)
      : "";
    if (isGitHubNotificationEmail(from ?? "")) {
      return this.githubService.parseGitHubLinksFromSubject(
        subject ?? "",
        body ?? "",
      );
    }
    return [];
  }

  /**
   * Fetch GitHub statuses for links and merge them into a thread's existing metadata,
   * then persist the updated metadata. Returns the resulting metadata links.
   */
  async fetchAndMergeThreadMetadata(
    userId: string,
    threadId: string,
    token: string,
    links: ParsedGitHubLink[],
    thread?: EmailThread,
  ): Promise<GitHubMetadataLink[]> {
    const statuses = await this.githubApiService.fetchMultipleStatuses(
      token,
      links,
    );

    const metadataLinks = this.buildMetadataLinks(links, statuses);

    const threadEntity =
      thread ??
      (await this.emailThreadRepository.findOne({
        where: { id: threadId, userId },
      }));
    if (!threadEntity) {
      this.logger.warn(`Thread ${threadId} not found for user ${userId}`);
      return metadataLinks;
    }

    await this.emailThreadRepository.update(
      { id: threadId, userId },
      { githubMetadata: { links: metadataLinks } },
    );

    this.logger.debug(
      `Updated GitHub metadata for thread ${threadId} with ${metadataLinks.length} links`,
    );

    return metadataLinks;
  }

  /**
   * Look up GitHub metadata for a batch of emails.
   * Returns per-email metadata: the cached links and whether the status is available.
   */
  async getThreadMetadataByEmailIds(
    userId: string,
    emailIds: string[],
  ): Promise<EmailThreadMetadata[]> {
    const emails = await this.emailRepository.find({
      where: { id: In(emailIds), userId },
      select: {
        id: true,
        emailThreadId: true,
      },
    });

    if (emails.length === 0) return [];

    const threadIds = [
      ...new Set(
        emails
          .map((email) => email.emailThreadId)
          .filter((id): id is string => !!id),
      ),
    ];

    const threads = await this.emailThreadRepository.find({
      where: { id: In(threadIds), userId },
    });

    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));

    return emails.map((email) => {
      if (!email.emailThreadId) {
        return {
          emailId: email.id,
          threadId: null,
          links: [],
          hasCachedStatus: false,
        };
      }
      const thread = threadMap.get(email.emailThreadId);
      if (!thread) {
        return {
          emailId: email.id,
          threadId: email.emailThreadId,
          links: [],
          hasCachedStatus: false,
        };
      }
      // Batch polling must stop once metadata has been written, even when GitHub API
      // returned no status (rate limit, 404, private repo). Otherwise hasCachedStatus
      // stayed false forever and clients saw perpetual pending + loading spinners.
      const links = thread.githubMetadata?.links ?? [];
      const hasCachedStatus = links.length > 0;
      return {
        emailId: email.id,
        threadId: email.emailThreadId,
        links,
        hasCachedStatus,
      };
    });
  }
}
