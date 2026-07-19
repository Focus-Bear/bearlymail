import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import type { PgBoss } from "pg-boss";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../auth/public.decorator";
import { isUuid } from "../common/uuid.utils";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { BossDb, getBossDb } from "../emails/email-controller.helpers";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { isError } from "../types/common";
import { UsersService } from "../users/users.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubCategoryOverrideService } from "./github-category-override.service";
import {
  GitHubEmailInfoService,
  GitHubMetadataLink,
} from "./github-email-info.service";
import { GitHubProjectStatusService } from "./github-project-status.service";
import { GitHubRepoMappingService } from "./github-repo-mapping.service";

@Controller("github")
@UseGuards(JwtAuthGuard)
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly githubEmailInfoService: GitHubEmailInfoService,
    private readonly githubAppService: GitHubAppService,
    private readonly githubApiService: GitHubApiService,
    private readonly githubProjectStatusService: GitHubProjectStatusService,
    private readonly githubCategoryOverrideService: GitHubCategoryOverrideService,
    private readonly usersService: UsersService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly repoMappingService: GitHubRepoMappingService,
  ) {}

  @Get("projects/status-options")
  async getProjectStatusOptions(
    @Request() req,
    @Query("owner") owner: string,
    @Query("repo") repo: string,
    @Query("issueNumber") issueNumberStr: string,
  ) {
    const { userId } = req.user;
    const issueNumber = parseInt(issueNumberStr, 10);

    if (!owner || !repo || isNaN(issueNumber)) {
      return { options: [] };
    }

    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      return { options: [] };
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    if (!token) {
      return { options: [] };
    }

    // This legacy endpoint has been superseded by GET /github/project-status-options
    // (which requires a projectName to correctly target the Projects v2 Status field).
    // Return an empty list so callers gracefully degrade to the new endpoint.
    return { options: [] };
  }

  @Get("project-status-options")
  async getProjectStatusOptionsFull(
    @Request() req,
    @Query("owner") owner: string,
    @Query("repo") repo: string,
    @Query("issueNumber") issueNumberStr: string,
    @Query("projectName") projectName: string,
  ) {
    const { userId } = req.user;
    const issueNumber = parseInt(issueNumberStr, 10);

    if (
      !owner ||
      !repo ||
      isNaN(issueNumber) ||
      issueNumber <= 0 ||
      !projectName
    ) {
      throw new BadRequestException(
        "owner, repo, issueNumber, and projectName are required",
      );
    }

    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    if (!token) {
      throw new BadRequestException("GitHub token decryption failed");
    }

    const result =
      await this.githubProjectStatusService.getProjectStatusOptions(
        token,
        owner,
        repo,
        issueNumber,
        projectName,
      );

    if (!result) {
      throw new NotFoundException(
        `Project "${projectName}" or its Status field not found for issue ${owner}/${repo}#${issueNumber}`,
      );
    }

    return result;
  }

  @Get("emails/:id")
  async getEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const { userId } = req.user;
    // Fix #1296: reject non-UUID ids immediately to prevent PostgreSQL cast errors.
    // Gmail thread IDs are hex strings without dashes (e.g. "19d03cdabc72da73");
    // internal email IDs are UUIDs (e.g. "04547756-9d11-42b4-beae-227d52377fcd").
    if (!isUuid(emailId)) {
      throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    try {
      return await this.githubEmailInfoService.getEmailGitHubInfo(
        userId,
        emailId,
      );
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(`Error fetching GitHub statuses: ${errorMessage}`);
      throw error;
    }
  }

  @Post("emails/:id/refresh")
  async refreshEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const { userId } = req.user;
    try {
      return await this.githubEmailInfoService.refreshEmailGitHubInfo(
        userId,
        emailId,
      );
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

    const metadataItems =
      await this.githubEmailInfoService.getThreadMetadataByEmailIds(
        userId,
        emailIds,
      );

    const result: Record<
      string,
      { links: GitHubMetadataLink[]; pending?: boolean } | null
    > = {};

    for (const item of metadataItems) {
      if (!item.threadId) {
        result[item.emailId] = null;
        continue;
      }

      if (item.hasCachedStatus) {
        result[item.emailId] = { links: item.links };
      } else {
        result[item.emailId] = { links: [], pending: true };
        this.boss
          .send(
            JOB_NAMES.FETCH_GITHUB_METADATA,
            { userId, emailId: item.emailId, threadId: item.threadId },
            {
              // Retry on transient failures so the badge appears without
              // waiting for the next email-arrival event.
              retryLimit: 3,
              retryDelay: 30,
              singletonKey: `github-metadata-${item.threadId}`,
              singletonSeconds: SECONDS.HOUR,
            },
          )
          .catch((err: unknown) => {
            const errMsg = isError(err) ? err.message : "Unknown error";
            this.logger.error(
              `Failed to queue GitHub metadata job for email ${item.emailId}: ${errMsg}`,
            );
          });
      }
    }

    return result;
  }

  @Get("my/connection-status")
  async getMyConnectionStatus(@Request() req) {
    const { userId } = req.user;

    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      return { hasToken: false };
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    if (!token) {
      return {
        hasToken: true,
        tokenValid: false,
        error: "Token decryption failed",
      };
    }

    const tokenResult = await this.githubApiService.testToken(token);
    if (!tokenResult.valid) {
      return {
        hasToken: true,
        tokenValid: false,
        error: tokenResult.error,
      };
    }

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
      // Convenience flag for the inbox-card "Connect for CI status" prompt —
      // CI check-runs need full `repo` scope on OAuth Apps (there's no
      // narrower `checks:read` for OAuth Apps).
      hasRepoScope: tokenResult.scopes?.includes("repo") ?? false,
      repos: repoStatuses,
    };
  }

  @Get("admin/debug")
  @UseGuards(AdminGuard)
  async getAdminDebugInfo() {
    const db = getBossDb(this.boss);

    const [usersWithToken, threadsWithMetadata, jobStats, recentFailedJobs] =
      await Promise.all([
        this.fetchUsersWithTokenCount(db),
        this.fetchThreadsWithMetadataCount(db),
        this.fetchJobStats(db),
        this.fetchRecentFailedJobs(db),
      ]);

    const completedCount = await this.fetchCompletedJobsCount(db);
    const { threadsWithLinksNoStatus, recentSilentFailures } =
      await this.findSilentFailures(db);

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

  private async fetchUsersWithTokenCount(db: BossDb): Promise<number> {
    const result = await db.executeSql(`
      SELECT COUNT(*) as count
      FROM users
      WHERE "githubToken" IS NOT NULL AND "githubToken" != ''
    `);
    return parseInt((result?.rows?.[0] as { count: string })?.count ?? "0", 10);
  }

  private async fetchThreadsWithMetadataCount(db: BossDb): Promise<number> {
    const result = await db.executeSql(`
      SELECT COUNT(*) as count
      FROM email_threads
      WHERE "githubMetadata" IS NOT NULL AND "githubMetadata" != ''
    `);
    return parseInt((result?.rows?.[0] as { count: string })?.count ?? "0", 10);
  }

  private async fetchJobStats(db: BossDb): Promise<Record<string, number>> {
    const result = await db.executeSql(`
      SELECT state, COUNT(*) as count
      FROM pgboss.job
      WHERE name = '${JOB_NAMES.FETCH_GITHUB_METADATA}'
        AND createdon >= NOW() - INTERVAL '7 days'
      GROUP BY state
    `);
    const stats: Record<string, number> = {};
    if (result?.rows) {
      for (const row of result.rows as Array<{
        state: string;
        count: string;
      }>) {
        stats[row.state] = parseInt(row.count, 10);
      }
    }
    return stats;
  }

  private async fetchRecentFailedJobs(db: BossDb) {
    const result = await db.executeSql(`
      SELECT
        id,
        data AS job_data,
        output,
        createdon,
        completedon,
        retrylimit,
        retrycount
      FROM pgboss.job
      WHERE name = '${JOB_NAMES.FETCH_GITHUB_METADATA}'
        AND state = 'failed'
        AND createdon >= NOW() - INTERVAL '7 days'
      ORDER BY createdon DESC
      LIMIT 10
    `);
    interface PgBossJobRow {
      id: string;
      job_data: { userId?: string; emailId?: string; threadId?: string };
      output: { message?: string } | null;
      createdon: string;
      completedon: string | null;
      retrylimit: number;
      retrycount: number;
    }
    return ((result?.rows ?? []) as PgBossJobRow[]).map((row) => ({
      id: row.id,
      userId: row.job_data?.userId,
      emailId: row.job_data?.emailId,
      threadId: row.job_data?.threadId,
      error: row.output?.message ?? "Unknown error",
      createdAt: row.createdon,
      completedAt: row.completedon,
      retryCount: row.retrycount,
      retryLimit: row.retrylimit,
    }));
  }

  private async fetchCompletedJobsCount(db: BossDb): Promise<number> {
    const result = await db.executeSql(`
      SELECT COUNT(*) as "completedCount"
      FROM pgboss.archive
      WHERE name = '${JOB_NAMES.FETCH_GITHUB_METADATA}'
        AND createdon >= NOW() - INTERVAL '7 days'
    `);
    return parseInt(
      (result?.rows?.[0] as { completedCount: string })?.completedCount ?? "0",
      10,
    );
  }

  private async findSilentFailures(db: BossDb): Promise<{
    threadsWithLinksNoStatus: number;
    recentSilentFailures: Array<{
      threadId: string;
      links: string;
      lastAttempted: string;
    }>;
  }> {
    interface ThreadMetadataRow {
      id: string;
      userId: string;
      githubMetadata: string;
      updatedAt: string;
    }
    const result = await db.executeSql(`
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

    for (const row of (result?.rows ?? []) as ThreadMetadataRow[]) {
      try {
        const decrypted = EncryptionHelper.tryDecrypt(row.githubMetadata);
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
        const hasAnyStatus = metadata.links.some((len) => len.status);
        if (!hasAnyStatus) {
          threadsWithLinksNoStatus++;
          if (recentSilentFailures.length < 10) {
            const linkDescriptions = metadata.links
              .map(
                (len) =>
                  `${len.owner ?? "?"}/${len.repo ?? "?"}#${len.number ?? "?"}`,
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

    return { threadsWithLinksNoStatus, recentSilentFailures };
  }

  @Post("admin/test-token")
  @UseGuards(AdminGuard)
  async testUserToken(
    @Body() body: { userId: string; testOwner?: string; testRepo?: string },
  ) {
    const { userId, testOwner, testRepo } = body;

    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (!user.githubToken) {
      return { hasToken: false, valid: false };
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
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
  async createConnectToken(
    @Request() req,
    @Body() body?: { includeRepo?: boolean },
  ) {
    const { userId } = req.user;
    const token = this.githubAppService.createConnectToken(
      userId,
      body?.includeRepo ?? false,
    );
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

    const payload = this.githubAppService.verifyConnectToken(token);
    if (!payload) {
      this.logger.error("Invalid or expired connect token");
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }

    const authUrl = this.githubAppService.getAuthorizationUrl(
      payload.userId,
      payload.includeRepo ?? false,
    );
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

      const statePayload = this.githubAppService.verifyConnectToken(state);
      if (!statePayload) {
        this.logger.error("Invalid or expired state parameter");
        return res.redirect(`${frontendUrl}/settings?github=error`);
      }

      const accessToken =
        await this.githubAppService.exchangeCodeForToken(code);

      await this.githubAppService.storeTokenForUser(
        statePayload.userId,
        accessToken,
      );

      // Persist the connected GitHub login so we can match the user against PR
      // authors / requested reviewers later. Best-effort: token storage above is
      // what makes the connection usable; the login is only a quality-of-signal
      // boost for inbox grouping + priority.
      try {
        const userInfo = await this.githubAppService.getUserInfo(accessToken);
        if (userInfo?.login) {
          await this.githubAppService.storeGithubUsernameForUser(
            statePayload.userId,
            userInfo.login,
          );
        }
      } catch (error) {
        const errorMessage = isError(error) ? error.message : "Unknown error";
        this.logger.warn(
          `Connected GitHub for user ${statePayload.userId} but failed to fetch login: ${errorMessage}`,
        );
      }

      // Idempotently seed the two reserved GitHub categories (PRs awaiting
      // your review / Bot updates) so the metadata processor can route
      // threads into them without a race.
      try {
        await this.githubCategoryOverrideService.bootstrapReservedCategoriesForUser(
          statePayload.userId,
        );
      } catch (error) {
        const errorMessage = isError(error) ? error.message : "Unknown error";
        this.logger.warn(
          `Failed to bootstrap reserved GitHub categories for user ${statePayload.userId}: ${errorMessage}`,
        );
      }

      this.logger.log(
        `GitHub OAuth successful for user ${statePayload.userId}`,
      );
      return res.redirect(settingsUrl);
    } catch (error) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(`GitHub OAuth callback error: ${errorMessage}`, error);
      return res.redirect(`${frontendUrl}/settings?github=error`);
    }
  }
}
