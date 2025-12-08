import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionItemsController } from './action-items.controller';
import { ActionItemsService } from './action-items.service';
import { ActionItem } from '../database/entities/action-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActionItem])],
  controllers: [ActionItemsController],
  providers: [ActionItemsService],
  exports: [ActionItemsService],
})
export class ActionItemsModule {}




