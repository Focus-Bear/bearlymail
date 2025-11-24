import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriorityController } from './priority.controller';
import { PriorityService } from './priority.service';
import { PriorityRule } from '../database/entities/priority-rule.entity';
import { Email } from '../database/entities/email.entity';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [TypeOrmModule.forFeature([PriorityRule, Email]), LLMModule],
  controllers: [PriorityController],
  providers: [PriorityService],
  exports: [PriorityService],
})
export class PriorityModule {}

