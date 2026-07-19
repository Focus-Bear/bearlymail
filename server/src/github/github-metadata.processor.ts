import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { GitHubEmailInfoService } from "./github-email-info.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

interface FetchGitHubMetadataJob {
  userId: string;
  emailId: string;
  threadId: string;
  /**
   * When true, re-fetch live GitHub status even if the cached status is still
   * within its freshness window. Set for follow-up emails in a thread that
   * already has fetched statuses, whose status may have changed.
   */
  forceRefresh?: boolean;
}

@Injectable()
export class GitHubMetadataProcessor implements OnModuleInit {
  private readonly logger = new Logger(GitHubMetadataProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly githubEmailInfoService: GitHubEmailInfoService,
    private readonly repoMappingService: GitHubRepoMappingService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker<FetchGitHubMetadataJob>(
      this.boss,
      JOB_NAMES.FETCH_GITHUB_METADATA,
      { teamConcurrency: 5 },
      async (job) => {
        const { userId, emailId, threadId, forceRefresh } = job.data;

        try {
          // parseThreadGitHubLinks hydrates Email rows whose body/htmlBody
          // columns are encrypted under the user's per-user KMS data key.
          // Without this wrapper the TypeORM transformer falls back to the
          // global key, every decrypt fails, and the circuit-breaker in
          // tryDecrypt kills the job after 3 consecutive failures.
          await this.userEncryptionService.withUserKey(userId, () =>
            this.processJob(userId, emailId, threadId, forceRefresh),
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
    forceRefresh = false,
  ): Promise<void> {
    const result =
      await this.githubEmailInfoService.processEmailGitHubMetadataForJob(
        userId,
        emailId,
        threadId,
        forceRefresh,
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
