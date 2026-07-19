import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ActionItem } from "../database/entities/action-item.entity";
import { ActionItemsController } from "./action-items.controller";
import { ActionItemsService } from "./action-items.service";

@Module({
  imports: [TypeOrmModule.forFeature([ActionItem])],
  controllers: [ActionItemsController],
  providers: [ActionItemsService],
  exports: [ActionItemsService],
})
export class ActionItemsModule {}
