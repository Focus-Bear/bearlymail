import { ContextKey } from "../database/entities/user-context.entity";
import { protoCategoryKey } from "../utils/category-key.util";
import { parseCategoryValue } from "../utils/category-name.util";
import type { CategoryItem } from "./category-shortlist.service";

type EmailCategoryContextRow = {
  contextKey: string;
  contextValue: string;
  categoryKey?: string | null;
};

type ProtoCategoryRow = {
  id: string;
  name: string;
  description?: string | null;
};

/**
 * The user's real EMAIL_CATEGORY contexts as categoriser candidates — name,
 * description and stable key — exactly as the new-email priority pipeline
 * offers them. Shared so every categorisation entry point (batch, single
 * refine, incremental re-categorisation) shows the model the same list.
 */
export function buildEmailCategoryInputs(
  contexts: EmailCategoryContextRow[],
): CategoryItem[] {
  return contexts
    .filter((context) => context.contextKey === ContextKey.EMAIL_CATEGORY)
    .map((context) => {
      const { name, description } = parseCategoryValue(context.contextValue);
      return {
        name,
        description: description ?? undefined,
        categoryKey: context.categoryKey ?? undefined,
      };
    });
}

/** Active proto categories as categoriser candidates (synthetic stable key). */
export function buildProtoCategoryInputs(
  protoCategories: ProtoCategoryRow[],
): CategoryItem[] {
  return protoCategories.map((proto) => ({
    name: proto.name,
    description: proto.description || undefined,
    categoryKey: protoCategoryKey(proto.id),
  }));
}
