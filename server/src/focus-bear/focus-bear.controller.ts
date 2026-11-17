import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FOCUS_BEAR_THROTTLES } from "../constants/focus-bear.constants";
import {
  ConnectFocusBearDto,
  FocusBearTaskSuggestionsDto,
} from "./dto/focus-bear.dto";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearTaskSuggestions } from "./focus-bear.types";

type AuthenticatedRequest = { user: { userId: string } };

@Controller("focus-bear")
@UseGuards(JwtAuthGuard)
export class FocusBearController {
  constructor(private readonly focusBearService: FocusBearService) {}

  @Get("connection")
  async getConnection(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ connected: boolean }> {
    return {
      connected: await this.focusBearService.isConnected(req.user.userId),
    };
  }

  @Put("connection")
  @Throttle(FOCUS_BEAR_THROTTLES.CONNECTION)
  async connect(
    @Request() req: AuthenticatedRequest,
    @Body() body: ConnectFocusBearDto,
  ): Promise<{ connected: boolean }> {
    await this.focusBearService.connect(req.user.userId, body.token);
    return { connected: true };
  }

  @Delete("connection")
  async disconnect(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ connected: boolean }> {
    await this.focusBearService.disconnect(req.user.userId);
    return { connected: false };
  }

  /** The project and due date "Save to Focus Bear" pre-fills for an action item. */
  @Post("task-suggestions")
  @HttpCode(HttpStatus.OK)
  @Throttle(FOCUS_BEAR_THROTTLES.SUGGESTIONS)
  async suggestForTask(
    @Request() req: AuthenticatedRequest,
    @Body() body: FocusBearTaskSuggestionsDto,
  ): Promise<FocusBearTaskSuggestions> {
    return this.focusBearService.suggestForTask(req.user.userId, body);
  }
}
