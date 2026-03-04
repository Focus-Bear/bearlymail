import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  RevenueCatWebhookPayload,
  SubscriptionsService,
} from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post("start-trial")
  @UseGuards(JwtAuthGuard)
  async startTrial(@Request() req) {
    return this.subscriptionsService.startTrial(req.user.userId);
  }

  @Get("status")
  @UseGuards(JwtAuthGuard)
  async getStatus(@Request() req) {
    return this.subscriptionsService.checkSubscriptionStatus(req.user.userId);
  }

  @Post("webhook")
  // No auth required - RevenueCat sends webhooks directly
  // In production, verify webhook signature for security
  async handleWebhook(@Body() payload: RevenueCatWebhookPayload) {
    await this.subscriptionsService.handleWebhook(payload);
    return { received: true };
  }

  @Post("link-revenuecat")
  @UseGuards(JwtAuthGuard)
  async linkRevenueCat(
    @Request() req,
    @Body() body: { revenueCatUserId: string },
  ) {
    await this.subscriptionsService.linkRevenueCatUser(
      req.user.userId,
      body.revenueCatUserId,
    );
    return { success: true };
  }

  @Post("extend-trial")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async extendTrial(
    @Request() req,
    @Body() body: { userId: string; days: number },
  ) {
    return this.subscriptionsService.extendTrial(body.userId, body.days);
  }

  @Get("all-users")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllUsers(@Request() _req) {
    return this.subscriptionsService.getAllUsersWithSubscriptions();
  }
}
