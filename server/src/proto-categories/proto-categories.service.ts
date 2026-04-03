import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { CategoryKeyAssignmentService } from "../category-keys/category-key-assignment.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { parseCategoryName } from "../utils/category-name.util";

@Injectable()
export class ProtoCategoriesService {
  private readonly logger = new Logger(ProtoCategoriesService.name);

  constructor(
    @InjectRepository(ProtoCategory)
    private protoCategoryRepository: Repository<ProtoCategory>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectDataSource()
    private dataSource: DataSource,
    private categoryKeyAssignmentService: CategoryKeyAssignmentService,
  ) {}

  /**
   * Find a proto category by name for a user
   */
  async findByName(
    userId: string,
    name: string,
  ): Promise<ProtoCategory | null> {
    const candidates = await this.protoCategoryRepository.find({
      where: { userId, isPromoted: false },
    });
    return candidates.find((category) => category.name === name) || null;
  }

  /**
   * Find all active (non-promoted) proto categories for a user
   */
  async findActiveByUser(userId: string): Promise<ProtoCategory[]> {
    return this.protoCategoryRepository.find({
      where: { userId, isPromoted: false },
      order: { emailCount: "DESC", createdAt: "DESC" },
    });
  }

  /**
   * Create a new proto category and assign it to the thread
   * Returns the created proto category
   */
  async createAndAssignToThread(
    userId: string,
    name: string,
    description: string | null,
    threadId: string,
  ): Promise<ProtoCategory> {
    // Check if proto category already exists
    let protoCategory = await this.findByName(userId, name);

    if (protoCategory) {
      // If it exists, just assign the thread to it
      return this.assignThreadToProtoCategory(protoCategory.id, threadId);
    }

    // Create new proto category
    protoCategory = this.protoCategoryRepository.create({
      userId,
      name,
      description,
      emailCount: 1,
      isPromoted: false,
    });

    protoCategory = await this.protoCategoryRepository.save(protoCategory);

    // Assign thread to proto category
    await this.emailThreadRepository.update(
      { id: threadId },
      { protoCategoryId: protoCategory.id },
    );

    this.logger.log(
      `Created proto category "${name}" for user ${userId}, assigned to thread ${threadId}`,
    );

    return protoCategory;
  }

  /**
   * Assign a thread to an existing proto category and increment count
   * Triggers promotion if count exceeds threshold
   */
  async assignThreadToProtoCategory(
    protoCategoryId: string,
    threadId: string,
  ): Promise<ProtoCategory> {
    // Assign thread to proto category
    await this.emailThreadRepository.update(
      { id: threadId },
      { protoCategoryId },
    );

    // Increment email count
    await this.protoCategoryRepository.increment(
      { id: protoCategoryId },
      "emailCount",
      1,
    );

    // Fetch updated proto category
    const protoCategory = await this.protoCategoryRepository.findOne({
      where: { id: protoCategoryId },
    });

    if (!protoCategory) {
      throw new NotFoundException(
        `Proto category ${protoCategoryId} not found`,
      );
    }

    this.logger.log(
      `Assigned thread ${threadId} to proto category "${protoCategory.name}" (count: ${protoCategory.emailCount})`,
    );

    // Check if we should promote
    if (protoCategory.emailCount >= ProtoCategory.PROMOTION_THRESHOLD) {
      return this.promoteToCategory(protoCategory);
    }

    return protoCategory;
  }

