import { IsArray, IsIn, IsString } from "class-validator";

/** Prompt shown to the user when they keep blind-archiving a category. */
export interface CategoryArchiveSuggestion {
  categoryId: string;
  categoryName: string;
}

export interface ArchiveAllResult {
  archived: number;
  /** Non-null when the user should be offered an auto-archive workflow. */
  suggestion: CategoryArchiveSuggestion | null;
}

export class ArchiveAllInCategoryDto {
  @IsArray()
  @IsString({ each: true })
  emailIds: string[];
}

export class SuggestionResponseDto {
  @IsIn(["accepted", "dismissed"])
  response: "accepted" | "dismissed";
}
