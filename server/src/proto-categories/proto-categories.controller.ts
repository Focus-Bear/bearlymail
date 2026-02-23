import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      emailCount: c.emailCount,
      createdAt: c.createdAt,
    }));
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

  @Delete(":id")
  async deleteProtoCategory(
    @Param("id") id: string,
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    await this.protoCategoriesService.deleteProtoCategory(userId, id);
    return { success: true };
  }
}