  /**
   * Promote a proto category to a real category (UserContext with EMAIL_CATEGORY key)
   */
  async promoteToCategory(
    protoCategory: ProtoCategory,
  ): Promise<ProtoCategory> {
    if (protoCategory.isPromoted) {
      this.logger.warn(
        `Proto category "${protoCategory.name}" is already promoted`,
      );
      return protoCategory;
    }

    this.logger.log(
      `Promoting proto category "${protoCategory.name}" to real category (count: ${protoCategory.emailCount})`,
    );

    // Create UserContext for the new category
    const categoryValue = protoCategory.description
      ? `${protoCategory.name} - ${protoCategory.description}`
      : protoCategory.name;

    const categoryKey =
      await this.categoryKeyAssignmentService.allocateKeyForNewCategory(
        protoCategory.userId,
        protoCategory.name,
      );

    const userContext = this.userContextRepository.create({
      userId: protoCategory.userId,
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: categoryValue,
      categoryKey,
      source: Source.AUTOGENERATED,
      explanation: `Auto-promoted from proto category after ${protoCategory.emailCount} emails were categorized similarly`,
    });

    const savedContext = await this.userContextRepository.save(userContext);

    // Mark proto category as promoted
    await this.protoCategoryRepository.update(
      { id: protoCategory.id },
      {
        isPromoted: true,
        promotedCategoryId: savedContext.contextId,
      },
    );

    // Update all threads with this proto category to use the promoted category UUID.
    await this.emailThreadRepository.update(
      { protoCategoryId: protoCategory.id },
      {
        categoryId: savedContext.contextId,
        categoryExplanation: `Promoted from proto category: ${protoCategory.description || "No description"}`,
        protoCategoryId: null,
      },
    );

    this.logger.log(
      `Successfully promoted proto category "${protoCategory.name}" to real category (contextId: ${savedContext.contextId})`,
    );

    // Return updated proto category
    const updated = await this.protoCategoryRepository.findOne({
      where: { id: protoCategory.id },
    });

    return updated || protoCategory;
  }

