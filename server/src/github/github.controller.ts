import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  Logger,
  Res,
  Query,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { GitHubAppService } from "./github-app.service";
import { UsersService } from "../users/users.service";
import { isError } from "../types/common";
import { EmailsService } from "../emails/emails.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";

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
      return { links: [], hasToken: false };
    }

    const token = EncryptionHelper.decrypt(user.githubToken);

    // Get all emails in thread to parse GitHub links from all of them
    const threadEmails = await this.emailRepository.find({
      where: { userId, emailThreadId: email.emailThreadId },
    });

    // Parse GitHub links from all emails in thread
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLinks = new Map<string, any>();
    // Use Map to deduplicate by URL
    for (const threadEmail of threadEmails) {
      const links = this.githubService.parseGitHubLinks(
        threadEmail.body || "",
        threadEmail.htmlBody || undefined,
      );
      for (const link of links) {
        allLinks.set(link.url, link);
      }
    }

    const uniqueLinks = Array.from(allLinks.values());

    if (uniqueLinks.length === 0) {
      return { links: [], hasToken: true };
    }

    // Check if we already have cached metadata that's less than 1 hour old
    if (thread.githubMetadata && thread.githubMetadata.links.length > 0) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Check if all links in the cache match current links and have been fetched recently
      const cachedLinksMap = new Map(
        thread.githubMetadata.links.map((link) => [link.url, link])
      );
      
      // Check if all current links are in cache and fresh
      const allLinksCachedAndFresh = uniqueLinks.every((link) => {
        const cachedLink = cachedLinksMap.get(link.url);
        if (!cachedLink || !cachedLink.status || !cachedLink.fetchedAt) {
          return false;
        }
        const fetchedAt = new Date(cachedLink.fetchedAt);
        return fetchedAt > oneHourAgo;
      });

      // If all links are cached and fresh, return cached data
      if (allLinksCachedAndFresh) {
        // Return cached links that match current links (already deduplicated via uniqueLinks)
        const cachedLinksToReturn = uniqueLinks
          .map((link) => cachedLinksMap.get(link.url))
          .filter((link) => link !== undefined);
        
        // Double-check deduplication before returning
        const seenUrls = new Set<string>();
        const dedupedLinks = cachedLinksToReturn.filter((link) => {
          const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
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
        hasToken: true,
      };
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : "Unknown error";
      this.logger.error(`Error fetching GitHub statuses: ${errorMessage}`);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLinks = new Map<string, any>();
    // Use Map to deduplicate by URL
    for (const threadEmail of threadEmails) {
      const links = this.githubService.parseGitHubLinks(
        threadEmail.body || "",
        threadEmail.htmlBody || undefined,
      );
      for (const link of links) {
        allLinks.set(link.url, link);
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

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  async connect(@Request() req, @Res() res: Response) {
    const { userId } = req.user;
    const authUrl = this.githubAppService.getAuthorizationUrl(userId);
    return res.redirect(authUrl);
  }

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

      // Decode state to get userId
      let userId: string;
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        userId = stateData.userId;
      } catch (error) {
        this.logger.error("Failed to decode state parameter:", error);
        return res.redirect(`${frontendUrl}/settings?github=error`);
      }

      // Exchange code for access token
      const accessToken = await this.githubAppService.exchangeCodeForToken(code);

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
