import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { CategoryKeyAssignmentService } from "../category-keys/category-key-assignment.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ConsideredDuplicateCandidate,
  ProtoCategory,
} from "../database/entities/proto-category.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMProvider } from "../llm/llm.types";
import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_CHECK_CATEGORY_DUPLICATE } from "../llm/llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "../llm/prompts";
import { parseCategoryName } from "../utils/category-format.util";
import { levenshteinDistance } from "../utils/levenshtein.util";
import {
  DedupCandidate,
  matchExactOrAlternateCandidate,
  mergeConsideredCandidates,
} from "./category-dedup.util";
import { MAX_BOOTSTRAP_CATEGORIES } from "./proto-categories.constants";
import {
  buildPromotedCategoryInfos,
  PromotedCategoryInfo,
} from "./proto-promotion-date.helper";
import { reassignPromotedProtoThreads } from "./proto-promotion-reassign.helper";

/**
 * Lowercases, trims, and strips decorative emoji from a category name so the
 * Levenshtein ordering of the candidate list ignores emoji and casing.
 */
function stripCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\p{Emoji}]/gu, "")
    .trim();
}

// Strong, current-generation non-lite model for duplicate decisions (a
// high-stakes, low-volume call that decides whether a brand-new category is
// created), with thinking enabled rather than the cheap shortlisting model.
// NB: "gemini-3.1-flash" does NOT exist (the 3.1 gen ships only -lite/-image);
// gemini-3.6-flash is the newest full flash. JSON reliability is guaranteed by
// DEDUP_RESPONSE_SCHEMA (structured output) below, not by the model — so a
// thinking model can't leak chain-of-thought into the verdict.
const STRONG_DEDUP_MODEL = "gemini-3.6-flash";

// Structured-output schema for the duplicate verdict. Constrained decoding
// forces exactly this shape, so `matchAgainstFullList`'s JSON parse can never
// fail open on stray prose from a thinking model. `duplicateNumber` is the
// 1-based index of the matching existing category, or 0 for "no duplicate".
const DEDUP_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    duplicateNumber: { type: "integer" },
    reasoning: { type: "string" },
  },
  required: ["duplicateNumber", "reasoning"],
  propertyOrdering: ["duplicateNumber", "reasoning"],
};

