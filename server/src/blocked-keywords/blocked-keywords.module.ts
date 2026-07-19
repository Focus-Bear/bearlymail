import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { BlockedKeywordsController } from "./blocked-keywords.controller";
import { BlockedKeywordsService } from "./blocked-keywords.service";

@Module({
  imports: [TypeOrmModule.forFeature([BlockedKeyword])],
  controllers: [BlockedKeywordsController],
  providers: [BlockedKeywordsService],
  exports: [BlockedKeywordsService],
})
export class BlockedKeywordsModule {}
