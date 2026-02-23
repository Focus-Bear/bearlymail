import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import PgBoss from "pg-boss";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";
import { UsersService } from "../users/users.service";
import { EncryptionHelper } from "../encryption/encryption.helper";

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
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private readonly githubService: GitHubService,
    private readonly githubApiService: GitHubApiService,
    private readonly repoMappingService: GitHubRepoMappingService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    // Register worker for fetching GitHub metadata
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
          // Let pg-boss handle retry
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
    this.logger.log(
      `Processing GitHub metadata job for email ${emailId} (thread ${threadId}, user ${userId})`,
    );

    // Check if user has GitHub token
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      this.logger.debug(`No GitHub token for user ${userId}, skipping`);
      return;
    }

    // Get the email to parse GitHub links
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      this.logger.warn(`Email ${emailId} not found for user ${userId}`);
      return;
    }

    // Parse GitHub links from email body
    const body = email.body ? EncryptionHelper.decrypt(email.body) : "";
    const htmlBody = email.htmlBody
      ? EncryptionHelper.decrypt(email.htmlBody)
      : undefined;

    const links = this.githubService.parseGitHubLinks(body || "", htmlBody);

    if (links.length === 0) {
      this.logger.debug(`No GitHub links found in email ${emailId}`);
      return;
    }

    this.logger.log(
      `GitHub metadata job for email ${emailId}: fetching status for ${links.length} link(s): ${links.map((l) => `${l.owner}/${l.repo}#${l.number}`).join(", ")}`,
    );

    // Fetch status for all links
    const token = EncryptionHelper.decrypt(user.githubToken);
    if (!token) {
      this.logger.warn(`Failed to decrypt GitHub token for user ${userId}`);
      return;
    }

    const statuses = await this.githubApiService.fetchMultipleStatuses(
      token,
      links,
    );

    const linksWithStatus = links.filter((l) => statuses.get(l.url));
    const linksWithoutStatus = links.filter((l) => !statuses.get(l.url));
    if (linksWithoutStatus.length > 0) {
      this.logger.warn(
        `GitHub metadata job for email ${emailId}: ${linksWithStatus.length}/${links.length} link(s) returned status. Missing: ${linksWithoutStatus.map((l) => `${l.owner}/${l.repo}#${l.number}`).join(", ")}`,
      );
    } else {
      this.logger.log(
        `GitHub metadata job for email ${emailId}: all ${links.length} link(s) returned status successfully`,
      );
    }

    // Build metadata
    const metadataLinks = links.map((link) => {
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

    // Get existing thread metadata to merge (avoid overwriting other data)
    const thread = await this.emailThreadRepository.findOne({
      where: { id: threadId, userId },
    });

    if (!thread) {
      this.logger.warn(`Thread ${threadId} not found for user ${userId}`);
      return;
    }

    // Update thread with GitHub metadata
    const existingMetadata = thread.githubMetadata || {};
    const updatedMetadata = {
      ...existingMetadata,
      links: metadataLinks,
      lastFetchedAt: new Date().toISOString(),
    };

    await this.emailThreadRepository.update(
      { id: threadId, userId },
      { githubMetadata: updatedMetadata },
    );

    this.logger.debug(
      `Updated GitHub metadata for thread ${threadId} with ${metadataLinks.length} links`,
    );

    const threadCategory = thread.category || undefined;
    await this.autoDiscoverReposFromLinks(userId, links, threadCategory);
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
