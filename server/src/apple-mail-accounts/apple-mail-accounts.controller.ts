import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StepUpAuthGuard } from "../auth/step-up.guard";
import { AuthenticatedRequest } from "../types/common";
import { AppleMailAccountsService } from "./apple-mail-accounts.service";

@Controller("apple-mail-accounts")
export class AppleMailAccountsController {
  constructor(private appleMailAccountsService: AppleMailAccountsService) {}

  /**
   * Whether Apple Mail integration can work at all in this deployment
   * (the server must be running on macOS next to the user's Mail.app).
   */
  @Get("availability")
  @UseGuards(JwtAuthGuard)
  getAvailability() {
    return { available: this.appleMailAccountsService.isAvailable() };
  }

  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(
    @Req() req: AuthenticatedRequest,
    @Body() body: { accountNames?: string[] },
  ) {
    const { userId } = req.user;
    const accounts = await this.appleMailAccountsService.connect(
      userId,
      body?.accountNames,
    );
    return { accounts };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAccounts(@Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.appleMailAccountsService.findAllByUser(userId);
  }

  @Post(":id/set-primary")
  @UseGuards(JwtAuthGuard)
  async setPrimary(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const { userId } = req.user;
    return this.appleMailAccountsService.setPrimary(id, userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, StepUpAuthGuard)
  async disconnectAccount(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const { userId } = req.user;
    await this.appleMailAccountsService.deactivate(id, userId);
    return { success: true };
  }
}
