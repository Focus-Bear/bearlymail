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
import { ActionItem } from "../database/entities/action-item.entity";
import { ActionItemsService } from "./action-items.service";

@Controller("action-items")
@UseGuards(JwtAuthGuard)
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  @Post()
  async create(@Request() req, @Body() body: Partial<ActionItem>) {
    return this.actionItemsService.create(req.user.userId, body);
  }

  @Get()
  async findAll(@Request() req, @Query("emailId") emailId?: string) {
    return this.actionItemsService.findAll(req.user.userId, emailId);
  }

  @Put(":id")
  async update(
    @Request() req,
    @Param("id") id: string,
    @Body() body: Partial<ActionItem>,
  ) {
    return this.actionItemsService.update(req.user.userId, id, body);
  }

  @Delete(":id")
  async delete(@Request() req, @Param("id") id: string) {
    return this.actionItemsService.delete(req.user.userId, id);
  }
}
