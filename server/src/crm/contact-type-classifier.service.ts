import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { Contact } from "../database/entities/contact.entity";
import { LLMService } from "../llm/llm.service";
import { LLM_OP_CLASSIFY_CONTACT_TYPE } from "../llm/llm-operations";
import {
  CLASSIFICATION_PROMPT_IDS,
  getPrompt,
  renderPrompt,
} from "../llm/prompts";
import { logError } from "../utils/logger";

const BODY_PREVIEW_LENGTH = 500;
const MIN_CONFIDENCE = 0.6;
const TEMPERATURE = 0.3;
const MAX_TOKENS = 200;

interface ClassificationResult {
  contactType: string;
  confidence: number;
  reasoning: string;
}

@Injectable()
export class ContactTypeClassifierService {
  private readonly logger = new Logger(ContactTypeClassifierService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    private llmService: LLMService,
  ) {}

  async classifyContactType(
    userId: string,
    email: {
      from: string;
      fromName?: string;
      subject: string;
      body?: string;
    },
  ): Promise<ClassificationResult | null> {
    const promptConfig = getPrompt(
      CLASSIFICATION_PROMPT_IDS.CLASSIFY_CONTACT_TYPE,
    );
    if (!promptConfig) {
      this.logger.warn("classify_contact_type prompt not found");
      return null;
    }

    const bodyPreview = email.body
      ? email.body.substring(0, BODY_PREVIEW_LENGTH)
      : "(no body)";

    const rendered = renderPrompt(promptConfig.prompt, {
      from: email.from,
      fromName: email.fromName || "",
      subject: email.subject,
      bodyPreview,
      additionalContext: "",
    });

    try {
      const response = await this.llmService.generateText(
        {
          prompt: rendered,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
          userId,
          operation: LLM_OP_CLASSIFY_CONTACT_TYPE,
          jsonMode: true,
        },
        undefined,
        userId,
        LLM_OP_CLASSIFY_CONTACT_TYPE,
      );

      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult;

      const validTypes = [
        "lead",
        "customer",
        "team_member",
        "advisor",
        "stranger",
        "bot",
        "partner",
        "spammer",
      ];
      if (!validTypes.includes(parsed.contactType)) return null;
      if (parsed.confidence < MIN_CONFIDENCE) return null;

      return parsed;
    } catch (error) {
      logError(
        "Failed to classify contact type",
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  async autoClassifyIfNeeded(
    userId: string,
    senderEmail: string,
    emailData: {
      from: string;
      fromName?: string;
      subject: string;
      body?: string;
    },
  ): Promise<string | null> {
    const emailHash = SearchIndexHelper.hashExact(senderEmail);
    const contact = await this.contactRepository.findOne({
      where: { userId, emailHash },
    });

    if (!contact) return null;
    if (contact.contactType && !contact.contactTypeAutoDetected) return null;

    const result = await this.classifyContactType(userId, emailData);
    if (!result) return null;

    await this.contactRepository.update(contact.id, {
      contactType: result.contactType,
      contactTypeAutoDetected: true,
    });

    this.logger.log(
      `Auto-classified contact ${senderEmail} as ${result.contactType} (confidence: ${result.confidence})`,
    );

    return result.contactType;
  }
}
