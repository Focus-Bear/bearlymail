import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Organization } from "../database/entities/organization.entity";
import {
  OrganizationMember,
  OrgRole,
} from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { InviteService } from "./invite.service";

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
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly inviteService: InviteService,
  ) {}

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

    // Owner auto-enrolls as the first active seat
    const org = this.orgRepo.create({
      name: dto.name,
      ownerId: userId,
      maxSeats: 1,
    });
    const saved = await this.orgRepo.save(org);

    const ownerEmail = user.email;
    const ownerMember = this.memberRepo.create({
      organizationId: saved.id,
      userId,
      email: ownerEmail,
      emailHash: EncryptionHelper.hashEmail(ownerEmail),
      role: "owner",
      status: "active",
      displayName: user.displayName ?? user.name ?? null,
      inviteToken: null,
      inviteExpires: null,
      invitedBy: userId,
    });
    await this.memberRepo.save(ownerMember);

    this.logger.log(`Organisation created: ${saved.id} by user ${userId}`);
    return saved;
  }

  // ─── Get my org ──────────────────────────────────────────────────────────────

  /**
   * Returns the organisation the calling user belongs to (as owner or member),
   * with the full member list.
   */
  async getMyOrganization(userId: string): Promise<{
    organization: Organization;
    members: OrganizationMember[];
  }> {
    const membership = await this.memberRepo.findOne({
      where: { userId, status: "active" },
      relations: ["organization"],
    });
    if (!membership) {
      throw new NotFoundException("You are not a member of any organisation");
    }

    const members = await this.memberRepo.find({
      where: { organizationId: membership.organizationId },
      order: { createdAt: "ASC" },
    });

    return { organization: membership.organization, members };
  }

  // ─── Seat & volume usage ──────────────────────────────────────────────────────

  /**
   * Returns seat usage for the given org.
   * Uses Organization.maxSeats — no separate TeamSubscription entity.
   */
  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    const org = await this.orgRepo.findOneOrFail({ where: { id: orgId } });
    const activeSeats = await this.memberRepo.count({
      where: { organizationId: orgId, status: "active" },
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
    return {
      emailsUsed: org.emailsUsedThisCycle,
      emailLimit: org.emailVolumeLimit,
      percentUsed:
        org.emailVolumeLimit > 0
          ? Math.round((org.emailsUsedThisCycle / org.emailVolumeLimit) * 100)
          : 0,
      tier: org.volumeTierProductId ?? "none",
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
      if (existing.status === "active") {
        throw new ConflictException("This email is already a member");
      }
      if (existing.status === "deactivated") {
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
      relations: ["organization", "invitedByUser"],
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
      where: { userId: acceptingUserId, status: "active" },
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

    if (target.role === "owner") {
      throw new ForbiddenException("Cannot change the owner role");
    }
    if (target.userId === requesterId && requesterMembership.role !== "owner") {
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

    if (target.role === "owner") {
      throw new ForbiddenException("Cannot remove the organisation owner");
    }
    if (target.userId === requesterId) {
      throw new ForbiddenException(
        "You cannot remove yourself — transfer ownership first",
      );
    }

    target.status = "deactivated";
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
        status: "active",
      },
    });
  }

  async findActiveMembership(
    userId: string,
  ): Promise<OrganizationMember | null> {
    return this.memberRepo.findOne({ where: { userId, status: "active" } });
  }

  async areInSameOrg(userAId: string, userBId: string): Promise<boolean> {
    const memberA = await this.memberRepo.findOne({
      where: { userId: userAId, status: "active" },
    });
    if (!memberA) return false;
    const memberB = await this.memberRepo.findOne({
      where: { userId: userBId, status: "active" },
    });
    if (!memberB) return false;
    return memberA.organizationId === memberB.organizationId;
  }

  private async requireActiveMembership(
    userId: string,
  ): Promise<OrganizationMember> {
    const membership = await this.memberRepo.findOne({
      where: { userId, status: "active" },
    });
    if (!membership) {
      throw new ForbiddenException(
        "You are not an active member of any organisation",
      );
    }
    return membership;
  }

  private requireAdminOrOwner(membership: OrganizationMember): void {
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ForbiddenException(
        "Only organisation owners and admins can perform this action",
      );
    }
  }
}
