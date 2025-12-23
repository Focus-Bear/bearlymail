import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ActionItemsService } from "./action-items.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("action-items")
@UseGuards(JwtAuthGuard)
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  @Post()
  async create(@Request() req, @Body() body: any) {
    return this.actionItemsService.create(req.user.userId, body);
  }

  @Get()
  async findAll(@Request() req, @Query("emailId") emailId?: string) {
    return this.actionItemsService.findAll(req.user.userId, emailId);
  }

  @Put(":id")
  async update(@Request() req, @Param("id") id: string, @Body() body: any) {
    return this.actionItemsService.update(req.user.userId, id, body);
  }

  @Delete(":id")
  async delete(@Request() req, @Param("id") id: string) {
    return this.actionItemsService.delete(req.user.userId, id);
  }
}
