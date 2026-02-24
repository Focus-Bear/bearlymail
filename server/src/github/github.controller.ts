import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
  Res,
  Query,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { In } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Response } from "express";
import PgBoss from "pg-boss";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../auth/public.decorator";
import { GitHubService, ParsedGitHubLink } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { UsersService } from "../users/users.service";
import { isError } from "../types/common";
import { EmailsService } from "../emails/emails.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

interface PgBossWithInternals extends PgBoss {
  db: {
    executeSql(
      sql: string,
      params?: unknown[],
    ): Promise<{ rowCount?: number; rows?: unknown[] }>;
  };
}

@Controller("github")
@UseGuards(JwtAuthGuard)
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly githubService: GitHubService,
    private readonly githubApiService: GitHubApiService,
    private readonly githubAppService: GitHubAppService,
    private readonly usersService: UsersService,
    private readonly emailsService: EmailsService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly repoMappingService: GitHubRepoMappingService,
  ) {}

  @Get("emails/:id")
  // eslint-disable-next-line max-statements
  async getEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const { userId } = req.user;

    // Get email
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email || !email.emailThreadId) {
      throw new Error("Email not found");
    }

    // Get thread
    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });
    if (!thread) {
      throw new Error("Thread not found");
    }

    // Get user's GitHub token
    const user = await this.usersService.findOne(userId);
    if (!user || !user.githubToken) {
      this.logger.log(
        `GitHub info requested for email ${emailId} but user ${userId} has no GitHub token`,
      );
      return { links: [], hasToken: false };
    }

    const token = EncryptionHelper.decrypt(user.githubToken);

    // Get all emails in thread to parse GitHub links from all of them
    const threadEmails = await this.emailRepository.find({
      where: { userId, emailThreadId: email.emailThreadId },
    });

    // Parse GitHub links from all emails in thread
    const allLinks = new Map<string, ParsedGitHubLink>();
    // Use Map to deduplicate by normalized (lowercase) URL to handle case variations
    for (const threadEmail of threadEmails) {
      const links = this.githubService.parseGitHubLinks(
        threadEmail.body || "",
        threadEmail.htmlBody || undefined,
      );
      for (const link of links) {
        allLinks.set(link.url.toLowerCase(), link);
      }
    }

    const uniqueLinks = Array.from(allLinks.values());

    this.logger.log(
      `GitHub info for email ${emailId}: found ${uniqueLinks.length} unique link(s) across ${threadEmails.length} thread email(s)`,
    );

    if (uniqueLinks.length === 0) {
      return { links: [], hasToken: true };
    }

    // Check if we already have cached metadata that's less than 1 hour old
    if (thread.githubMetadata && thread.githubMetadata.links.length > 0) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Check if all links in the cache match current links and have been fetched recently
      const cachedLinksMap = new Map(
        thread.githubMetadata.links.map((link) => [
          link.url.toLowerCase(),
          link,
        ]),
      );

      // Check if all current links are in cache and fresh
      const allLinksCachedAndFresh = uniqueLinks.every((link) => {
        const cachedLink = cachedLinksMap.get(link.url.toLowerCase());
        if (!cachedLink || !cachedLink.status || !cachedLink.fetchedAt) {
          return false;
        }
        const fetchedAt = new Date(cachedLink.fetchedAt);
        return fetchedAt > oneHourAgo;
      });

      // If all links are cached and fresh, return cached data
      if (allLinksCachedAndFresh) {
        this.logger.log(
          `GitHub cache hit for email ${emailId}: returning ${uniqueLinks.length} cached link(s)`,
        );
        // Return cached links that match current links (already deduplicated via uniqueLinks)
        const cachedLinksToReturn = uniqueLinks
          .map((link) => cachedLinksMap.get(link.url.toLowerCase()))
          .filter((link) => link !== undefined);

        // Double-check deduplication before returning
        const seenUrls = new Set<string>();
        const dedupedLinks = cachedLinksToReturn.filter((link) => {
          const key = (
            link.url || `${link.owner}-${link.repo}-${link.number}`
          ).toLowerCase();
          if (seenUrls.has(key)) {
            return false;
          }
          seenUrls.add(key);
          return true;
        });

        return {
          links: dedupedLinks,
          hasToken: true,
        };
      }
      this.logger.log(
        `GitHub cache miss for email ${emailId}: fetching fresh status for ${uniqueLinks.length} link(s)`,
      );
    }

    // Fetch fresh status for all links
    try {
      this.logger.log(
        `Fetching GitHub status for email ${emailId}: ${uniqueLinks.map((l) => `${l.owner}/${l.repo}#${l.number}`).join(", ")}`,
      );
      const statuses = await this.githubApiService.fetchMultipleStatuses(
        token,
        uniqueLinks,
      );

      const linksWithStatus = uniqueLinks.filter((l) => statuses.get(l.url));
      const linksWithoutStatus = uniqueLinks.filter(
        (l) => !statuses.get(l.url),
      );
      if (linksWithoutStatus.length > 0) {
        this.logger.warn(
          `GitHub fetch for email ${emailId}: ${linksWithStatus.length}/${uniqueLinks.length} link(s) returned status. Missing: ${linksWithoutStatus.map((l) => `${l.owner}/${l.repo}#${l.number}`).join(", ")}`,
        );
      } else {
        this.logger.log(
          `GitHub fetch for email ${emailId}: all ${uniqueLinks.length} link(s) returned status successfully`,
        );
      }

      const metadataLinks = uniqueLinks.map((link) => {
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

      // Update thread with GitHub metadata
      thread.githubMetadata = {
        links: metadataLinks,
      };
      await this.emailThreadRepository.save(thread);

      return {
        links: metadataLinks,
        hasToken: true,
      };
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(
        `Error fetching GitHub statuses for email ${emailId}: ${errorMessage}`,
      );
      throw error;
    }
  }

  @Post("emails/:id/refresh")
  async refreshEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const { userId } = req.user;

    // Get email
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email || !email.emailThreadId) {
      throw new Error("Email not found");
    }

    // Get thread
    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });
    if (!thread) {
      throw new Error("Thread not found");
    }

    // Get user's GitHub token
    const user = await this.usersService.findOne(userId);
    if (!user || !user.githubToken) {
      throw new Error("GitHub token not configured");
    }

    const token = EncryptionHelper.decrypt(user.githubToken);

    // Get all emails in thread to parse GitHub links from all of them
    const threadEmails = await this.emailRepository.find({
      where: { userId, emailThreadId: email.emailThreadId },
    });

    // Parse GitHub links from all emails in thread
    const allLinks = new Map<string, ParsedGitHubLink>();
    // Use Map to deduplicate by normalized (lowercase) URL to handle case variations
    for (const threadEmail of threadEmails) {
      const links = this.githubService.parseGitHubLinks(
        threadEmail.body || "",
        threadEmail.htmlBody || undefined,
      );
      for (const link of links) {
        allLinks.set(link.url.toLowerCase(), link);
      }
    }

    const uniqueLinks = Array.from(allLinks.values());

    if (uniqueLinks.length === 0) {
      return { links: [], message: "No GitHub links found in thread" };
    }

    // Fetch fresh status for all links
    try {
      const statuses = await this.githubApiService.fetchMultipleStatuses(
        token,
        uniqueLinks,
      );

      const metadataLinks = uniqueLinks.map((link) => {
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

      // Update thread with GitHub metadata
      thread.githubMetadata = {
        links: metadataLinks,
      };
      await this.emailThreadRepository.save(thread);

      return {
        links: metadataLinks,
        message: "GitHub status refreshed successfully",
      };
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(`Error refreshing GitHub statuses: ${errorMessage}`);
      throw error;
    }
  }

  @Post("batch-status")
  async batchGetGitHubStatus(
    @Request() req,
    @Body() body: { emailIds: string[] },
  ) {
    const { userId } = req.user;
    const { emailIds } = body;

    if (!emailIds || emailIds.length === 0) {
      return {};
    }

    this.logger.log(
      `Batch GitHub status requested for ${emailIds.length} email(s) by user ${userId}`,
    );

    const emails = await this.emailRepository.find({
      where: { id: In(emailIds), userId },
      select: ["id", "emailThreadId"],
    });

    if (emails.length === 0) {
      return {};
    }

    const threadIds = [
      ...new Set(
        emails.map((e) => e.emailThreadId).filter((id): id is string => !!id),
      ),
    ];

    const threads = await this.emailThreadRepository.find({
      where: { id: In(threadIds), userId },
    });

    const threadMap = new Map(threads.map((t) => [t.id, t]));

    const result: Record<
      string,
      { links: Array<Record<string, unknown>>; pending?: boolean } | null
    > = {};

    for (const email of emails) {
      if (!email.emailThreadId) {
        result[email.id] = null;
        continue;
      }

      const thread = threadMap.get(email.emailThreadId);
      if (!thread) {
        result[email.id] = null;
        continue;
      }

      if (
        thread.githubMetadata &&
        thread.githubMetadata.links &&
        thread.githubMetadata.links.length > 0 &&
        thread.githubMetadata.links.some((link) => link.status)
      ) {
        result[email.id] = { links: thread.githubMetadata.links };
      } else {
        result[email.id] = { links: [], pending: true };
        this.boss
          .send(
            "fetch-github-metadata",
            { userId, emailId: email.id, threadId: email.emailThreadId },
            {
              singletonKey: `github-metadata-${email.emailThreadId}`,
              singletonMinutes: 60,
            },
          )
          .catch((err: unknown) => {
            const errMsg = isError(err) ? err.message : "Unknown error";
            this.logger.error(
              `Failed to queue GitHub metadata job for email ${email.id}: ${errMsg}`,
            );
          });
      }
    }

    const cachedCount = Object.values(result).filter(
      (r) => r && !r.pending,
    ).length;
    const pendingCount = Object.values(result).filter((r) => r?.pending).length;
    this.logger.log(
      `Batch GitHub status for user ${userId}: ${cachedCount} cached, ${pendingCount} pending (queued for background fetch)`,
    );

    return result;
  }

  @Get("my/connection-status")
  async getMyConnectionStatus(@Request() req) {
    const { userId } = req.user;

    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      return { hasToken: false };
    }

    const token = EncryptionHelper.decrypt(user.githubToken);
    if (!token) {
      return { hasToken: true, tokenValid: false, error: "Token decryption failed" };
    }

    const tokenResult = await this.githubApiService.testToken(token);
    if (!tokenResult.valid) {
      return {
        hasToken: true,
        tokenValid: false,
        error: tokenResult.error,
      };
    }

    // Test access for each repo mapping
    const repoMappings = await this.repoMappingService.findAllForUser(userId);
    const repoStatuses = await Promise.all(
      repoMappings.map(async (mapping) => {
        const access = await this.githubApiService.testRepoAccess(
          token,
          mapping.owner,
          mapping.repo,
        );
        return {
          id: mapping.id,
          owner: mapping.owner,
          repo: mapping.repo,
          isDefault: mapping.isDefault,
          isAutoDiscovered: mapping.isAutoDiscovered,
          accessible: access.accessible,
          isPrivate: access.isPrivate,
          error: access.error,
        };
      }),
    );

    return {
      hasToken: true,
      tokenValid: true,
      login: tokenResult.login,
      name: tokenResult.name,
      scopes: tokenResult.scopes,
      repos: repoStatuses,
    };
  }

  @Get("admin/debug")
  @UseGuards(AdminGuard)
  // eslint-disable-next-line max-statements
  async getAdminDebugInfo() {
    const { db } = this.boss as unknown as PgBossWithInternals;

    // Count users with GitHub token configured
    const usersWithTokenResult = await db.executeSql(`
      SELECT COUNT(*) as count
      FROM users
      WHERE "githubToken" IS NOT NULL AND "githubToken" != ''
    `);
    const usersWithToken = parseInt(
      (usersWithTokenResult?.rows?.[0] as { count: string })?.count ?? "0",
      10,
    );

    // Count threads with GitHub metadata populated
    const threadsWithMetadataResult = await db.executeSql(`
      SELECT COUNT(*) as count
      FROM email_threads
      WHERE "githubMetadata" IS NOT NULL AND "githubMetadata" != ''
    `);
    const threadsWithMetadata = parseInt(
      (threadsWithMetadataResult?.rows?.[0] as { count: string })?.count ?? "0",
      10,
    );

    // Get stats for fetch-github-metadata jobs (last 7 days)
    const jobStatsResult = await db.executeSql(`
      SELECT state, COUNT(*) as count
      FROM pgboss.job
      WHERE name = 'fetch-github-metadata'
        AND createdon >= NOW() - INTERVAL '7 days'
      GROUP BY state
    `);
    const jobStats: Record<string, number> = {};
    if (jobStatsResult?.rows) {
      for (const row of jobStatsResult.rows as Array<{
        state: string;
        count: string;
      }>) {
        jobStats[row.state] = parseInt(row.count, 10);
      }
    }

    // Get recent failed jobs with error details (last 7 days, most recent first)
    const failedJobsResult = await db.executeSql(`
      SELECT
        id,
        data,
        output,
        createdon,
        completedon,
        retrylimit,
        retrycount
      FROM pgboss.job
      WHERE name = 'fetch-github-metadata'
        AND state = 'failed'
        AND createdon >= NOW() - INTERVAL '7 days'
      ORDER BY createdon DESC
      LIMIT 10
    `);
    interface PgBossJobRow {
      id: string;
      data: { userId?: string; emailId?: string; threadId?: string };
      output: { message?: string } | null;
      createdon: string;
      completedon: string | null;
      retrylimit: number;
      retrycount: number;
    }
    const recentFailedJobs = (
      (failedJobsResult?.rows ?? []) as PgBossJobRow[]
    ).map((row) => ({
      id: row.id,
      userId: row.data?.userId,
      emailId: row.data?.emailId,
      threadId: row.data?.threadId,
      error: row.output?.message ?? "Unknown error",
      createdAt: row.createdon,
      completedAt: row.completedon,
      retryCount: row.retrycount,
      retryLimit: row.retrylimit,
    }));

    // Get archived (completed) job stats for fetch-github-metadata (last 7 days)
    const archiveStatsResult = await db.executeSql(`
      SELECT COUNT(*) as "completedCount"
      FROM pgboss.archive
      WHERE name = 'fetch-github-metadata'
        AND createdon >= NOW() - INTERVAL '7 days'
    `);
    const completedCount = parseInt(
      (archiveStatsResult?.rows?.[0] as { completedCount: string })
        ?.completedCount ?? "0",
      10,
    );

    // Find threads with GitHub metadata links but no status fetched (silent failures)
    // These are threads where the background job ran but the GitHub API returned null
    // (e.g., private repo the token can't access)
    interface ThreadMetadataRow {
      id: string;
      userId: string;
      githubMetadata: string;
      updatedAt: string;
    }
    const recentThreadsResult = await db.executeSql(`
      SELECT id, "userId", "githubMetadata", "updatedAt"
      FROM email_threads
      WHERE "githubMetadata" IS NOT NULL AND "githubMetadata" != ''
      ORDER BY "updatedAt" DESC
      LIMIT 200
    `);

    let threadsWithLinksNoStatus = 0;
    const recentSilentFailures: Array<{
      threadId: string;
      links: string;
      lastAttempted: string;
    }> = [];

    for (const row of (recentThreadsResult?.rows ??
      []) as ThreadMetadataRow[]) {
      try {
        const decrypted = EncryptionHelper.decrypt(row.githubMetadata);
        if (!decrypted) continue;
        const metadata = JSON.parse(decrypted) as {
          links?: Array<{
            owner?: string;
            repo?: string;
            number?: number;
            status?: unknown;
            fetchedAt?: string;
          }>;
          lastFetchedAt?: string;
        };
        if (!metadata?.links?.length) continue;
        const hasAnyStatus = metadata.links.some((l) => l.status);
        if (!hasAnyStatus) {
          threadsWithLinksNoStatus++;
          if (recentSilentFailures.length < 10) {
            const linkDescriptions = metadata.links
              .map(
                (l) => `${l.owner ?? "?"}/${l.repo ?? "?"}#${l.number ?? "?"}`,
              )
              .join(", ");
            recentSilentFailures.push({
              threadId: row.id,
              links: linkDescriptions,
              lastAttempted: metadata.lastFetchedAt ?? row.updatedAt,
            });
          }
        }
      } catch {
        // Skip malformed metadata
      }
    }

    return {
      usersWithToken,
      threadsWithMetadata,
      threadsWithLinksNoStatus,
      jobStats: {
        ...jobStats,
        completed: completedCount,
      },
      recentFailedJobs,
      recentSilentFailures,
      timestamp: new Date().toISOString(),
    };
  }

  @Post("admin/test-token")
  @UseGuards(AdminGuard)
  async testUserToken(
    @Body() body: { userId: string; testOwner?: string; testRepo?: string },
  ) {
    const { userId, testOwner, testRepo } = body;

    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.githubToken) {
      return { hasToken: false, valid: false };
    }

    const token = EncryptionHelper.decrypt(user.githubToken);
    if (!token) {
      return { hasToken: true, valid: false, error: "Token decryption failed" };
    }

    const tokenResult = await this.githubApiService.testToken(token);
    const result: {
      hasToken: boolean;
      valid: boolean;
      login?: string;
      name?: string;
      scopes?: string[];
      error?: string;
      repoAccess?: boolean;
      repoIsPrivate?: boolean;
      repoError?: string;
    } = { hasToken: true, ...tokenResult };

    if (tokenResult.valid && testOwner && testRepo) {
      const repoResult = await this.githubApiService.testRepoAccess(
        token,
        testOwner,
        testRepo,
      );
      result.repoAccess = repoResult.accessible;
      result.repoIsPrivate = repoResult.isPrivate;
      result.repoError = repoResult.error;
    }

    return result;
  }

  @Get("repo-mappings")
  async getRepoMappings(@Request() req) {
    const { userId } = req.user;
    return this.repoMappingService.findAllForUser(userId);
  }

  @Post("repo-mappings")
  async createRepoMapping(
    @Request() req,
    @Body()
    body: {
      owner: string;
      repo: string;
      emailCategories?: string;
      context?: string;
      isDefault?: boolean;
    },
  ) {
    const { userId } = req.user;
    return this.repoMappingService.create(userId, body);
  }

  @Put("repo-mappings/:id")
  async updateRepoMapping(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      emailCategories?: string;
      context?: string;
      isDefault?: boolean;
    },
  ) {
    const { userId } = req.user;
    const mapping = await this.repoMappingService.update(userId, id, body);
    if (!mapping) {
      throw new NotFoundException("Repo mapping not found");
    }
    return mapping;
  }

  @Delete("repo-mappings/:id")
  async deleteRepoMapping(@Request() req, @Param("id") id: string) {
    const { userId } = req.user;
    const deleted = await this.repoMappingService.remove(userId, id);
    if (!deleted) {
      throw new NotFoundException("Repo mapping not found");
    }
    return { success: true };
  }

  @Get("repo-mappings/default")
  async getDefaultRepoMapping(@Request() req) {
    const { userId } = req.user;
    return this.repoMappingService.getDefaultForUser(userId);
  }

  @Post("create-connect-token")
  async createConnectToken(@Request() req) {
    const { userId } = req.user;
    const token = this.githubAppService.createConnectToken(userId);
    return { token };
  }

  @Public()
  @Get("connect")
  async connect(@Query("token") token: string, @Res() res: Response) {
    const frontendUrl = this.githubAppService.getFrontendUrl();

    if (!token) {
      this.logger.error("GitHub connect endpoint called without token");
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }

    // Verify and extract userId from signed token
    const userId = this.githubAppService.verifyConnectToken(token);
    if (!userId) {
      this.logger.error("Invalid or expired connect token");
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }

    const authUrl = this.githubAppService.getAuthorizationUrl(userId);
    return res.redirect(authUrl);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.githubAppService.getFrontendUrl();
    const settingsUrl = `${frontendUrl}/settings?github=connected`;

    try {
      if (!code) {
        this.logger.error("GitHub OAuth callback missing authorization code");
        return res.redirect(`${frontendUrl}/settings?github=error`);
      }

      // Verify signed state parameter and extract userId
      const userId = this.githubAppService.verifyConnectToken(state);
      if (!userId) {
        this.logger.error("Invalid or expired state parameter");
        return res.redirect(`${frontendUrl}/settings?github=error`);
      }

      // Exchange code for access token
      const accessToken =
        await this.githubAppService.exchangeCodeForToken(code);

      // Store token for user
      await this.githubAppService.storeTokenForUser(userId, accessToken);

      this.logger.log(`GitHub OAuth successful for user ${userId}`);
      return res.redirect(settingsUrl);
    } catch (error) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(`GitHub OAuth callback error: ${errorMessage}`, error);
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }
  }
}
