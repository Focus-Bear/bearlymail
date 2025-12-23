import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GitHubService } from "./github.service";
import { GitHubApiService } from "./github-api.service";
import { UsersService } from "../users/users.service";
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
    private readonly usersService: UsersService,
    private readonly emailsService: EmailsService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  @Get("emails/:id")
  async getEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const userId = req.user.userId;

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
    const allLinks = new Map<string, any>(); // Use Map to deduplicate by URL
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

    // Check if we already have metadata
    if (thread.githubMetadata && thread.githubMetadata.links.length > 0) {
      // Check if all links have been fetched recently (within 10 minutes)
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const allFetched = thread.githubMetadata.links.every((link) => {
        if (!link.status || !link.fetchedAt) return false;
        const fetchedAt = new Date(link.fetchedAt);
        return fetchedAt > tenMinutesAgo;
      });

      if (allFetched) {
        return {
          links: thread.githubMetadata.links,
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
    } catch (error: any) {
      this.logger.error(`Error fetching GitHub statuses: ${error.message}`);
      throw error;
    }
  }

  @Post("emails/:id/refresh")
  async refreshEmailGitHubInfo(@Request() req, @Param("id") emailId: string) {
    const userId = req.user.userId;

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
    const allLinks = new Map<string, any>(); // Use Map to deduplicate by URL
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
    } catch (error: any) {
      this.logger.error(`Error refreshing GitHub statuses: ${error.message}`);
      throw error;
    }
  }
}
