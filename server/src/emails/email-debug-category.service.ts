import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";

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
      .filter((category) => category.contextKey === ContextKey.EMAIL_CATEGORY)
      .map((category) => {
        const parts = category.contextValue.split(" - ");
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
