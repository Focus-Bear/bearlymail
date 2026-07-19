import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserContext } from "../database/entities/user-context.entity";
import { CategoryKeyAssignmentService } from "./category-key-assignment.service";
import { CategoryKeyBackfillService } from "./category-key-backfill.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserContext])],
  providers: [CategoryKeyAssignmentService, CategoryKeyBackfillService],
  exports: [CategoryKeyAssignmentService, CategoryKeyBackfillService],
})
export class CategoryKeysModule {}
