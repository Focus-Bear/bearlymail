import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { ReplyDraft } from "../database/entities/reply-draft.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { extractEmailAddress } from "../utils/email-address.utils";
import {
  buildRecipientHmacPattern,
  computeEmailHmac,
} from "../utils/hmac-email";
import {
  AutoResponderConfig,
  AutoResponderDeliveryMode,
} from "./types/auto-responder.types";

export enum AutoResponseDelivery {
  SEND = "send",
  DRAFT = "draft",
}

/**
 * Decides whether a prepared auto-response may be sent without the user
 * seeing it first, and stores it as a reply draft when it may not.
 */
@Injectable()
export class AutoResponderDeliveryService {
  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(ReplyDraft)
    private replyDraftRepository: Repository<ReplyDraft>,
  ) {}

  /**
   * Automatic sending needs both the user's opt-in and a recipient the user
   * already knows; everything else becomes a draft for approval.
   */
  async chooseDelivery(
    config: AutoResponderConfig,
    userId: string,
    userEmail: string,
    recipient: string,
  ): Promise<AutoResponseDelivery> {
    if (
      config.deliveryMode !== AutoResponderDeliveryMode.AUTO_SEND_KNOWN_SENDERS
    ) {
      return AutoResponseDelivery.DRAFT;
    }
    const known = await this.isKnownSender(userId, userEmail, recipient);
    return known ? AutoResponseDelivery.SEND : AutoResponseDelivery.DRAFT;
  }

  /**
   * A sender is known when they are in the user's contacts, or the user has
   * personally emailed them before (auto-responses don't count).
   */
  async isKnownSender(
    userId: string,
    userEmail: string,
    senderAddress: string,
  ): Promise<boolean> {
    const address = extractEmailAddress(senderAddress);
    if (!address) return false;

    const contact = await this.contactRepository.findOne({
      where: { userId, emailHash: SearchIndexHelper.hashExact(address) },
      select: {
        id: true,
      },
    });
    if (contact) return true;

    const userHmac = computeEmailHmac(
      extractEmailAddress(EncryptionHelper.tryDecrypt(userEmail)),
    );
    if (!userHmac) return false;

    const previousSend = await this.emailRepository
      .createQueryBuilder("email")
      .select("email.id")
      .where("email.userId = :userId", { userId })
      .andWhere("email.senderEmailHmac = :userHmac", { userHmac })
      .andWhere("email.recipientEmailsHmac LIKE :recipientPattern", {
        recipientPattern: buildRecipientHmacPattern(address),
      })
      .andWhere("email.sentByAutoResponder = false")
      .limit(1)
      .getOne();
    return !!previousSend;
  }

  /**
   * Saves the response as the thread's reply draft. Never overwrites a draft
   * the user already has on the thread; returns false in that case.
   */
  async saveDraft(
    userId: string,
    providerThreadId: string,
    recipient: string,
    htmlBody: string,
  ): Promise<boolean> {
    const existing = await this.replyDraftRepository.findOne({
      where: { userId, emailThreadId: providerThreadId },
      select: {
        id: true,
      },
    });
    if (existing) return false;
    await this.replyDraftRepository.save(
      this.replyDraftRepository.create({
        userId,
        emailThreadId: providerThreadId,
        content: htmlBody,
        replyMode: "reply",
        recipients: recipient,
      }),
    );
    return true;
  }
}
