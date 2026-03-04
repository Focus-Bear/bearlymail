import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { ProtoCategoriesController } from "./proto-categories.controller";
import { ProtoCategoriesService } from "./proto-categories.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProtoCategory, EmailThread, UserContext]),
  ],
  controllers: [ProtoCategoriesController],
  providers: [ProtoCategoriesService],
  exports: [ProtoCategoriesService],
})
export class ProtoCategoriesModule {}
