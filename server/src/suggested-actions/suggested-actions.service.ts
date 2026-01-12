import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsersService } from "../users/users.service";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { CalendarService } from "../calendar/calendar.service";
import { Email } from "../database/entities/email.entity";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { EncryptionHelper } from "../encryption/encryption.helper";

export interface SuggestedAction {
  type: string;
  confidence: number;
  reason: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

@Injectable()
export class SuggestedActionsService {
  private readonly logger = new Logger(SuggestedActionsService.name);

  // eslint-disable-next-line max-params
  constructor(
    private readonly usersService: UsersService,
    private readonly emailsService: EmailsService,
    private readonly llmService: LLMService,
    private readonly githubService: GitHubService,
    private readonly githubApiService: GitHubApiService,
    private readonly calendarService: CalendarService,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  async detectActions(
    emailId: string,
    userId: string,
  ): Promise<SuggestedAction[]> {
    try {
      const email = await this.emailsService.getEmailById(userId, emailId);
      if (!email) {
        throw new Error("Email not found");
      }

      const user = await this.usersService.findOne(userId);
      const hasGithubToken = !!user?.githubToken;
      const hasCalendarToken = !!user?.googleCalendarAccessToken;

      // Parse GitHub links from email if they exist
      const githubLinks = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );

      // Use LLM to detect suggested actions
      const actions = await this.llmService.detectSuggestedActions(
        {
          subject: email.subject,
          body: email.body || "",
          from: email.from,
          fromName: email.fromName || undefined,
        },
        {
          hasGithubLinks: githubLinks.length > 0,
          githubLinks: githubLinks.map((link) => ({
            type: link.type,
            owner: link.owner,
            repo: link.repo,
            number: link.number,
          })),
          hasCalendarToken,
          hasGithubToken,
        },
        // Use default provider
        undefined,
        userId,
      );

      // Enhance actions with metadata (e.g., issue info from GitHub links)
      const enhancedActions = actions.map((action) => {
        if (
          action.type === "github_update_status" ||
          action.type === "github_add_comment"
        ) {
          // If there are GitHub links, use the first one as the issue info
          if (githubLinks.length > 0) {
            const link = githubLinks[0];
            if (link.type === "issue") {
              return {
                ...action,
                metadata: {
                  issueInfo: {
                    owner: link.owner,
                    repo: link.repo,
                    number: link.number,
                  },
                },
              };
            }
          }
        }
        return action;
      });

      return enhancedActions;
    } catch (error) {
      this.logger.error(`Error detecting actions for email ${emailId}:`, error);
      return [];
    }
  }
}
