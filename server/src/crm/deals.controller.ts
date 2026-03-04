import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DealsService } from "./deals.service";

@Controller("deals")
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get("kanban")
  async getKanbanBoard(@Request() req) {
    return this.dealsService.getKanbanBoard(req.user.userId);
  }

  @Get("stages")
  async getStages(@Request() req) {
    return this.dealsService.getStages(req.user.userId);
  }

  @Post("stages")
  async createStage(
    @Request() req,
    @Body()
    body: { name: string; color?: string; isWon?: boolean; isLost?: boolean },
  ) {
    return this.dealsService.createStage(req.user.userId, body);
  }

  @Put("stages/:id")
  async updateStage(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      color?: string;
      sortOrder?: number;
      isWon?: boolean;
      isLost?: boolean;
    },
  ) {
    return this.dealsService.updateStage(req.user.userId, id, body);
  }

  @Delete("stages/:id")
  async deleteStage(@Request() req, @Param("id") id: string) {
    await this.dealsService.deleteStage(req.user.userId, id);
    return { success: true };
  }

  @Put("stages/reorder")
  async reorderStages(@Request() req, @Body() body: { stageIds: string[] }) {
    return this.dealsService.reorderStages(req.user.userId, body.stageIds);
  }

  @Get()
  async getDeals(@Request() req) {
    return this.dealsService.getDeals(req.user.userId);
  }

  @Get("by-contact/:contactId")
  async getDealsForContact(
    @Request() req,
    @Param("contactId") contactId: string,
  ) {
    return this.dealsService.getDealsForContact(req.user.userId, contactId);
  }

  @Get("by-email/:email")
  async getDealsForContactByEmail(
    @Request() req,
    @Param("email") email: string,
  ) {
    return this.dealsService.getDealsForContactByEmail(req.user.userId, email);
  }

  @Get(":id")
  async getDeal(@Request() req, @Param("id") id: string) {
    return this.dealsService.getDeal(req.user.userId, id);
  }

  @Post()
  async createDeal(
    @Request() req,
    @Body()
    body: {
      title: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
    },
  ) {
    return this.dealsService.createDeal(req.user.userId, body);
  }

  @Put(":id")
  async updateDeal(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      title?: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
      sortOrder?: number;
    },
  ) {
    return this.dealsService.updateDeal(req.user.userId, id, body);
  }

  @Put(":id/move")
  async moveDeal(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { stageId: string; sortOrder?: number },
  ) {
    return this.dealsService.moveDeal(
      req.user.userId,
      id,
      body.stageId,
      body.sortOrder,
    );
  }

  @Delete(":id")
  async deleteDeal(@Request() req, @Param("id") id: string) {
    await this.dealsService.deleteDeal(req.user.userId, id);
    return { success: true };
  }
}
