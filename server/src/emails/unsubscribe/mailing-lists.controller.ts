import { Controller, Get, Request, UseGuards } from "@nestjs/common";

import { EmailProviderRequiredGuard } from "../../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { MailingList, MailingListsService } from "./mailing-lists.service";

/**
 * Settings → Subscriptions. Its own top-level route rather than
 * `/emails/mailing-lists`, which `GET /emails/:id` would claim.
 */
@Controller("mailing-lists")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class MailingListsController {
  constructor(private readonly mailingListsService: MailingListsService) {}

  /** GET /mailing-lists — senders the user could unsubscribe from, busiest first. */
  @Get()
  async list(@Request() req): Promise<{ mailingLists: MailingList[] }> {
    return {
      mailingLists: await this.mailingListsService.listMailingLists(
        req.user.userId,
      ),
    };
  }
}
