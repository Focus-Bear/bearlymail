import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

/**
 * Response the user gave to the "auto-archive this category?" suggestion.
 * `none` = not yet responded (still eligible to be suggested).
 */
export const CATEGORY_ARCHIVE_SUGGESTION_STATE = {
  NONE: "none",
  DISMISSED: "dismissed",
  ACCEPTED: "accepted",
} as const;

export type CategoryArchiveSuggestionState =
  (typeof CATEGORY_ARCHIVE_SUGGESTION_STATE)[keyof typeof CATEGORY_ARCHIVE_SUGGESTION_STATE];

/**
 * Per-category counter of "blind" archive-alls — times the user archived every
 * email in a category without reading or actioning any of them.
 *
 * When the count reaches the suggestion threshold we prompt the user to set up
 * an auto-archive workflow for that category. The response is remembered so we
 * don't keep nagging. One row per (user, category).
 */
@Entity("category_archive_stats")
@Unique(["userId", "categoryId"])
@Index(["userId"])
export class CategoryArchiveStat {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  /** UUID of the UserContext (EMAIL_CATEGORY) this stat tracks. */
  @Column({ type: "uuid" })
  categoryId: string;

  /**
   * Consecutive count of blind archive-alls (unread AND untouched). Reset to 0
   * whenever the user archives a category batch that included read/actioned
   * emails, since that shows they are still engaging with the category.
   */
  @Column({ type: "int", default: 0 })
  blindArchiveAllCount: number;

  @Column({ type: "varchar", length: 20, default: "none" })
  suggestionState: CategoryArchiveSuggestionState;

  @Column({ type: "timestamptz", nullable: true })
  lastArchiveAllAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
