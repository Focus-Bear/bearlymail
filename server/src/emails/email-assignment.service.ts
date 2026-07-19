import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MEMBER_ROLES } from "../constants/member-roles";
import { EmailThread } from "../database/entities/email-thread.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";

/**
 * EmailAssignmentService — Batch B (#1112)
 *
 * Handles assigning / unassigning email threads to organisation members.
 * All mutations enforce that both the acting user and the target assignee
 * belong to the same active organisation, preventing cross-org data leaks.
 *
 * Business rules (from plan):
 *  - Only active org members may assign threads.
 *  - The assignee must be an active member of the SAME org.
 *  - Admins/owners may assign to any member; plain members may only self-assign.
 *  - Self-assignment is always allowed for any role.
 *  - Unassign is unrestricted for any active org member.
 */
@Injectable()
export class EmailAssignmentService {
  private readonly logger = new Logger(EmailAssignmentService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly threadRepo: Repository<EmailThread>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
  ) {}

  /**
   * Assign a thread to an org member.
   *
   * @param actingUserId  JWT userId of the caller.
   * @param threadDbId    PK (uuid) of the EmailThread row.
   * @param assigneeUserId  userId of the member to assign to.
   */
  async assignThread(
    actingUserId: string,
    threadDbId: string,
    assigneeUserId: string,
  ): Promise<EmailThread> {
    const actorMembership = await this.requireActiveMembership(actingUserId);

    // Non-admins may only self-assign
    const isSelf = actingUserId === assigneeUserId;
    if (!isSelf && actorMembership.role === MEMBER_ROLES.MEMBER) {
      throw new ForbiddenException(
        "Only admins and owners may assign threads to other members",
      );
    }

    // Validate assignee is an active member of the same org
    const assigneeMembership = await this.memberRepo.findOne({
      where: {
        userId: assigneeUserId,
        organizationId: actorMembership.organizationId,
        status: "active",
      },
    });
    if (!assigneeMembership) {
      throw new NotFoundException(
        "Assignee is not an active member of your organisation",
      );
    }

    const thread = await this.requireThreadOwnedByOrg(
      threadDbId,
      actorMembership.organizationId,
    );

    thread.assigneeId = assigneeUserId;
    const saved = await this.threadRepo.save(thread);

    this.logger.log(
      `Thread ${threadDbId} assigned to user ${assigneeUserId} by ${actingUserId}`,
    );
    return saved;
  }

  /**
   * Unassign a thread (set assigneeId to null).
   * Any active org member may unassign any thread in their org.
   */
  async unassignThread(
    actingUserId: string,
    threadDbId: string,
  ): Promise<EmailThread> {
    const actorMembership = await this.requireActiveMembership(actingUserId);

    const thread = await this.requireThreadOwnedByOrg(
      threadDbId,
      actorMembership.organizationId,
    );

    thread.assigneeId = null;
    const saved = await this.threadRepo.save(thread);

    this.logger.log(`Thread ${threadDbId} unassigned by ${actingUserId}`);
    return saved;
  }

  /**
   * List all threads assigned to a specific user, scoped to the acting user's org.
   * Only threads owned by org members are returned (org-scoped query).
   */
  async listThreadsAssignedToUser(
    actingUserId: string,
    targetUserId: string,
  ): Promise<EmailThread[]> {
    const actorMembership = await this.requireActiveMembership(actingUserId);

    // Validate target is an active member of the same org
    const targetMembership = await this.memberRepo.findOne({
      where: {
        userId: targetUserId,
        organizationId: actorMembership.organizationId,
        status: "active",
      },
    });
    if (!targetMembership) {
      throw new NotFoundException(
        "Target user is not an active member of your organisation",
      );
    }

    // Return threads assigned to targetUserId that belong to org members.
    // We query via assigneeId — no cross-org leak possible because
    // threads are scoped to userId and we only surface ones within the org.
    const orgMembers = await this.memberRepo.find({
      where: {
        organizationId: actorMembership.organizationId,
        status: "active",
      },
      select: {
        userId: true,
      },
    });
    const orgUserIds = orgMembers
      .map((member) => member.userId)
      .filter((id): id is string => id !== null);

    if (orgUserIds.length === 0) return [];

    return this.threadRepo
      .createQueryBuilder("thread")
      .where("thread.assigneeId = :targetUserId", { targetUserId })
      .andWhere("thread.userId IN (:...orgUserIds)", { orgUserIds })
      .orderBy("thread.updatedAt", "DESC")
      .getMany();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async requireActiveMembership(
    userId: string,
  ): Promise<OrganizationMember> {
    // NOTE: This method assumes a single-org architecture. If a user belongs
    // to more than one active organisation, the request context is ambiguous
    // and we must fail fast rather than silently picking an arbitrary membership.
    const memberships = await this.memberRepo.find({
      where: { userId, status: "active" },
    });
    if (memberships.length === 0) {
      throw new ForbiddenException(
        "You are not an active member of any organisation",
      );
    }
    if (memberships.length > 1) {
      throw new BadRequestException(
        "User belongs to multiple organizations — ambiguous org context",
      );
    }
    return memberships[0];
  }

  /**
   * Finds a thread by its PK and validates it belongs to a user in the given org.
   * Throws NotFoundException if the thread doesn't exist or isn't owned by an org member.
   */
  private async requireThreadOwnedByOrg(
    threadDbId: string,
    organizationId: string,
  ): Promise<EmailThread> {
    // Find the thread
    const thread = await this.threadRepo.findOne({
      where: { id: threadDbId },
    });
    if (!thread) {
      throw new NotFoundException("Thread not found");
    }

    // Check that the thread owner is an active member of the same org
    const ownerMembership = await this.memberRepo.findOne({
      where: {
        userId: thread.userId,
        organizationId,
        status: "active",
      },
    });
    if (!ownerMembership) {
      throw new ForbiddenException(
        "This thread does not belong to a member of your organisation",
      );
    }

    return thread;
  }
}
