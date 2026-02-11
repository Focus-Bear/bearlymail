import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, IsNull } from "typeorm";
import { UsersService } from "../users/users.service";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { CalendarService } from "../calendar/calendar.service";
import { ActionItem } from "../database/entities/action-item.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ActionItemsService } from "../action-items/action-items.service";
import { GitHubRepoMappingService } from "../github/github-repo-mapping.service";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { EncryptionHelper } from "../encryption/encryption.helper";

export interface SuggestedAction {
  type: string;
  confidence: number;
  reason: string;
  /** Additional action-specific metadata (varies by action type) */
  metadata?: Record<string, unknown>;
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
    private readonly actionItemsService: ActionItemsService,
    private readonly repoMappingService: GitHubRepoMappingService,
    @InjectRepository(ActionItem)
    private readonly actionItemRepository: Repository<ActionItem>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  private mapActionItemToSuggestedAction(
    actionItem: ActionItem,
  ): SuggestedAction {
    return {
      type: actionItem.actionType || "",
      confidence: actionItem.confidenceScore || 0,
      reason: actionItem.reason || actionItem.description,
      metadata: actionItem.metadata || undefined,
    };
  }

  async detectActions(
    emailId: string,
    userId: string,
  ): Promise<SuggestedAction[]> {
    try {
      const email = await this.emailsService.getEmailById(userId, emailId);
      if (!email) {
        throw new Error("Email not found");
      }

      const threadId = email.emailThreadId;
      if (!threadId) {
        this.logger.warn(
          `Email ${emailId} has no threadId, cannot cache suggested actions`,
        );
        // Fall through to generate without caching
      } else {
        // Get all existing suggested actions for thread (LLM + user-created)
        // actionType IS NOT NULL indicates suggested actions
        const existingActions = await this.actionItemRepository.find({
          where: {
            userId,
            emailThreadId: threadId,
            actionType: Not(IsNull()),
          },
        });

        // Get latest email in thread
        const threadEmails = await this.emailsService.getThreadEmails(
          userId,
          threadId,
        );
        const latestEmailId = threadEmails[0]?.id;

        // Check if LLM-generated actions exist and are still valid
        const llmActions = existingActions.filter((a) => a.source === "llm");
        const llmAction = llmActions[0]; // Check first LLM action for lastEmailId

        // Return existing actions if LLM cache is valid
        if (llmAction && llmAction.lastEmailId === latestEmailId) {
          this.logger.debug(
            `Returning cached suggested actions for thread ${threadId}`,
          );
          return existingActions.map(this.mapActionItemToSuggestedAction);
        }
      }

      // Cache invalid or missing, generate new LLM suggestions
      const user = await this.usersService.findOne(userId);
      const hasGithubToken = !!user?.githubToken;
      const hasCalendarToken = !!user?.googleCalendarAccessToken;

      // Parse GitHub links from email if they exist
      const githubLinks = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );

      // Use LLM to detect suggested actions (now with htmlBody)
      const actions = await this.llmService.detectSuggestedActions(
        {
          subject: email.subject,
          body: email.body || "",
          htmlBody: email.htmlBody || undefined,
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

      // Get thread category for repo mapping lookup
      const thread = threadId
        ? await this.emailThreadRepository.findOne({
            where: { id: threadId, userId },
          })
        : null;
      const emailCategory = thread?.category || undefined;

      // Get default repo for github_create_issue pre-fill
      const defaultRepo = hasGithubToken
        ? await this.repoMappingService.getRepoForEmail(userId, emailCategory)
        : null;

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
        if (action.type === "github_create_issue" && defaultRepo) {
          return {
            ...action,
            metadata: {
              ...action.metadata,
              defaultRepo: {
                owner: defaultRepo.owner,
                repo: defaultRepo.repo,
              },
            },
          };
        }
        return action;
      });

      // Save to ActionItem table if we have a threadId
      if (threadId) {
        // Get latest email in thread for cache tracking
        const threadEmails = await this.emailsService.getThreadEmails(
          userId,
          threadId,
        );
        const latestEmailId = threadEmails[0]?.id;

        // Delete old LLM-generated suggested actions
        await this.actionItemRepository.delete({
          emailThreadId: threadId,
          source: "llm",
          actionType: Not(IsNull()),
        });

        // Create new ActionItem records for LLM-generated suggested actions
        const llmEntities = enhancedActions.map((action) =>
          this.actionItemRepository.create({
            userId,
            emailThreadId: threadId,
            emailId: email.id,
            description: `${action.type}: ${action.reason}`,
            actionType: action.type,
            confidenceScore: action.confidence,
            reason: action.reason,
            metadata: action.metadata || undefined,
            source: "llm",
            lastEmailId: latestEmailId,
            isCompleted: false,
          }),
        );
        await this.actionItemRepository.save(llmEntities);

        // Get user-created actions to include in response
        const userActions = await this.actionItemRepository.find({
          where: {
            userId,
            emailThreadId: threadId,
            actionType: Not(IsNull()),
            source: "user",
          },
        });

        return [
          ...enhancedActions,
          ...userActions.map(this.mapActionItemToSuggestedAction),
        ];
      }

      return enhancedActions;
    } catch (error) {
      this.logger.error(`Error detecting actions for email ${emailId}:`, error);
      return [];
    }
  }
}
