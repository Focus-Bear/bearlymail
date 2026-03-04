import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import PgBoss from "pg-boss";

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
    @Inject("PG_BOSS") private boss: PgBoss,
    private readonly githubEmailInfoService: GitHubEmailInfoService,
    private readonly repoMappingService: GitHubRepoMappingService,
  ) {}

  async onModuleInit() {
    await this.boss.work<FetchGitHubMetadataJob>(
      "fetch-github-metadata",
      { teamConcurrency: 5 },
      async (job) => {
        const { userId, emailId, threadId } = job.data;

        try {
          await this.processJob(userId, emailId, threadId);
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
