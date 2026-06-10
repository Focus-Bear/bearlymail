import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";

import { ActionItemsService } from "../action-items/action-items.service";
import { CalendarService } from "../calendar/calendar.service";
import {
  GITHUB_ACTION_TYPES,
  GITHUB_LINK_TYPES,
} from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { ActionItem } from "../database/entities/action-item.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { GitHubRepoMappingService } from "../github/github-repo-mapping.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";

type GitHubLinkInfo = {
  type: string;
  owner: string;
  repo: string;
  number: number;
};

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
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
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

  private async getCachedActionsForThread(
    userId: string,
    threadId: string,
  ): Promise<SuggestedAction[] | null> {
    const existingActions = await this.actionItemRepository.find({
      where: { userId, emailThreadId: threadId, actionType: Not(IsNull()) },
    });
    const threadEmails = await this.emailsService.getThreadEmails(
      userId,
      threadId,
    );
    const latestEmailId = threadEmails[0]?.id;
    const llmAction = existingActions.find((action) => action.source === "llm");
    if (llmAction && llmAction.lastEmailId === latestEmailId) {
      this.logger.debug(
        `Returning cached suggested actions for thread ${threadId}`,
      );
      return existingActions.map((item) =>
        this.mapActionItemToSuggestedAction(item),
      );
    }
    return null;
  }

  private enhanceSingleAction(
    action: SuggestedAction,
    githubLinks: GitHubLinkInfo[],
    defaultRepo: { owner: string; repo: string } | null,
  ): SuggestedAction {
    if (
      (action.type === GITHUB_ACTION_TYPES.UPDATE_STATUS ||
        action.type === GITHUB_ACTION_TYPES.ADD_COMMENT) &&
      githubLinks.length > 0
    ) {
      const link = githubLinks[0];
      if (link.type === GITHUB_LINK_TYPES.ISSUE) {
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
    if (action.type === GITHUB_ACTION_TYPES.CREATE_ISSUE && defaultRepo) {
      return {
        ...action,
        metadata: {
          ...action.metadata,
          defaultRepo: { owner: defaultRepo.owner, repo: defaultRepo.repo },
        },
      };
    }
    return action;
  }

  private async saveLLMActionsAndMerge(
    userId: string,
    email: Email,
    threadId: string,
    enhancedActions: SuggestedAction[],
  ): Promise<SuggestedAction[]> {
    const threadEmails = await this.emailsService.getThreadEmails(
      userId,
      threadId,
    );
    const latestEmailId = threadEmails[0]?.id;
    await this.actionItemRepository.delete({
      emailThreadId: threadId,
      source: "llm",
      actionType: Not(IsNull()),
    });
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
      ...userActions.map((item) => this.mapActionItemToSuggestedAction(item)),
    ];
  }

  async detectActions(
    emailId: string,
    userId: string,
  ): Promise<SuggestedAction[]> {
    try {
      const email = await this.emailsService.getEmailById(userId, emailId);
      if (!email) {
        throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
      }
      const threadId = email.emailThreadId;
      if (!threadId) {
        this.logger.warn(
          `Email ${emailId} has no threadId, cannot cache suggested actions`,
        );
      } else {
        const cached = await this.getCachedActionsForThread(userId, threadId);
        if (cached) return cached;
      }
      const user = await this.usersService.findOne(userId);
      const hasGithubToken = !!user?.githubToken;
      const hasCalendarToken = !!user?.googleCalendarAccessToken;
      const githubLinks = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );
      const actions = await this.llmService.detectSuggestedActions(
        {
          subject: email.subject,
          // Use compact summary to avoid sending full raw thread to downstream prompts.
          // Falls back to raw body if summary is not yet available (e.g. first email in a thread).
          body: email.summary ?? email.body ?? "",
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
        undefined,
        userId,
      );
      const thread = threadId
        ? await this.emailThreadRepository.findOne({
            where: { id: threadId, userId },
          })
        : null;
      // Resolve category display name from categoryId — getRepoForEmail does name-based matching.
      let emailCategory: string | undefined;
      if (thread?.categoryId) {
        const categoryCtx = await this.userContextRepository.findOne({
          where: {
            contextId: thread.categoryId,
            contextKey: ContextKey.EMAIL_CATEGORY,
          },
          select: {
            contextValue: true,
          },
        });
        if (categoryCtx) {
          decryptUserContextEntityForApi(categoryCtx);
          emailCategory = parseCategoryName(categoryCtx.contextValue);
        }
      }
      const defaultRepo = hasGithubToken
        ? await this.repoMappingService.getRepoForEmail(userId, emailCategory)
        : null;
      const enhancedActions = actions.map((action) =>
        this.enhanceSingleAction(action, githubLinks, defaultRepo),
      );
      if (threadId) {
        return await this.saveLLMActionsAndMerge(
          userId,
          email,
          threadId,
          enhancedActions,
        );
      }
      return enhancedActions;
    } catch (error) {
      this.logger.error(`Error detecting actions for email ${emailId}:`, error);
      return [];
    }
  }
}
