import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { ProtoCategoriesService } from "./proto-categories.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProtoCategory, EmailThread, UserContext]),
  ],
  providers: [ProtoCategoriesService],
  exports: [ProtoCategoriesService],
})
export class ProtoCategoriesModule {}
