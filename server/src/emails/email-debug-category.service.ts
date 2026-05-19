import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { CategoryShortlistService } from "../llm/category-shortlist.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { protoCategoryKey } from "../utils/category-key.util";
import {
  parseCategoryValue,
  resolveCategoryName,
} from "../utils/category-name.util";

export interface CategoryDebugData {
  email: {
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
  };
  thread: {
    category: string | null;
    categoryExplanation: string | null;
    categorySource: "summary" | "priority" | null;
    /** Category names that were shortlisted and passed to the smart model during the last priority analysis. Null means shortlisting was not applicable or not yet run. */
    shortlistedCategoryNames: string[] | null;
  };
  emailCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string | null;
  }>;
  protoCategories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
  /**
   * Present when `deep` was requested: deterministic rules, shortlist pass, and a fresh smart-model run.
   * The smart step may invoke shortlisting again internally (same as production priority analysis).
   */
  categorizationTrace?: CategorizationTrace;
}

export interface CategorizationTrace {
  deterministicRules: Awaited<
    ReturnType<CategoryRulesService["getDeterministicRulesDebug"]>
  >;
  shortlist: {
    skipped: boolean;
    skipReason?: string;
    categoryNames: string[];
    error?: string;
  };
  smartModel: {
    category: string;
    categoryExplanation: string;
    categoryConfidence?: string;
    error?: string;
    /** When a deterministic rule won, the LLM's category before production overrides it. */
    llmCategoryBeforeRuleOverride?: string;
    llmExplanationBeforeRuleOverride?: string;
  };
}

@Injectable()
export class EmailDebugCategoryService {
  private readonly logger = new Logger(EmailDebugCategoryService.name);

  constructor(
    private dataSource: DataSource,
    private categoryRulesService: CategoryRulesService,
    private categoryShortlistService: CategoryShortlistService,
    private priorityAnalysisService: PriorityAnalysisService,
  ) {}

  private get emailRepository() {
    return this.dataSource.getRepository(Email);
  }

  private get emailThreadRepository() {
    return this.dataSource.getRepository(EmailThread);
  }

  private get userContextRepository() {
    return this.dataSource.getRepository(UserContext);
  }

  private get protoCategoryRepository() {
    return this.dataSource.getRepository(ProtoCategory);
  }

