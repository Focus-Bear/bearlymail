import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../auth/public.decorator";
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
   * Accept an invite. The user must be signed in (their email is verified against
   * the invite) or this endpoint is called post-registration.
   * POST /organizations/invite/:token/accept
   */
  @Post("invite/:token/accept")
  async acceptInvite(@Request() req, @Param("token") token: string) {
    return this.organizationsService.acceptInvite(token, req.user.userId);
  }

  /**
   * Update a member's role (admin only / owner only).
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
}
