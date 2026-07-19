import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ContactGroupsService } from "./contact-groups.service";
import { CreateContactGroupDto } from "./dto/create-contact-group.dto";
import { UpdateContactGroupDto } from "./dto/update-contact-group.dto";

@Controller("contact-groups")
@UseGuards(JwtAuthGuard)
export class ContactGroupsController {
  constructor(private readonly contactGroupsService: ContactGroupsService) {}

  @Get()
  async listGroups(@Request() req) {
    return this.contactGroupsService.listGroups(req.user.userId);
  }

  @Get("search")
  async searchGroups(@Request() req, @Query("q") query: string) {
    return this.contactGroupsService.searchGroups(req.user.userId, query || "");
  }

  @Get(":id")
  async getGroup(@Request() req, @Param("id") id: string) {
    return this.contactGroupsService.getGroup(req.user.userId, id);
  }

  @Post()
  async createGroup(@Request() req, @Body() body: CreateContactGroupDto) {
    return this.contactGroupsService.createGroup(req.user.userId, body);
  }

  @Put(":id")
  async updateGroup(
    @Request() req,
    @Param("id") id: string,
    @Body() body: UpdateContactGroupDto,
  ) {
    return this.contactGroupsService.updateGroup(req.user.userId, id, body);
  }

  @Delete(":id")
  async deleteGroup(@Request() req, @Param("id") id: string) {
    await this.contactGroupsService.deleteGroup(req.user.userId, id);
    return { success: true };
  }
}
