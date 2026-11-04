import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { isUuid } from "../common/uuid.utils";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { HTTP_STATUS } from "../constants/http-status";
import { Email } from "../database/entities/email.entity";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { isApiError } from "../types/common";
import { EmailProviderManager } from "./email-provider-manager.service";
import { buildEmlContentDisposition } from "./eml-download.helpers";

/** A message's original RFC 822 bytes plus the header that names the file. */
export interface EmlDownload {
  content: Buffer;
  contentDisposition: string;
}

/** Provider SDKs surface the HTTP status on `response.status`, `status` or `code`. */
function isProviderNotFoundError(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const status = error.response?.status ?? error.status ?? error.code;
  return status === HTTP_STATUS.NOT_FOUND;
}

/**
 * Serves one message as a `.eml` file: the original RFC 822 source fetched
 * from the user's mail provider, never a reconstruction from stored fields.
 */
@Injectable()
export class EmailEmlDownloadService {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly emailProviderManager: EmailProviderManager,
  ) {}

  async getEmlDownload(userId: string, emailId: string): Promise<EmlDownload> {
    const email = await this.findOwnedEmail(userId, emailId);
    const content = await this.fetchRawMessage(userId, email.messageId);
    return {
      content,
      contentDisposition: buildEmlContentDisposition(email.subject),
    };
  }

  /**
   * The ownership check: the lookup is scoped to the requesting user, so
   * another user's email id is indistinguishable from one that doesn't exist.
   */
  private async findOwnedEmail(
    userId: string,
    emailId: string,
  ): Promise<Email> {
    if (!isUuid(emailId)) {
      throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
      select: { id: true, userId: true, messageId: true, subject: true },
    });
    if (!email) {
      throw new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    decryptEmailEntityForApi(email);
    return email;
  }

  private async fetchRawMessage(
    userId: string,
    messageId: string,
  ): Promise<Buffer> {
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new BadRequestException(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
    }
    if (!provider.getRawMessage) {
      throw new NotImplementedException(ERROR_MESSAGES.RAW_MESSAGE_UNSUPPORTED);
    }
    try {
      return await provider.getRawMessage(userId, messageId);
    } catch (error: unknown) {
      if (isProviderNotFoundError(error)) {
        throw new NotFoundException(ERROR_MESSAGES.RAW_MESSAGE_NOT_FOUND);
      }
      throw error;
    }
  }
}
