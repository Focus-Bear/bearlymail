import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../../blocked-senders/blocked-senders.service";
import { EMAIL_PROVIDER_TYPES } from "../../constants/domain-types";
import { ERROR_MESSAGES } from "../../constants/error-messages";
import {
  UNSUBSCRIBE,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_OUTCOMES,
  UnsubscribeMethod,
  UnsubscribeOutcome,
} from "../../constants/unsubscribe.constants";
import { Email } from "../../database/entities/email.entity";
import { EmailArchiveService } from "../email-archive.service";
import { EmailProviderManager } from "../email-provider-manager.service";
import { EmailProvider } from "../interfaces/email-provider.interface";
import {
  isUnsubscribeOptions,
  MailtoTarget,
  preferredUnsubscribeMethod,
  toSafeHttpsUrl,
  UnsubscribeOptions,
} from "./list-unsubscribe.parser";
import {
  postOneClickUnsubscribe,
  UnsafeUnsubscribeUrlError,
} from "./one-click-unsubscribe.client";

export interface UnsubscribeResult {
  outcome: UnsubscribeOutcome;
  /** The method actually used (a failed one-click falls back to the link). */
  method: UnsubscribeMethod;
  /** Set for OPEN_LINK: the https page the client opens in a new tab. */
  url?: string;
  /** The sender's other untriaged threads the client can offer to archive. */
  siblingCount: number;
}

export interface ArchiveSenderResult {
  archivedCount: number;
}

/**
 * The latest email of each of the sender's other threads still in Triage.
 * Action-mode (starred) threads are left alone: the user chose to act on them.
 */
const SIBLING_EMAIL_IDS_SQL = `
  SELECT DISTINCT ON (e."emailThreadId") e.id
  FROM emails e
  JOIN email_threads t ON t.id = e."emailThreadId" AND t."userId" = $1
  WHERE e."userId" = $1
    AND e."senderEmailHmac" = $2
    AND e."emailThreadId" <> $3
    AND t."isArchived" = false
    AND t."starCount" = 0
  ORDER BY e."emailThreadId", e."receivedAt" DESC
  LIMIT $4`;

const PROVIDER_TYPE_BY_ACCOUNT_COLUMN: ReadonlyArray<
  [
    keyof Pick<
      Email,
      "googleAccountId" | "office365AccountId" | "zohoAccountId"
    >,
    string,
  ]
> = [
  ["googleAccountId", EMAIL_PROVIDER_TYPES.GMAIL],
  ["office365AccountId", EMAIL_PROVIDER_TYPES.OFFICE365],
  ["zohoAccountId", EMAIL_PROVIDER_TYPES.ZOHO],
];

/**
 * Unsubscribes the user from a mailing list using the email's stored
 * List-Unsubscribe targets, preferring RFC 8058 one-click, then a mailto:
 * sent from the user's own account, then the sender's web page.
 */
@Injectable()
export class EmailUnsubscribeService {
  private readonly logger = new Logger(EmailUnsubscribeService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @Inject(forwardRef(() => EmailProviderManager))
    private readonly emailProviderManager: EmailProviderManager,
    private readonly emailArchiveService: EmailArchiveService,
    private readonly blockedSendersService: BlockedSendersService,
  ) {}

  /**
   * @param confirmedMethod - the method the user confirmed in the client. A
   *   mismatch is refused so nothing (in particular a mailto send) happens
   *   without the user having agreed to that exact action.
   */
  async unsubscribe(
    userId: string,
    emailId: string,
    confirmedMethod: UnsubscribeMethod,
  ): Promise<UnsubscribeResult> {
    const email = await this.findEmailOrThrow(userId, emailId);
    const options = this.readOptions(email);
    const method = preferredUnsubscribeMethod(options);
    if (!options || !method) {
      throw new NotFoundException(ERROR_MESSAGES.NO_UNSUBSCRIBE_OPTION);
    }
    if (method !== confirmedMethod) {
      throw new BadRequestException(ERROR_MESSAGES.UNSUBSCRIBE_METHOD_CHANGED);
    }
    const siblingCount = (await this.findSiblingEmailIds(userId, email)).length;
    const outcome = await this.performUnsubscribe(
      userId,
      email,
      options,
      method,
    );
    return { ...outcome, siblingCount };
  }

