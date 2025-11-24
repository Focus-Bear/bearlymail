import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ContextService } from './context.service';
import { UserContext, ContextKey, Source } from '../database/entities/user-context.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get()
  async getContext(@Request() req) {
    return this.contextService.getUserContext(req.user.userId);
  }

  @Post('analyze')
  async analyzeEmails(@Request() req) {
    await this.contextService.analyzeAndLearnFromEmails(req.user.userId);
    return { message: 'Context analysis completed' };
  }

  @Post()
  async createContext(
    @Request() req,
    @Body() body: { contextKey: ContextKey; contextValue: string },
  ) {
    return this.contextService.createOrUpdateContext(
      req.user.userId,
      body.contextKey,
      body.contextValue,
      Source.USER_EDITED,
    );
  }

  @Put(':id')
  async updateContext(
    @Request() req,
    @Param('id') id: string,
    @Body() updates: Partial<UserContext>,
  ) {
    return this.contextService.updateContext(parseInt(id), req.user.userId, updates);
  }

  @Delete(':id')
  async deleteContext(@Request() req, @Param('id') id: string) {
    await this.contextService.deleteContext(parseInt(id), req.user.userId);
    return { message: 'Context deleted' };
  }
}