// Headroom for the strong dedup model's JSON verdict. Larger than the lite
// path's 128 because thinking models emit a little more before the JSON.
const DEDUP_MAX_TOKENS = 512;

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
    private llmCoreService: LLMCoreService,
    private configService: ConfigService,
  ) {}

  /**
   * Resolve the strong Gemini model used for duplicate decisions. Overridable
   * via the GEMINI_STRONG_MODEL env var for ops flexibility.
   */
  private get strongDedupModel(): string {
    return (
      this.configService.get<string>("GEMINI_STRONG_MODEL") ||
      STRONG_DEDUP_MODEL
    );
  }

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
   * Find all promoted proto categories that produced a live category, returning
   * the promotion metadata (timestamp, reasoning, considered candidates) keyed
   * by the live category's contextId. Used by the categories UI to surface why
   * and when each auto-generated category was created.
   */
  async findPromotedByUser(userId: string): Promise<PromotedCategoryInfo[]> {
    const promoted = await this.protoCategoryRepository.find({
      where: { userId, isPromoted: true },
      order: { promotedAt: "DESC" },
    });
    return buildPromotedCategoryInfos(promoted, this.userContextRepository);
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
    options: {
      consideredCandidates?: ConsideredDuplicateCandidate[];
      creationReasoning?: string | null;
    } = {},
  ): Promise<ProtoCategory> {
    let protoCategory = await this.findByName(userId, name);

    if (protoCategory) {
      return this.assignThreadToProtoCategory(protoCategory.id, threadId);
    }

    protoCategory = this.protoCategoryRepository.create({
      userId,
      name,
      description,
      emailCount: 1,
      isPromoted: false,
      duplicateCandidates: options.consideredCandidates?.length
        ? options.consideredCandidates
        : null,
      creationReasoning: options.creationReasoning || null,
    });

    protoCategory = await this.protoCategoryRepository.save(protoCategory);

    await this.emailThreadRepository.update(
      { id: threadId },
      { protoCategoryId: protoCategory.id },
    );

    this.logger.log(
      `Created proto category "${name}" for user ${userId}, assigned to thread ${threadId}`,
    );

    // Bootstrap mode: a user whose real-category taxonomy is still under the cap
    // (e.g. a brand-new signup whose onboarding produced few/0 categories) would
    // otherwise wait PROMOTION_THRESHOLD emails per category — far too slow, so
    // every email lands in "Other" for a long time. While under the cap, promote
    // a genuinely-new (already deduped by the caller) suggestion immediately so
    // the very next matching email is categorised into a real category.
    if (await this.isBootstrappingCategories(userId)) {
      this.logger.log(
        `Bootstrap mode: immediately promoting new proto category "${name}" for user ${userId} (real categories under cap of ${MAX_BOOTSTRAP_CATEGORIES})`,
      );
      return this.promoteToCategory(protoCategory);
    }

    return protoCategory;
  }

  /**
   * Cheap COUNT of a user's real (EMAIL_CATEGORY) categories. Used to decide
   * bootstrap mode without loading full context rows.
   */
  async countRealCategories(userId: string): Promise<number> {
    return this.userContextRepository.count({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });
  }

  /**
   * True while the user should bootstrap their category taxonomy — i.e. they
   * have fewer than {@link MAX_BOOTSTRAP_CATEGORIES} real categories. Re-checked
   * immediately before each auto-promotion so concurrent promotions can never
   * push the user past the cap.
   */
  private async isBootstrappingCategories(userId: string): Promise<boolean> {
    return (await this.countRealCategories(userId)) < MAX_BOOTSTRAP_CATEGORIES;
  }

  /**
   * Assign a thread to an existing proto category and increment count
   * Triggers promotion if count exceeds threshold
   */
  async assignThreadToProtoCategory(
    protoCategoryId: string,
    threadId: string,
  ): Promise<ProtoCategory> {
    await this.emailThreadRepository.update(
      { id: threadId },
      { protoCategoryId },
    );

    await this.protoCategoryRepository.increment(
      { id: protoCategoryId },
      "emailCount",
      1,
    );

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

    // Re-run the dedup check against the *current* set of real categories using
    // the stronger model. The check that ran when this proto was created
    // compared against an older snapshot — a sibling proto may have promoted
    // into a near-duplicate real category in the meantime. Record what was
    // considered so the UI can explain the promotion decision.
    const considered: ConsideredDuplicateCandidate[] = [];
    const existingMatch = await this.findMatchingFullCategory(
      protoCategory.userId,
      protoCategory.name,
      considered,
    );
    const mergedCandidates = mergeConsideredCandidates(
      protoCategory.duplicateCandidates,
      considered,
    );
    const promotedAt = new Date();

    if (existingMatch) {
      this.logger.log(
        `Proto category "${protoCategory.name}" matches existing category "${existingMatch.name}" — folding in instead of creating a duplicate`,
      );
      return this.foldProtoIntoCategory(
        protoCategory,
        existingMatch,
        mergedCandidates,
        promotedAt,
      );
    }

    const categoryValue = protoCategory.description
      ? `${protoCategory.name} - ${protoCategory.description}`
      : protoCategory.name;

    const categoryKey =
      await this.categoryKeyAssignmentService.allocateKeyForNewCategory(
        protoCategory.userId,
        protoCategory.name,
      );

    const promotionReasoning = `Auto-promoted after ${protoCategory.emailCount} emails were categorized similarly, and a stronger model confirmed it was not a duplicate of any existing category.`;

    const userContext = this.userContextRepository.create({
      userId: protoCategory.userId,
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: categoryValue,
      categoryKey,
      source: Source.AUTOGENERATED,
      explanation: promotionReasoning,
    });

    const savedContext = await this.userContextRepository.save(userContext);

    await this.protoCategoryRepository.update(
      { id: protoCategory.id },
      {
        isPromoted: true,
        promotedCategoryId: savedContext.contextId,
        promotedAt,
        promotionReasoning,
        duplicateCandidates: mergedCandidates.length ? mergedCandidates : null,
      },
    );

    await reassignPromotedProtoThreads(this.emailThreadRepository, {
      protoCategoryId: protoCategory.id,
      targetCategoryId: savedContext.contextId,
      targetCategoryName: protoCategory.name,
      categoryExplanation: `Promoted from proto category: ${protoCategory.description || "No description"}`,
      traceDetail: `Auto-promoted from proto category "${protoCategory.name}" after ${protoCategory.emailCount} emails; this thread was bulk-reassigned by the promotion, not by per-thread priority analysis.`,
      promotedAt,
    });

    this.logger.log(
      `Successfully promoted proto category "${protoCategory.name}" to real category (contextId: ${savedContext.contextId})`,
    );

    const updated = await this.protoCategoryRepository.findOne({
      where: { id: protoCategory.id },
    });

    return updated || protoCategory;
  }

  /**
   * Marks a proto category as promoted into an *existing* real category instead
   * of creating a new one. Reassigns the proto's threads to the existing
   * category and records the promotion decision (timestamp, reasoning, and the
   * candidates the dedup pass considered) so the UI can explain it.
   */
  private async foldProtoIntoCategory(
    protoCategory: ProtoCategory,
    existingMatch: { name: string; contextId: string },
    consideredCandidates: ConsideredDuplicateCandidate[],
    promotedAt: Date,
  ): Promise<ProtoCategory> {
    const promotionReasoning = `Merged into existing category "${existingMatch.name}" — a stronger model judged this proto category to be a duplicate of it.`;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProtoCategory).update(
        { id: protoCategory.id },
        {
          isPromoted: true,
          promotedCategoryId: existingMatch.contextId,
          promotedAt,
          promotionReasoning,
          duplicateCandidates: consideredCandidates.length
            ? consideredCandidates
            : null,
        },
      );

      await reassignPromotedProtoThreads(manager.getRepository(EmailThread), {
        protoCategoryId: protoCategory.id,
        targetCategoryId: existingMatch.contextId,
        targetCategoryName: existingMatch.name,
        categoryExplanation: `Folded into existing category on promotion (proto: ${protoCategory.name})`,
        traceDetail: `Folded proto category "${protoCategory.name}" into existing category "${existingMatch.name}" on promotion; this thread was bulk-reassigned, not set by per-thread priority analysis.`,
        promotedAt,
      });
    });

    const updated = await this.protoCategoryRepository.findOne({
      where: { id: protoCategory.id },
    });

    return updated || protoCategory;
  }

  /**
   * Check if a suggested proto-category name matches an existing full category.
   *
   * Matching is done in two phases (cheapest first):
   *  1. Exact / emoji-stripped / parenthetical-suffix / alternate-name match
   *  2. A single LLM call that sees the ENTIRE candidate list and picks the one
   *     duplicate (or none) — no lexical/embedding pre-filter to crowd out the
   *     correct match before the model sees it.
   *
   * When a near-duplicate is confirmed by the LLM, the suggested name is
   * persisted as an alternate name on the matching category so future calls
   * skip the LLM.
   *
   * Returns `{ name, contextId }` if a match is found, or `null` otherwise.
   * The `contextId` is the UUID of the matching UserContext row — callers can
   * store it directly as `thread.categoryId` (fix #1146).
   */
  async findMatchingFullCategory(
    userId: string,
    suggestedName: string,
    considered?: ConsideredDuplicateCandidate[],
  ): Promise<{ name: string; contextId: string } | null> {
    const categories = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });

    const byId = new Map<string, UserContext>();
    const candidates: DedupCandidate[] = categories.map((category) => {
      byId.set(category.contextId, category);
      return {
        id: category.contextId,
        name: parseCategoryName(category.contextValue),
        alternateNames: category.alternateNames,
      };
    });

    const match = await this.matchSuggestionAgainstCandidates({
      suggestedName,
      candidates,
      userId,
      considered,
      // A confirmed real-category duplicate is persisted as an alternate name so
      // future lookups skip the LLM entirely.
      onConfirmed: async (candidate) => {
        const category = byId.get(candidate.id);
        if (category) await this.saveAlternateName(category, suggestedName);
      },
    });

    return match ? { name: match.name, contextId: match.id } : null;
  }

  /**
   * Runs the duplicate-detection pipeline for `suggestedName` against a
   * normalized `candidates` set and returns the matching candidate, or null.
   * Two phases run cheapest-first:
   *  1. Exact / emoji-stripped / parenthetical-suffix / alternate-name match
   *  2. A single LLM call ({@link matchAgainstFullList}) that sees the WHOLE
   *     candidate list and picks the one duplicate (or none). There is no
   *     lexical/embedding pre-filter that could crowd out the correct match
   *     before the model sees it.
   *
   * Both the real-category and proto-category matchers feed this one
   * implementation so they never drift apart. `onConfirmed` (optional) persists
   * a confirmed match — real categories store an alternate name; protos don't.
   * `excludeId` drops a candidate from matching so a thread's own proto can't
   * match itself. An LLM failure returns null so the caller falls through to
   * creating a proto rather than aborting.
   */
  private async matchSuggestionAgainstCandidates(params: {
    suggestedName: string;
    candidates: DedupCandidate[];
    userId: string;
    considered?: ConsideredDuplicateCandidate[];
    excludeId?: string;
    onConfirmed?: (candidate: DedupCandidate) => Promise<void>;
  }): Promise<DedupCandidate | null> {
    const { suggestedName, userId, considered, excludeId, onConfirmed } =
      params;
    const candidates = excludeId
      ? params.candidates.filter((candidate) => candidate.id !== excludeId)
      : params.candidates;
    if (candidates.length === 0) return null;

    const exactOrAlternate = matchExactOrAlternateCandidate(
      suggestedName,
      candidates,
    );
    if (exactOrAlternate) return exactOrAlternate;

    const match = await this.matchAgainstFullList(
      suggestedName,
      candidates,
      userId,
      considered,
    );
    if (match && onConfirmed) await onConfirmed(match);
    return match;
  }

  /**
   * Sends the ENTIRE candidate list to the strong dedup model in one call and
   * returns the single candidate it flags as a duplicate of `suggestedName`, or
   * null. The list is ordered by Levenshtein distance (closest first) before it
   * is numbered so the nearest lexical matches head the list and the model's
   * chosen number resolves against that same ordering. No candidate is dropped.
   *
   * Any LLM/parse failure logs a warning and returns null so the caller falls
   * through to creating a proto rather than throwing.
   */
  private async matchAgainstFullList(
    suggestedName: string,
    candidates: DedupCandidate[],
    userId: string,
    considered?: ConsideredDuplicateCandidate[],
  ): Promise<DedupCandidate | null> {
    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.CHECK_CATEGORY_DUPLICATE);
    if (!promptConfig) {
      this.logger.error(
        "[CHECK-CATEGORY-DUPLICATE] check_category_duplicate prompt not found",
      );
      return null;
    }

    const suggestionWithoutEmoji = stripCategoryName(suggestedName);
    const orderedCandidates = [...candidates].sort(
      (left, right) =>
        levenshteinDistance(
          suggestionWithoutEmoji,
          stripCategoryName(left.name),
        ) -
        levenshteinDistance(
          suggestionWithoutEmoji,
          stripCategoryName(right.name),
        ),
    );

    const categoryList = orderedCandidates
      .map((candidate, index) => `${index + 1}. ${candidate.name}`)
      .join("\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      newCategory: suggestedName,
      categoryList,
    });

    let response: string;
    try {
      response = await this.llmCoreService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0,
          maxTokens: DEDUP_MAX_TOKENS,
          jsonMode: true,
          // Structured output guarantees a parseable {duplicateNumber, reasoning}
          // even with a thinking model, so the verdict never fails open on a
          // chain-of-thought leak (see LLMRequest.responseSchema).
          responseSchema: DEDUP_RESPONSE_SCHEMA,
          operation: LLM_OP_CHECK_CATEGORY_DUPLICATE,
          model: this.strongDedupModel,
          thinking: true,
        },
        LLMProvider.GEMINI,
        userId,
      );
    } catch (err) {
      this.logger.warn(
        `[CHECK-CATEGORY-DUPLICATE] LLM call failed for "${suggestedName}": ${err}`,
      );
      return null;
    }

    const jsonMatch = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
      .match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      this.logger.warn(
        `[CHECK-CATEGORY-DUPLICATE] No JSON in response for "${suggestedName}"`,
      );
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      duplicateNumber?: number;
      reasoning?: string;
    };

    const duplicateNumber = parsed.duplicateNumber ?? 0;
    const reasoning = parsed.reasoning ?? "";
    const matched =
      duplicateNumber >= 1 && duplicateNumber <= orderedCandidates.length
        ? orderedCandidates[duplicateNumber - 1]
        : null;

    considered?.push({
      name: matched?.name ?? "(none)",
      isDuplicate: matched != null,
      reasoning,
    });

    this.logger.log(
      `[CHECK-CATEGORY-DUPLICATE] "${suggestedName}" → ${
        matched ? `"${matched.name}"` : "no duplicate"
      } (n=${duplicateNumber} reason="${reasoning}")`,
    );

    return matched;
  }

  /**
   * Find the best matching *active proto* category for an LLM suggestion, using
   * the same pipeline as {@link findMatchingFullCategory} (exact/alternate →
   * one full-list LLM call). This is what stops
   * sibling proto suggestions from proliferating: e.g. a new "AI Weekly"
   * newsletter suggestion is folded into an existing "Newsletters" proto instead
   * of spawning yet another near-variant. Substring-ish candidates are NOT
   * merged without LLM confirmation (issue #2065): a short "New GitHub issues"
   * must not be swallowed by "New GitHub issues (bot-created)".
   *
   * `excludeProtoId` omits a proto from matching — pass the thread's current
   * proto so a re-analysed thread can't match (and double-count) its own proto.
   * Returns null if no confirmed match is found.
   */
  async findMatchingProtoCategory(
    userId: string,
    suggestedName: string,
    considered?: ConsideredDuplicateCandidate[],
    excludeProtoId?: string,
  ): Promise<ProtoCategory | null> {
    const activeCategories = await this.findActiveByUser(userId);
    const candidates: DedupCandidate[] = activeCategories.map((proto) => ({
      id: proto.id,
      name: proto.name,
    }));

    const match = await this.matchSuggestionAgainstCandidates({
      suggestedName,
      candidates,
      userId,
      considered,
      excludeId: excludeProtoId,
    });
    if (!match) return null;

    return activeCategories.find((proto) => proto.id === match.id) ?? null;
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

  /**
   * Persists `alternateName` onto the given category's `alternateNames` array
   * so future near-duplicate lookups can skip the LLM call.
   *
   * Wrapped in a transaction with a pessimistic row lock so concurrent dedup
   * confirmations for the same category serialize their reads and writes — a
   * plain spread+update would let two parallel callers each read the same
   * `existing` array and overwrite each other, losing one of the names.
   */
  private async saveAlternateName(
    category: UserContext,
    alternateName: string,
  ): Promise<void> {
    const trimmed = alternateName.trim();

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(UserContext);
      const current = await repo.findOne({
        where: { contextId: category.contextId },
        lock: { mode: "pessimistic_write" },
      });
      if (!current) return;
      const existing = current.alternateNames ?? [];
      if (existing.includes(trimmed)) return;
      await repo.update(
        { contextId: category.contextId },
        { alternateNames: [...existing, trimmed] },
      );
    });

    this.logger.log(
      `Saved alternate name "${trimmed}" for category "${parseCategoryName(category.contextValue)}"`,
    );
  }
}
