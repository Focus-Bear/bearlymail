import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, Inject } from '@nestjs/common';
import { ContextService } from './context.service';
import { UserContext, ContextKey, Source } from '../database/entities/user-context.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import PgBoss = require('pg-boss');

@Controller('context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(
    private readonly contextService: ContextService,
    private readonly usersService: UsersService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  @Get()
  async getContext(@Request() req) {
    return this.contextService.getUserContext(req.user.userId);
  }

  @Get('analyze-progress')
  async getAnalyzeProgress(@Request() req) {
    const user = await this.usersService.findOne(req.user.userId);
    if (!user) {
      return { progress: null, error: null };
    }

    // Reuse scanProgress/scanTotal fields for context analysis progress
    if (user.scanProgress !== null && user.scanTotal !== null) {
      // Check for error state: scanProgress = -1 indicates error
      if (user.scanProgress === -1) {
        return {
          progress: null,
          error: {
            message: 'Analysis failed. Please try again. If the problem persists, check that the database migration has been run.',
            code: 'ANALYSIS_FAILED',
          },
        };
      }
      
      // Generate progress message based on progress percentage
      const percent = (user.scanProgress / user.scanTotal) * 100;
      let message = '';
      if (percent < 30) {
        message = 'Fetching emails from your inbox...';
      } else if (percent < 40) {
        message = 'Identifying VIP contacts from starred emails...';
      } else if (percent < 75) {
        message = 'Analyzing email patterns with AI...';
      } else if (percent < 85) {
        message = 'Extracting common Q&A from your replies...';
      } else if (percent < 95) {
        message = 'Saving insights to your context...';
      } else if (percent < 100) {
        message = 'Finalizing analysis...';
      } else {
        message = 'Analysis complete!';
      }
      
      return {
        progress: {
          current: user.scanProgress,
          total: user.scanTotal,
          message,
        },
        error: null,
      };
    }

    return { progress: null, error: null };
  }

  @Post('analyze')
  async analyzeEmails(@Request() req) {
    // Queue the analysis job instead of running synchronously
    await this.boss.send('analyze-context', { userId: req.user.userId }, {
      singletonKey: `analyze-context-${req.user.userId}`,
      singletonMinutes: 5, // Don't allow another analysis for same user within 5 minutes
    });
    return { message: 'Context analysis started in the background' };
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
    return this.contextService.updateContext(id, req.user.userId, updates);
  }

  @Delete(':id')
  async deleteContext(@Request() req, @Param('id') id: string) {
    await this.contextService.deleteContext(id, req.user.userId);
    return { message: 'Context deleted' };
  }
}

