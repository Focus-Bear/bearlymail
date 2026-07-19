import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CategoryArchiveStat } from "../database/entities/category-archive-stat.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { CategoryWorkflowsController } from "./category-workflows.controller";
import { CategoryWorkflowsService } from "./category-workflows.service";

/**
 * CategoryWorkflowsModule — tracks blind category "archive all" behaviour and
 * suggests auto-archive workflows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryArchiveStat,
      Email,
      EmailThread,
      UserContext,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => EmailsModule),
  ],
  controllers: [CategoryWorkflowsController],
  providers: [CategoryWorkflowsService],
  exports: [CategoryWorkflowsService],
})
export class CategoryWorkflowsModule {}