  /**
   * Check if a suggested proto-category name matches an existing full category.
   * Returns `{ name, contextId }` if a match is found, or `null` otherwise.
   * The `contextId` is the UUID of the matching UserContext row — callers can
   * store it directly as `thread.categoryId` (fix #1146).
   */
  async findMatchingFullCategory(
    userId: string,
    suggestedName: string,
  ): Promise<{ name: string; contextId: string } | null> {
    // Get all existing categories from UserContext
    const categories = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });

    const normalizedSuggestion = suggestedName.toLowerCase().trim();
    const suggestionWithoutEmoji = normalizedSuggestion
      .replace(/[\p{Emoji}]/gu, "")
      .trim();
    // Strip parenthetical suffix from suggestion: "Name (description)" → "Name"
    const suggestionWithoutParens = suggestionWithoutEmoji
      .replace(/\s*\(.*\)\s*$/, "")
      .trim();

    for (const category of categories) {
      // contextValue can be "Category Name" or "Category Name - Description"
      const categoryName = parseCategoryName(category.contextValue);
      const normalizedName = categoryName.toLowerCase().trim();
      const nameWithoutEmoji = normalizedName
        .replace(/[\p{Emoji}]/gu, "")
        .trim();

      // Check if names match (ignoring emoji and case) — also match
      // parenthetical LLM variants e.g. "Customer feedback (github issues…)"
      // against stored name "Customer feedback" (fix #1120).
      if (
        suggestionWithoutEmoji === nameWithoutEmoji ||
        normalizedSuggestion === normalizedName ||
        suggestionWithoutParens === nameWithoutEmoji
      ) {
        // Return both the canonical name (with emoji) and its UUID
        return { name: categoryName, contextId: category.contextId };
      }
    }

    return null;
  }

  /**
   * Find the best matching proto category for an email based on LLM suggestion
   * Returns null if no good match is found
   */
  async findMatchingProtoCategory(
    userId: string,
    suggestedName: string,
  ): Promise<ProtoCategory | null> {
    // First try exact match
    const exactMatch = await this.findByName(userId, suggestedName);
    if (exactMatch) {
      return exactMatch;
    }

    // Get all active proto categories for fuzzy matching
    const activeCategories = await this.findActiveByUser(userId);

    // Try to find a similar category (case-insensitive, trimmed)
    const normalizedSuggestion = suggestedName.toLowerCase().trim();
    for (const category of activeCategories) {
      const normalizedName = category.name.toLowerCase().trim();
      // Check if names are similar (either contains the other, or same base name ignoring emoji)
      const suggestionWithoutEmoji = normalizedSuggestion
        .replace(/[\p{Emoji}]/gu, "")
        .trim();
      const nameWithoutEmoji = normalizedName
        .replace(/[\p{Emoji}]/gu, "")
        .trim();

      if (
        suggestionWithoutEmoji === nameWithoutEmoji ||
        normalizedSuggestion.includes(nameWithoutEmoji) ||
        normalizedName.includes(suggestionWithoutEmoji)
      ) {
        return category;
      }
    }

    return null;
  }

  async updateProtoCategoryName(
    userId: string,
    protoCategoryId: string,
    name: string,
  ): Promise<ProtoCategory> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException("Proto category name cannot be empty");
    }

    const protoCategory = await this.findActiveById(userId, protoCategoryId);
    if (!protoCategory) {
      throw new NotFoundException(
        `Proto category ${protoCategoryId} not found or already promoted`,
      );
    }

    const activeCategories = await this.findActiveByUser(userId);
    const hasDuplicate = activeCategories.some(
      (category) =>
        category.id !== protoCategoryId &&
        category.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (hasDuplicate) {
      throw new ConflictException(
        `A proto category named "${trimmedName}" already exists`,
      );
    }

    await this.protoCategoryRepository.update(
      { id: protoCategoryId, userId, isPromoted: false },
      { name: trimmedName },
    );

    const updated = await this.findActiveById(userId, protoCategoryId);
    if (!updated) {
      throw new NotFoundException(
        `Proto category ${protoCategoryId} not found or already promoted`,
      );
    }

    this.logger.log(
      `Updated proto category ${protoCategoryId} name to "${trimmedName}" for user ${userId}`,
    );

    return updated;
  }

  /**
   * Find a specific proto category by ID for a user (must not be promoted)
   */
  async findActiveById(
    userId: string,
    id: string,
  ): Promise<ProtoCategory | null> {
    return this.protoCategoryRepository.findOne({
      where: { id, userId, isPromoted: false },
    });
  }

  /**
   * Delete a proto category and clear its reference from threads.
   * Wrapped in a transaction so the thread-nullification and the delete are atomic.
   */
  async deleteProtoCategory(
    userId: string,
    protoCategoryId: string,
  ): Promise<void> {
    const protoCategory = await this.protoCategoryRepository.findOne({
      where: { id: protoCategoryId, userId },
    });

    if (!protoCategory) {
      throw new NotFoundException(
        `Proto category ${protoCategoryId} not found for user ${userId}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Clear proto category reference from all threads first
      await manager.update(
        EmailThread,
        { protoCategoryId: protoCategory.id },
        { protoCategoryId: null },
      );

      await manager.delete(ProtoCategory, { id: protoCategoryId, userId });
    });

    this.logger.log(
      `Deleted proto category "${protoCategory.name}" for user ${userId}`,
    );
  }

  /**
   * Get proto category statistics for a user
   */
  async getStats(userId: string): Promise<{
    activeCount: number;
    promotedCount: number;
    categories: Array<{
      id: string;
      name: string;
      emailCount: number;
      isPromoted: boolean;
    }>;
  }> {
    const categories = await this.protoCategoryRepository.find({
      where: { userId },
      order: { isPromoted: "ASC", emailCount: "DESC" },
    });

    return {
      activeCount: categories.filter((count) => !count.isPromoted).length,
      promotedCount: categories.filter((count) => count.isPromoted).length,
      categories: categories.map((item) => ({
        id: item.id,
        name: item.name,
        emailCount: item.emailCount,
        isPromoted: item.isPromoted,
      })),
    };
  }
}
