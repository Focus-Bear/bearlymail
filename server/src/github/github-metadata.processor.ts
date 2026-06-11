import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { GitHubCategoryOverrideService } from "./github-category-override.service";
import { GitHubEmailInfoService } from "./github-email-info.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

interface FetchGitHubMetadataJob {
  userId: string;
  emailId: string;
  threadId: string;
}

@Injectable()
export class GitHubMetadataProcessor implements OnModuleInit {
  private readonly logger = new Logger(GitHubMetadataProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly githubEmailInfoService: GitHubEmailInfoService,
    private readonly repoMappingService: GitHubRepoMappingService,
    private readonly categoryOverrideService: GitHubCategoryOverrideService,
    private readonly usersService: UsersService,
    private readonly userEncryptionService: UserEncryptionService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  async onModuleInit() {
    await registerWorker<FetchGitHubMetadataJob>(
      this.boss,
      JOB_NAMES.FETCH_GITHUB_METADATA,
      { teamConcurrency: 5 },
      async (job) => {
        const { userId, emailId, threadId } = job.data;

        try {
          // parseThreadGitHubLinks hydrates Email rows whose body/htmlBody
          // columns are encrypted under the user's per-user KMS data key.
          // Without this wrapper the TypeORM transformer falls back to the
          // global key, every decrypt fails, and the circuit-breaker in
          // tryDecrypt kills the job after 3 consecutive failures.
          await this.userEncryptionService.withUserKey(userId, () =>
            this.processJob(userId, emailId, threadId),
          );
        } catch (error) {
          this.logger.error(
            `Failed to fetch GitHub metadata for email ${emailId}:`,
            error,
          );
          throw error;
        }
      },
    );

    this.logger.log("GitHub metadata processor initialized");
  }

  private async processJob(
    userId: string,
    emailId: string,
    threadId: string,
  ): Promise<void> {
    const result =
      await this.githubEmailInfoService.processEmailGitHubMetadataForJob(
        userId,
        emailId,
        threadId,
      );

    if (!result) return;

    this.logger.debug(
      `Updated GitHub metadata for thread ${threadId} with ${result.links.length} links`,
    );

    await this.autoDiscoverReposFromLinks(
      userId,
      result.links,
      result.category,
    );

    await this.applyCategoryOverrideForThread(userId, threadId);
  }

  /**
   * After metadata is written, route the thread into one of the reserved
   * GitHub categories ("PRs awaiting your review" / "Bot updates") when its
   * signals match. Runs after LLM categorisation so the GitHub-derived choice
   * wins last-write-wins; the LLM priority-result service applies the same
   * override so the answer is consistent regardless of processor ordering.
   */
  private async applyCategoryOverrideForThread(
    userId: string,
    threadId: string,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { id: threadId, userId },
      select: {
        id: true,
        categoryId: true,
        githubMetadata: true,
      },
    });
    if (!thread?.githubMetadata?.links?.length) {
      return;
    }

    const user = await this.usersService.findOne(userId);
    const overrideCategoryId =
      await this.categoryOverrideService.resolveOverrideCategoryId(
        userId,
        thread.githubMetadata.links,
        user?.githubUsername ?? null,
      );

    if (!overrideCategoryId || overrideCategoryId === thread.categoryId) {
      return;
    }

    await this.emailThreadRepository.update(
      { id: threadId, userId },
      { categoryId: overrideCategoryId },
    );
    this.logger.debug(
      `Routed thread ${threadId} to reserved GitHub category ${overrideCategoryId}`,
    );
  }

  private async autoDiscoverReposFromLinks(
    userId: string,
    links: Array<{ owner: string; repo: string }>,
    emailCategory?: string,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const link of links) {
      const key = `${link.owner}/${link.repo}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        await this.repoMappingService.autoDiscoverRepo(
          userId,
          link.owner,
          link.repo,
          emailCategory,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to auto-discover repo ${key} for user ${userId}: ${error}`,
        );
      }
    }
  }
}
