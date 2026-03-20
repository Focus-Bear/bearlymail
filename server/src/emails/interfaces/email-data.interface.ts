import { Email } from "../../database/entities/email.entity";

/**
 * Email data that may include legacy thread-level properties
 * (starCount and isArchived are now on EmailThread, but may come from external sources)
 */
export interface EmailDataWithOptionalThreadProps extends Partial<Email> {
  starCount?: number;
  isArchived?: boolean;
}
