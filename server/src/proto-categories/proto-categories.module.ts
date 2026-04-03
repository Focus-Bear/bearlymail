import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CategoryKeysModule } from "../category-keys/category-keys.module";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { ProtoCategoriesController } from "./proto-categories.controller";
import { ProtoCategoriesService } from "./proto-categories.service";

@Module({
  imports: [
    CategoryKeysModule,
    TypeOrmModule.forFeature([ProtoCategory, EmailThread, UserContext]),
  ],
  controllers: [ProtoCategoriesController],
  providers: [ProtoCategoriesService],
  exports: [ProtoCategoriesService],
})
export class ProtoCategoriesModule {}
