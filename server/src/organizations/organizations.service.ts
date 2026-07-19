import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import { Repository } from "typeorm";

import { ORG_PLAN_STATUS, OrgPlanStatus } from "../constants/domain-statuses";
import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { MEMBER_ROLES, MEMBER_STATUS } from "../constants/member-roles";
import { Organization } from "../database/entities/organization.entity";
import {
  OrganizationMember,
  OrgRole,
} from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { TRIAL_EMAIL_LIMIT } from "../subscriptions/volume-tiers.constants";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { InviteService } from "./invite.service";
import {
  applyTrialExpiryIfDue,
  computeTrialEndDate,
} from "./org-plan-status.util";

const INVITE_EXPIRY_DAYS = 7;
const INVITE_TOKEN_BYTES = 32;

export interface SeatUsage {
  activeSeats: number;
  maxSeats: number;
  canInvite: boolean;
}

export interface VolumeUsage {
  emailsUsed: number;
  emailLimit: number;
  percentUsed: number;
  tier: string;
  planStatus: OrgPlanStatus;
  trialEndsAt: Date | null;
  selfHosted: boolean;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  // Self-hosted deployments (npm run local) are exempt from ALL plan
  // enforcement: no trial expiry, no plan limits shown to the user.
  private readonly isSelfHosted: boolean;

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly inviteService: InviteService,
    private readonly configService: ConfigService,
  ) {
    this.isSelfHosted =
      this.configService.get<string>("SELF_HOSTED") ===
      BOOLEAN_STRING_VALUES.TRUE;
  }

  /** Whether this deployment runs in self-hosted mode (plan enforcement off). */
  isSelfHostedMode(): boolean {
    return this.isSelfHosted;
  }

  // ─── Org creation ────────────────────────────────────────────────────────────

  /**
   * Creates a new organization owned by the calling user.
   * Automatically adds the owner as an active 'owner' member.
   */
  async createOrganization(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const existingOwned = await this.orgRepo.findOne({
      where: { ownerId: userId },
    });
    if (existingOwned) {
      throw new ConflictException(
        "You already own an organisation. Transfer ownership before creating a new one.",
      );
    }

    // Owner auto-enrolls as the first active seat; new orgs start on a trial
    const org = this.orgRepo.create({
      name: dto.name,
      ownerId: userId,
      maxSeats: 1,
      planStatus: ORG_PLAN_STATUS.TRIAL,
      trialEndsAt: computeTrialEndDate(),
      emailVolumeLimit: TRIAL_EMAIL_LIMIT,
    });
    const saved = await this.orgRepo.save(org);

    const ownerEmail = user.email;
    const ownerMember = this.memberRepo.create({
      organizationId: saved.id,
      userId,
      email: ownerEmail,
      emailHash: EncryptionHelper.hashEmail(ownerEmail),
      role: "owner",
      status: MEMBER_STATUS.ACTIVE,
      displayName: user.displayName ?? user.name ?? null,
      inviteToken: null,
      inviteExpires: null,
      invitedBy: userId,
    });
    await this.memberRepo.save(ownerMember);

    this.logger.log(`Organisation created: ${saved.id} by user ${userId}`);
    return saved;
  }

  /**
   * Ensures the user belongs to an organisation (the "org of one" model).
   *
   * Every user is an org: an individual is simply an org with a single seat.
   * This is idempotent and safe to call on every login:
   *   - if the user already owns an org, returns it;
   *   - if the user is an active member of someone else's org (a team), returns
   *     that org — they don't need a personal one;
   *   - otherwise creates a personal org (maxSeats=1) with the user as owner.
   *
   * The DB enforces one-org-per-owner via a unique index on ownerId, so a race
   * between concurrent logins resolves to a single org (the loser re-reads it).
   */
  async ensurePersonalOrg(userId: string): Promise<Organization> {
    const existingOwned = await this.orgRepo.findOne({
      where: { ownerId: userId },
    });
    if (existingOwned) return existingOwned;

    const membership = await this.memberRepo.findOne({
      where: { userId, status: MEMBER_STATUS.ACTIVE },
      relations: {
        organization: true,
      },
    });
    if (membership) return membership.organization;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const orgName = user.displayName ?? user.name ?? "Personal workspace";
    try {
      const saved = await this.orgRepo.manager.transaction(async (tx) => {
        const org = tx.create(Organization, {
          name: orgName,
          ownerId: userId,
          maxSeats: 1,
          planStatus: ORG_PLAN_STATUS.TRIAL,
          trialEndsAt: computeTrialEndDate(),
          emailVolumeLimit: TRIAL_EMAIL_LIMIT,
        });
        const savedOrg = await tx.save(org);

        const ownerMember = tx.create(OrganizationMember, {
          organizationId: savedOrg.id,
          userId,
          email: user.email,
          emailHash: EncryptionHelper.hashEmail(user.email),
          role: MEMBER_ROLES.OWNER,
          status: MEMBER_STATUS.ACTIVE,
          displayName: user.displayName ?? user.name ?? null,
          inviteToken: null,
          inviteExpires: null,
          invitedBy: userId,
        });
        await tx.save(ownerMember);

        return savedOrg;
      });

      this.logger.log(
        `Personal org ${saved.id} provisioned for user ${userId}`,
      );
      return saved;
    } catch (err) {
      // A concurrent login may have created the org first (unique ownerId index).
      // Re-read and return it rather than failing the login.
      const raced = await this.orgRepo.findOne({ where: { ownerId: userId } });
      if (raced) return raced;
      throw err;
    }
  }

  // ─── Get my org ──────────────────────────────────────────────────────────────

  /**
   * Returns the organisation the calling user belongs to (as owner or member),
   * with the full member list.
   */
  async getMyOrganization(userId: string): Promise<{
    organization: Organization;
    members: OrganizationMember[];
    selfHosted: boolean;
  }> {
    const membership = await this.memberRepo.findOne({
      where: { userId, status: MEMBER_STATUS.ACTIVE },
      relations: {
        organization: true,
      },
    });
    if (!membership) {
      throw new NotFoundException("You are not a member of any organisation");
    }

    await this.expireTrialIfDue(membership.organization);

    const members = await this.memberRepo.find({
      where: { organizationId: membership.organizationId },
      order: { createdAt: "ASC" },
    });

    return {
      organization: membership.organization,
      members,
      selfHosted: this.isSelfHosted,
    };
  }

  /**
   * Lazily expires an elapsed trial (no cron): when planStatus is 'trial' and
   * trialEndsAt has passed, persists planStatus='expired' and downgrades the
   * email volume limit to the free tier. maxSeats stays untouched so the
   * owner keeps access to the org. Safe to call on every read path.
   */
  async expireTrialIfDue(org: Organization): Promise<Organization> {
    // Self-hosted deployments never expire trials or downgrade limits.
    if (this.isSelfHosted) return org;
    if (applyTrialExpiryIfDue(org)) {
      try {
        await this.orgRepo.save(org);
        this.logger.log(
          `Org ${org.id} trial expired — downgraded to free tier limits`,
        );
      } catch (error) {
        // A transient write failure must not break the read path; the
        // in-memory org already reflects the expired state and the next
        // call will retry the persist.
        this.logger.warn(
          `Failed to persist trial expiry for org ${org.id}: ${(error as Error).message}`,
        );
      }
    }
    return org;
  }

  // ─── Seat & volume usage ──────────────────────────────────────────────────────

  /**
   * Returns seat usage for the given org.
   * Uses Organization.maxSeats — no separate TeamSubscription entity.
   */
  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    const org = await this.orgRepo.findOneOrFail({ where: { id: orgId } });
    const activeSeats = await this.memberRepo.count({
      where: { organizationId: orgId, status: MEMBER_STATUS.ACTIVE },
    });
    return {
      activeSeats,
      maxSeats: org.maxSeats,
      canInvite: activeSeats < org.maxSeats,
    };
  }

  /**
   * Enforces that the org has capacity to invite another member.
   * Throws ForbiddenException if seat limit is reached.
   */
  async enforceInviteAllowed(orgId: string): Promise<void> {
    const usage = await this.getSeatUsage(orgId);
    if (!usage.canInvite) {
      throw new ForbiddenException(
        `Seat limit reached (${usage.activeSeats}/${usage.maxSeats}). ` +
          `Upgrade your team plan to invite more members.`,
      );
    }
  }

  /**
   * Returns email volume usage for the given org.
   */
  async getVolumeUsage(orgId: string): Promise<VolumeUsage> {
    const org = await this.orgRepo.findOneOrFail({ where: { id: orgId } });
    await this.expireTrialIfDue(org);
    return {
      emailsUsed: org.emailsUsedThisCycle,
      emailLimit: org.emailVolumeLimit,
      percentUsed:
        org.emailVolumeLimit > 0
          ? Math.round((org.emailsUsedThisCycle / org.emailVolumeLimit) * 100)
          : 0,
      tier: org.volumeTierProductId ?? "none",
      planStatus: org.planStatus ?? ORG_PLAN_STATUS.UNPAID,
      trialEndsAt: org.trialEndsAt ?? null,
      selfHosted: this.isSelfHosted,
    };
  }

  // ─── Invite flow ─────────────────────────────────────────────────────────────

  /**
   * Invites a new member (or re-sends for pending) and dispatches the invite email.
   * Only org owners and admins may invite.
   */
  async inviteMember(
    inviterId: string,
    dto: InviteMemberDto,
  ): Promise<OrganizationMember> {
    const membership = await this.requireActiveMembership(inviterId);
    this.requireAdminOrOwner(membership);

    const orgId = membership.organizationId;

    await this.enforceInviteAllowed(orgId);

    const emailHash = EncryptionHelper.hashEmail(dto.email);

    const existing = await this.memberRepo.findOne({
      where: { organizationId: orgId, emailHash },
    });

    if (existing) {
      if (existing.status === MEMBER_STATUS.ACTIVE) {
        throw new ConflictException("This email is already a member");
      }
      if (existing.status === MEMBER_STATUS.DEACTIVATED) {
        throw new ConflictException(
          "This member was deactivated. Re-activate via the members API",
        );
      }
      return this.refreshAndSendInvite(existing, inviterId, orgId);
    }

    const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString("hex");
    const inviteExpires = new Date();
    inviteExpires.setDate(inviteExpires.getDate() + INVITE_EXPIRY_DAYS);

    const member = this.memberRepo.create({
      organizationId: orgId,
      userId: null,
      email: dto.email,
      emailHash,
      role: dto.role,
      status: "pending",
      displayName: null,
      inviteToken: token,
      inviteExpires,
      invitedBy: inviterId,
    });
    const saved = await this.memberRepo.save(member);

    await this.dispatchInviteEmail(saved, inviterId, orgId);
    return saved;
  }

  private async refreshAndSendInvite(
    member: OrganizationMember,
    inviterId: string,
    orgId: string,
  ): Promise<OrganizationMember> {
    const token = crypto.randomBytes(INVITE_TOKEN_BYTES).toString("hex");
    const inviteExpires = new Date();
    inviteExpires.setDate(inviteExpires.getDate() + INVITE_EXPIRY_DAYS);

    member.inviteToken = token;
    member.inviteExpires = inviteExpires;
    member.invitedBy = inviterId;
    const saved = await this.memberRepo.save(member);
    await this.dispatchInviteEmail(saved, inviterId, orgId);
    return saved;
  }

  private async dispatchInviteEmail(
    member: OrganizationMember,
    inviterId: string,
    orgId: string,
  ): Promise<void> {
    const [inviter, org] = await Promise.all([
      this.userRepo.findOne({ where: { id: inviterId } }),
      this.orgRepo.findOne({ where: { id: orgId } }),
    ]);

    if (!inviter || !org) return;

    const inviterName =
      inviter.displayName ?? inviter.name ?? inviter.email ?? "A teammate";
    const orgName = org.name;

    try {
      await this.inviteService.sendInviteEmail(
        member.email,
        inviterName,
        orgName,
        member.inviteToken!,
      );
    } catch (err) {
      this.logger.error(
        `Invite email dispatch failed for member ${member.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ─── Validate token (public) ─────────────────────────────────────────────────

  /**
   * Validates an invite token and returns non-sensitive info for the accept UI.
   * Returns null if expired or invalid.
   *
   * NOTE: This endpoint is @Public() — intentionally returns inviterName (display name)
   * rather than inviterEmail to avoid leaking PII to unauthenticated callers.
   */
  async validateInviteToken(
    token: string,
  ): Promise<{ orgName: string; inviterName: string; role: OrgRole } | null> {
    const member = await this.memberRepo.findOne({
      where: { inviteToken: token, status: "pending" },
      relations: {
        organization: true,
        invitedByUser: true,
      },
    });

    if (!member) return null;
    if (member.inviteExpires && member.inviteExpires < new Date()) return null;

    const inviter = member.invitedByUser;
    const inviterName = inviter.displayName ?? inviter.name ?? "A teammate";

    return {
      orgName: member.organization.name,
      inviterName,
      role: member.role,
    };
  }

  // ─── Accept invite ───────────────────────────────────────────────────────────

  /**
   * Accepts an invite for an existing authenticated user.
   * If the user already has an active membership, throws.
   */
  async acceptInvite(
    token: string,
    acceptingUserId: string,
  ): Promise<OrganizationMember> {
    const member = await this.memberRepo.findOne({
      where: { inviteToken: token, status: "pending" },
    });

    if (!member) {
      throw new BadRequestException("Invite not found or already used");
    }

    if (member.inviteExpires && member.inviteExpires < new Date()) {
      throw new BadRequestException("Invite has expired");
    }

    const user = await this.userRepo.findOne({
      where: { id: acceptingUserId },
    });
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const userEmailHash = EncryptionHelper.hashEmail(user.email);
    if (userEmailHash !== member.emailHash) {
      throw new ForbiddenException(
        "The invite was sent to a different email address",
      );
    }

    const alreadyMember = await this.memberRepo.findOne({
      where: { userId: acceptingUserId, status: MEMBER_STATUS.ACTIVE },
    });
    if (alreadyMember) {
      throw new ConflictException(
        "You are already a member of an organisation",
      );
    }

    member.userId = acceptingUserId;
    member.status = "active";
    member.displayName = user.displayName ?? user.name ?? null;
    member.inviteToken = null;
    member.inviteExpires = null;

    const saved = await this.memberRepo.save(member);
    this.logger.log(
      `User ${acceptingUserId} accepted invite to org ${member.organizationId}`,
    );
    return saved;
  }

  // ─── Update member role ──────────────────────────────────────────────────────

  async updateMemberRole(
    requesterId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<OrganizationMember> {
    const requesterMembership = await this.requireActiveMembership(requesterId);
    this.requireAdminOrOwner(requesterMembership);

    const target = await this.memberRepo.findOne({
      where: {
        id: memberId,
        organizationId: requesterMembership.organizationId,
      },
    });
    if (!target) throw new NotFoundException("Member not found");

    if (target.role === MEMBER_ROLES.OWNER) {
      throw new ForbiddenException("Cannot change the owner role");
    }
    if (
      target.userId === requesterId &&
      requesterMembership.role !== MEMBER_ROLES.OWNER
    ) {
      throw new ForbiddenException("You cannot change your own role");
    }

    target.role = dto.role;
    return this.memberRepo.save(target);
  }

  // ─── Remove member ───────────────────────────────────────────────────────────

  async removeMember(requesterId: string, memberId: string): Promise<void> {
    const requesterMembership = await this.requireActiveMembership(requesterId);
    this.requireAdminOrOwner(requesterMembership);

    const target = await this.memberRepo.findOne({
      where: {
        id: memberId,
        organizationId: requesterMembership.organizationId,
      },
    });
    if (!target) throw new NotFoundException("Member not found");

    if (target.role === MEMBER_ROLES.OWNER) {
      throw new ForbiddenException("Cannot remove the organisation owner");
    }
    if (target.userId === requesterId) {
      throw new ForbiddenException(
        "You cannot remove yourself — transfer ownership first",
      );
    }

    target.status = MEMBER_STATUS.DEACTIVATED;
    target.inviteToken = null;
    target.inviteExpires = null;
    await this.memberRepo.save(target);
    this.logger.log(
      `Member ${memberId} deactivated in org ${requesterMembership.organizationId}`,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async getOrgMembersForUser(userId: string): Promise<OrganizationMember[]> {
    const membership = await this.requireActiveMembership(userId);
    return this.memberRepo.find({
      where: {
        organizationId: membership.organizationId,
        status: MEMBER_STATUS.ACTIVE,
      },
    });
  }

  async findActiveMembership(
    userId: string,
  ): Promise<OrganizationMember | null> {
    return this.memberRepo.findOne({
      where: { userId, status: MEMBER_STATUS.ACTIVE },
    });
  }

  async areInSameOrg(userAId: string, userBId: string): Promise<boolean> {
    const memberA = await this.memberRepo.findOne({
      where: { userId: userAId, status: MEMBER_STATUS.ACTIVE },
    });
    if (!memberA) return false;
    const memberB = await this.memberRepo.findOne({
      where: { userId: userBId, status: MEMBER_STATUS.ACTIVE },
    });
    if (!memberB) return false;
    return memberA.organizationId === memberB.organizationId;
  }

  private async requireActiveMembership(
    userId: string,
  ): Promise<OrganizationMember> {
    const membership = await this.memberRepo.findOne({
      where: { userId, status: MEMBER_STATUS.ACTIVE },
    });
    if (!membership) {
      throw new ForbiddenException(
        "You are not an active member of any organisation",
      );
    }
    return membership;
  }

  private requireAdminOrOwner(membership: OrganizationMember): void {
    if (
      membership.role !== MEMBER_ROLES.OWNER &&
      membership.role !== MEMBER_ROLES.ADMIN
    ) {
      throw new ForbiddenException(
        "Only organisation owners and admins can perform this action",
      );
    }
  }
}
