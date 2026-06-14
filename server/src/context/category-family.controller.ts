import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CategoryFamilyService } from "./category-family.service";

interface ReassignBody {
  familyId: string | null;
}
interface RenameBody {
  name: string;
}
interface CreateBody {
  name: string;
}

/**
 * Category families API — the coarse level of the category hierarchy used by the
 * inbox grouping and the settings management UI.
 */
@Controller("category-families")
@UseGuards(JwtAuthGuard)
export class CategoryFamilyController {
  constructor(private readonly familyService: CategoryFamilyService) {}

  /** Families with their categories (seeds families on first call). */
  @Get()
  async list(@Request() req) {
    await this.familyService.ensureFamiliesForUser(req.user.userId);
    return this.familyService.getFamiliesWithCategories(req.user.userId);
  }

  /** Create a user-defined family. */
  @Post()
  async create(@Request() req, @Body() body: CreateBody) {
    return this.familyService.createFamily(req.user.userId, body.name);
  }

  /** Rename a family. */
  @Patch(":id")
  async rename(
    @Request() req,
    @Param("id") id: string,
    @Body() body: RenameBody,
  ) {
    return this.familyService.renameFamily(req.user.userId, id, body.name);
  }

  /** Move a category to a different family (familyId null = unassign). */
  @Patch("categories/:contextId")
  async reassign(
    @Request() req,
    @Param("contextId") contextId: string,
    @Body() body: ReassignBody,
  ) {
    await this.familyService.reassignCategory(
      req.user.userId,
      contextId,
      body.familyId,
    );
    return { success: true };
  }
}
