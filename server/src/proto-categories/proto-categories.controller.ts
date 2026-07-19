import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpdateProtoCategoryDto } from "./dto/update-proto-category.dto";
import { ProtoCategoriesService } from "./proto-categories.service";

@Controller("proto-categories")
@UseGuards(JwtAuthGuard)
export class ProtoCategoriesController {
  private readonly logger = new Logger(ProtoCategoriesController.name);

  constructor(
    private readonly protoCategoriesService: ProtoCategoriesService,
  ) {}

  @Get()
  async getActiveProtoCategories(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    const categories =
      await this.protoCategoriesService.findActiveByUser(userId);
    return categories.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      emailCount: item.emailCount,
      createdAt: item.createdAt,
    }));
  }

  @Get("promoted")
  async getPromotedProtoCategories(
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    return this.protoCategoriesService.findPromotedByUser(userId);
  }

  @Post(":id/promote")
  async promoteProtoCategory(
    @Param("id") id: string,
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    const protoCategory = await this.protoCategoriesService.findActiveById(
      userId,
      id,
    );

    if (!protoCategory) {
      throw new NotFoundException(
        `Proto category ${id} not found or already promoted`,
      );
    }

    const promoted =
      await this.protoCategoriesService.promoteToCategory(protoCategory);

    this.logger.log(
      `User ${userId} manually promoted proto category "${protoCategory.name}"`,
    );

    return {
      id: promoted.id,
      name: promoted.name,
      isPromoted: promoted.isPromoted,
      promotedCategoryId: promoted.promotedCategoryId,
    };
  }

  @Put(":id")
  async updateProtoCategory(
    @Param("id") id: string,
    @Body() body: UpdateProtoCategoryDto,
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    const updated = await this.protoCategoriesService.updateProtoCategoryName(
      userId,
      id,
      body.name,
    );

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      emailCount: updated.emailCount,
      createdAt: updated.createdAt,
    };
  }

  @Delete(":id")
  async deleteProtoCategory(
    @Param("id") id: string,
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    try {
      await this.protoCategoriesService.deleteProtoCategory(userId, id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Unexpected error deleting proto category ${id} for user ${userId}`,
        error,
      );
      throw error;
    }
    return { success: true };
  }
}