  /**
   * Archives the sender's other Triage threads and records the sender as
   * unsubscribed (a blocked sender), so anything they still send is
   * auto-archived. The email itself is archived by the client's usual flow.
   */
  async archiveSender(
    userId: string,
    emailId: string,
  ): Promise<ArchiveSenderResult> {
    const email = await this.findEmailOrThrow(userId, emailId);
    const siblingIds = await this.findSiblingEmailIds(userId, email);
    await this.blockedSendersService.blockSender(
      userId,
      email.from,
      email.fromName,
      UNSUBSCRIBE.BLOCKED_SENDER_REASON,
    );
    await this.emailArchiveService.bulkArchiveEmails(userId, siblingIds);
    return { archivedCount: siblingIds.length };
  }

  private async performUnsubscribe(
    userId: string,
    email: Email,
    options: UnsubscribeOptions,
    method: UnsubscribeMethod,
  ): Promise<Omit<UnsubscribeResult, "siblingCount">> {
    if (method === UNSUBSCRIBE_METHODS.ONE_CLICK) {
      return this.unsubscribeOneClick(email, options);
    }
    if (method === UNSUBSCRIBE_METHODS.MAILTO && options.mailto) {
      await this.sendMailtoUnsubscribe(userId, email, options.mailto);
      return { outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED, method };
    }
    return this.openLinkResult(options);
  }

  private async unsubscribeOneClick(
    email: Email,
    options: UnsubscribeOptions,
  ): Promise<Omit<UnsubscribeResult, "siblingCount">> {
    try {
      await postOneClickUnsubscribe(options.httpsUrl ?? "");
      return {
        outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED,
        method: UNSUBSCRIBE_METHODS.ONE_CLICK,
      };
    } catch (error) {
      if (error instanceof UnsafeUnsubscribeUrlError) {
        this.logger.warn(
          `One-click unsubscribe refused for email ${email.id}: ${error.message}`,
        );
        throw new BadRequestException(ERROR_MESSAGES.UNSAFE_UNSUBSCRIBE_URL);
      }
      // The sender's endpoint rejected or timed out; their page usually still
      // works in a browser, so hand the user the link instead of failing.
      this.logger.warn(
        `One-click unsubscribe failed for email ${email.id}; falling back to the link`,
      );
      return this.openLinkResult(options);
    }
  }

  private openLinkResult(
    options: UnsubscribeOptions,
  ): Omit<UnsubscribeResult, "siblingCount"> {
    const url = toSafeHttpsUrl(options.httpsUrl);
    if (!url) {
      throw new BadRequestException(ERROR_MESSAGES.UNSAFE_UNSUBSCRIBE_URL);
    }
    return {
      outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
      method: UNSUBSCRIBE_METHODS.LINK,
      url,
    };
  }

  private async sendMailtoUnsubscribe(
    userId: string,
    email: Email,
    mailto: MailtoTarget,
  ): Promise<void> {
    const provider = await this.resolveProvider(userId, email);
    // Sent straight through the provider, like other automated sends, so it is
    // never open-tracked and never becomes a follow-up.
    await provider.sendEmail(userId, {
      to: [{ email: mailto.address }],
      subject: mailto.subject ?? UNSUBSCRIBE.MAILTO_DEFAULT_SUBJECT,
      body: mailto.body ?? UNSUBSCRIBE.MAILTO_DEFAULT_BODY,
    });
  }

  /** The provider of the account the newsletter arrived in, else the primary one. */
  private async resolveProvider(
    userId: string,
    email: Email,
  ): Promise<EmailProvider> {
    const match = PROVIDER_TYPE_BY_ACCOUNT_COLUMN.find(
      ([column]) => !!email[column],
    );
    const provider = match
      ? await this.emailProviderManager.getProvider(userId, match[1])
      : await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new BadRequestException(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
    }
    return provider;
  }

  private async findEmailOrThrow(userId: string, emailId: string) {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
    if (!email) throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    return email;
  }

  private readOptions(email: Email): UnsubscribeOptions | null {
    return isUnsubscribeOptions(email.unsubscribeOptions)
      ? email.unsubscribeOptions
      : null;
  }

  private async findSiblingEmailIds(
    userId: string,
    email: Email,
  ): Promise<string[]> {
    if (!email.senderEmailHmac) return [];
    const rows: Array<{ id: string }> = await this.emailRepository.query(
      SIBLING_EMAIL_IDS_SQL,
      [
        userId,
        email.senderEmailHmac,
        email.emailThreadId,
        UNSUBSCRIBE.MAX_SIBLING_EMAILS,
      ],
    );
    return rows.map((row) => row.id);
  }
}