  async getCategoryDebugData(
    userId: string,
    emailId: string,
    options?: { deep?: boolean },
  ): Promise<CategoryDebugData> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    const thread = email.emailThreadId
      ? await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId },
        })
      : null;

    const [contexts, protoCategoryEntities] = await Promise.all([
      this.userContextRepository.find({ where: { userId } }),
      this.protoCategoryRepository.find({
        where: { userId, isPromoted: false },
        order: { emailCount: "DESC", createdAt: "DESC" },
      }),
    ]);

    const emailCategories = this.parseEmailCategories(contexts);
    const userContext = this.buildUserContext(contexts);
    const bodyPreview = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
    );

    const categoryName = resolveCategoryName(thread?.categoryId, contexts);

    const protoCategories = protoCategoryEntities.map((pc) => ({
      id: pc.id,
      name: pc.name,
      description: pc.description || undefined,
      categoryKey: protoCategoryKey(pc.id),
    }));

    const base: CategoryDebugData = {
      email: {
        from: email.from || "",
        fromName: email.fromName || "",
        senderJobTitle: email.senderJobTitle || "",
        subject: email.subject || "",
        bodyPreview,
      },
      thread: {
        category: categoryName,
        categoryExplanation: thread?.categoryExplanation || null,
        categorySource: thread?.categorySource || null,
        shortlistedCategoryNames: thread?.shortlistedCategoryNames ?? null,
      },
      emailCategories,
      protoCategories,
      userContext,
    };

    if (!options?.deep) {
      return base;
    }

    const categorizationTrace = await this.buildCategorizationTrace(
      userId,
      email,
      emailCategories,
      protoCategories,
      userContext,
    );

    return { ...base, categorizationTrace };
  }

  private async buildCategorizationTrace(
    userId: string,
    email: Email,
    emailCategories: CategoryDebugData["emailCategories"],
    protoCategories: CategoryDebugData["protoCategories"],
    userContext: CategoryDebugData["userContext"],
  ): Promise<CategorizationTrace> {
    const allCombined = [...emailCategories, ...protoCategories];
    const cleanedForShortlist = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );
    const meta = {
      from: email.from || "",
      subject: email.subject || "",
      bodyTextForMatch: cleanedForShortlist,
    };
    const deterministicRules =
      await this.categoryRulesService.getDeterministicRulesDebug(userId, meta);
    const { winningRule } = deterministicRules;
    const bodyForPriorityLlm = winningRule
      ? `[Category pre-assigned by deterministic rule: "${winningRule.categoryName}". Focus on urgency and goal-alignment scoring only.]\n\n${email.body || ""}`
      : email.body || "";

    const shortlist = await this.buildDebugShortlistTrace(
      userId,
      email,
      allCombined,
      cleanedForShortlist,
    );
    const smartModel = await this.buildDebugSmartModelTrace({
      userId,
      email,
      bodyForPriorityLlm,
      winningRule,
      userContext,
      emailCategories,
      protoCategories,
    });

    return { deterministicRules, shortlist, smartModel };
  }

  private async buildDebugShortlistTrace(
    userId: string,
    email: Email,
    allCombined: Array<
      | CategoryDebugData["emailCategories"][number]
      | CategoryDebugData["protoCategories"][number]
    >,
    cleanedForShortlist: string,
  ): Promise<CategorizationTrace["shortlist"]> {
    if (!this.categoryShortlistService.isShortlistEnabled(allCombined.length)) {
      return {
        skipped: true,
        skipReason: `Category count (${allCombined.length}) is at or below the shortlist threshold; full list is passed to the smart model.`,
        categoryNames: allCombined.map((category) => category.name),
      };
    }
    try {
      const shortlisted = await this.categoryShortlistService.getShortlist(
        {
          from: email.from || "",
          fromName: email.fromName || undefined,
          subject: email.subject || "",
          summary: cleanedForShortlist,
        },
        allCombined,
      );
      return {
        skipped: false,
        categoryNames: shortlisted.map((category) => category.name),
      };
    } catch (err) {
      this.logger.warn(
        `Category debug shortlist failed for user ${userId}: ${(err as Error).message}`,
      );
      return {
        skipped: false,
        categoryNames: [],
        error: (err as Error).message,
      };
    }
  }

  private async buildDebugSmartModelTrace(options: {
    userId: string;
    email: Email;
    bodyForPriorityLlm: string;
    winningRule: CategorizationTrace["deterministicRules"]["winningRule"];
    userContext: CategoryDebugData["userContext"];
    emailCategories: CategoryDebugData["emailCategories"];
    protoCategories: CategoryDebugData["protoCategories"];
  }): Promise<CategorizationTrace["smartModel"]> {
    const {
      userId,
      email,
      bodyForPriorityLlm,
      winningRule,
      userContext,
      emailCategories,
      protoCategories,
    } = options;
    try {
      const priorityUserContext = {
        urgentItems: userContext.urgentItems,
        notUrgentItems: userContext.notUrgentItems,
        goals: userContext.goals,
        workingOn: userContext.workingOn,
        dontCare: userContext.dontCare,
        emailCategories,
        protoCategories,
      };
      const result = await this.priorityAnalysisService.analyzePriority({
        email: {
          from: email.from || "",
          fromName: email.fromName || undefined,
          senderJobTitle: email.senderJobTitle || undefined,
          subject: email.subject || "",
          body: bodyForPriorityLlm,
        },
        userId,
        userContext: priorityUserContext,
      });
      if (winningRule) {
        const kindOrType = winningRule.ruleType ?? winningRule.ruleKind;
        return {
          category: winningRule.categoryName,
          categoryExplanation: `Matched deterministic rule (${kindOrType}): category="${winningRule.categoryName}"`,
          llmCategoryBeforeRuleOverride: result.category,
          llmExplanationBeforeRuleOverride: result.categoryExplanation,
        };
      }
      return {
        category: result.category,
        categoryExplanation: result.categoryExplanation,
        categoryConfidence: result.categoryConfidence,
      };
    } catch (err) {
      this.logger.warn(
        `Category debug analyzePriority failed for user ${userId}: ${(err as Error).message}`,
      );
      return {
        category: "",
        categoryExplanation: "",
        error: (err as Error).message,
      };
    }
  }

  private parseEmailCategories(
    contexts: UserContext[],
  ): CategoryDebugData["emailCategories"] {
    return contexts
      .filter((category) => category.contextKey === ContextKey.EMAIL_CATEGORY)
      .map((category) => {
        const { name, description } = parseCategoryValue(category.contextValue);
        return {
          id: category.contextId,
          name,
          description: description ?? undefined,
          categoryKey: category.categoryKey ?? undefined,
        };
      });
  }

  private buildUserContext(contexts: UserContext[]): {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  } {
    return {
      urgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.URGENT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      notUrgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.NOT_IMPORTANT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      goals: contexts
        .filter((item) => item.contextKey === ContextKey.MY_GOALS)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      workingOn: contexts
        .filter((item) => item.contextKey === ContextKey.WORKING_ON)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      dontCare: contexts
        .filter((item) => item.contextKey === ContextKey.DONT_CARE)
        .map((item) => ({ value: item.contextValue })),
    };
  }
}
