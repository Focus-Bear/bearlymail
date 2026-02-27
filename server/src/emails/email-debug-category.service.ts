import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";

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
  };
  emailCategories: Array<{ name: string; description?: string }>;
  protoCategories: Array<{ name: string; description?: string }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
}

@Injectable()
export class EmailDebugCategoryService {
  constructor(private dataSource: DataSource) {}

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
  ): Promise<CategoryDebugData> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error(`Email ${emailId} not found for user ${userId}`);
    }

    const thread = email.emailThreadId
      ? await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId },
        })
      : null;

    const [contexts, protoCategories] = await Promise.all([
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

    return {
      email: {
        from: email.from || "",
        fromName: email.fromName || "",
        senderJobTitle: email.senderJobTitle || "",
        subject: email.subject || "",
        bodyPreview,
      },
      thread: {
        category: thread?.category || null,
        categoryExplanation: thread?.categoryExplanation || null,
      },
      emailCategories,
      protoCategories: protoCategories.map((pc) => ({
        name: pc.name,
        description: pc.description || undefined,
      })),
      userContext,
    };
  }

  private parseEmailCategories(
    contexts: UserContext[],
  ): Array<{ name: string; description?: string }> {
    return contexts
      .filter((c) => c.contextKey === ContextKey.EMAIL_CATEGORY)
      .map((c) => {
        const parts = c.contextValue.split(" - ");
        return {
          name: parts[0].trim(),
          description:
            parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined,
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
        .filter((c) => c.contextKey === ContextKey.URGENT)
        .map((c) => ({
          value: c.contextValue,
          explanation: c.explanation || undefined,
        })),
      notUrgentItems: contexts
        .filter((c) => c.contextKey === ContextKey.NOT_IMPORTANT)
        .map((c) => ({
          value: c.contextValue,
          explanation: c.explanation || undefined,
        })),
      goals: contexts
        .filter((c) => c.contextKey === ContextKey.MY_GOALS)
        .map((c) => ({
          value: c.contextValue,
          priority: c.priority || undefined,
        })),
      workingOn: contexts
        .filter((c) => c.contextKey === ContextKey.WORKING_ON)
        .map((c) => ({
          value: c.contextValue,
          priority: c.priority || undefined,
        })),
      dontCare: contexts
        .filter((c) => c.contextKey === ContextKey.DONT_CARE)
        .map((c) => ({ value: c.contextValue })),
    };
  }
}
