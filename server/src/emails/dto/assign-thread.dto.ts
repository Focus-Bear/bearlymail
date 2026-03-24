import { IsUUID } from "class-validator";

/**
 * Body for PATCH /email-threads/:threadId/assign
 * Carries the userId of the org member to assign the thread to.
 */
export class AssignThreadDto {
  @IsUUID()
  assigneeUserId: string;
}
