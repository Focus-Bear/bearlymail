import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../auth/public.decorator";
import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import {
  FREE_TIER_EMAIL_LIMIT,
  VOLUME_TIER_NONE,
} from "../subscriptions/volume-tiers.constants";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /**
   * Create a new organisation. The calling user becomes the owner.
   * POST /organizations
   */
  @Post()
  async createOrganization(@Request() req, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.createOrganization(req.user.userId, dto);
  }

  /**
   * Get the current user's organisation and its member list.
   * GET /organizations/me
   */
  @Get("me")
  async getMyOrganization(@Request() req) {
    return this.organizationsService.getMyOrganization(req.user.userId);
  }

  /**
   * Invite a new member to the current user's org.
   * POST /organizations/invite
   */
  @Post("invite")
  async inviteMember(@Request() req, @Body() dto: InviteMemberDto) {
    return this.organizationsService.inviteMember(req.user.userId, dto);
  }

  /**
   * Validate an invite token. Public — used before sign-in on the accept page.
   * GET /organizations/invite/:token
   */
  @Get("invite/:token")
  @Public()
  async validateInvite(@Param("token") token: string) {
    const info = await this.organizationsService.validateInviteToken(token);
    if (!info) {
      return { valid: false };
    }
    return { valid: true, ...info };
  }

  /**
   * Accept an invite. The user must be signed in.
   * POST /organizations/invite/:token/accept
   */
  @Post("invite/:token/accept")
  async acceptInvite(@Request() req, @Param("token") token: string) {
    return this.organizationsService.acceptInvite(token, req.user.userId);
  }

  /**
   * Update a member's role (admin or owner only).
   * PATCH /organizations/members/:memberId
   */
  @Patch("members/:memberId")
  async updateMemberRole(
    @Request() req,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(
      req.user.userId,
      memberId,
      dto,
    );
  }

  /**
   * Deactivate (remove) a member. Owner cannot be removed.
   * DELETE /organizations/members/:memberId
   */
  @Delete("members/:memberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Request() req,
    @Param("memberId") memberId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(req.user.userId, memberId);
  }

  /**
   * Get seat usage for the current user's organisation.
   * GET /organizations/seats
   */
  @Get("seats")
  async getSeatUsage(@Request() req) {
    try {
      const { organization } =
        await this.organizationsService.getMyOrganization(req.user.userId);
      return this.organizationsService.getSeatUsage(organization.id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return { activeSeats: 0, maxSeats: 0, canInvite: false };
      }
      throw err;
    }
  }

  /**
   * Get email volume usage for the current user's organisation.
   * GET /organizations/usage
   */
  @Get("usage")
  async getVolumeUsage(@Request() req) {
    try {
      const { organization } =
        await this.organizationsService.getMyOrganization(req.user.userId);
      return this.organizationsService.getVolumeUsage(organization.id);
    } catch (err) {
      if (err instanceof NotFoundException) {
        // No org yet — expose the free tier so unpaid users are not shown
        // (or granted) a paid-sized allowance.
        return {
          emailsUsed: 0,
          emailLimit: FREE_TIER_EMAIL_LIMIT,
          percentUsed: 0,
          tier: VOLUME_TIER_NONE,
          planStatus: ORG_PLAN_STATUS.UNPAID,
          trialEndsAt: null,
          selfHosted: this.organizationsService.isSelfHostedMode(),
        };
      }
      throw err;
    }
  }
}
