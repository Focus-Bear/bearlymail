import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextController } from './context.controller';
import { ContextService } from './context.service';
import { UserContext } from '../database/entities/user-context.entity';
import { Email } from '../database/entities/email.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserContext, Email])],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}

