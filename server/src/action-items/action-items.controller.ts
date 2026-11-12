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
import { ActionItemsService } from "./action-items.service";
import {
  CreateActionItemDto,
  UpdateActionItemDto,
} from "./dto/action-item.dto";

@Controller("action-items")
@UseGuards(JwtAuthGuard)
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  @Post()
  async create(@Request() req, @Body() body: CreateActionItemDto) {
    const { description, isCompleted, source, emailId, emailThreadId } = body;
    return this.actionItemsService.create(req.user.userId, {
      description,
      isCompleted,
      source,
      emailId,
      emailThreadId,
    });
  }

  @Get()
  async findAll(@Request() req, @Query("emailId") emailId?: string) {
    return this.actionItemsService.findAll(req.user.userId, emailId);
  }

  @Put(":id")
  async update(
    @Request() req,
    @Param("id") id: string,
    @Body() body: UpdateActionItemDto,
  ) {
    const { description, isCompleted } = body;
    return this.actionItemsService.update(req.user.userId, id, {
      ...(description !== undefined && { description }),
      ...(isCompleted !== undefined && { isCompleted }),
    });
  }

  @Delete(":id")
  async delete(@Request() req, @Param("id") id: string) {
    return this.actionItemsService.delete(req.user.userId, id);
  }
}
