import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { getPrompt, renderPrompt } from "../llm/prompts";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { QASearchResult } from "./types/auto-responder.types";
import { RATIOS } from "../constants/percentages";
import { LLM_CONFIG } from "./auto-responder-constants";
import { LLM_OP_GENERATE_QA_ANSWER } from "../llm/llm-operations";

/**
 * Service for generating Q&A answers from user context
 */
@Injectable()
export class AutoResponderQaService {
  private readonly logger = new Logger(AutoResponderQaService.name);

  constructor(
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @Inject(forwardRef(() => LLMService))
    private llmService: LLMService,
  ) {}

  /**
   * Generate Q&A answer from user's context
   */
  async generateQAAnswer(
    userId: string,
    subject: string,
    body: string,
    minConfidence: number,
  ): Promise<QASearchResult | null> {
    try {
      // Get Q&A context entries
      const qaContexts = await this.userContextRepository.find({
        where: {
          userId,
          contextKey: ContextKey.Q_AND_A,
        },
      });

      if (qaContexts.length === 0) {
        return null;
      }

      // Parse Q&A pairs from context
      const qaPairs: Array<{ question: string; answer: string }> = [];
      for (const ctx of qaContexts) {
        try {
          const parsed = JSON.parse(ctx.contextValue);
          if (parsed.question && parsed.answer) {
            qaPairs.push(parsed);
          }
        } catch {
          // If not JSON, try to parse as "Q: ... A: ..." format
          const match = ctx.contextValue.match(/Q:\s*(.*?)\s*A:\s*(.*)/is);
          if (match) {
            qaPairs.push({
              question: match[1].trim(),
              answer: match[2].trim(),
            });
          }
        }
      }

      if (qaPairs.length === 0) {
        return null;
      }

      // Use LLM to find relevant answer
      const promptConfig = getPrompt("generate_qa_answer");
      if (!promptConfig) {
        this.logger.warn("generate_qa_answer prompt not found");
        return null;
      }

      const cleanedBody = cleanEmailContent(
        body,
        null,
        LLM_CONFIG.MAX_BODY_LENGTH_FOR_QA,
      );

      const prompt = renderPrompt(promptConfig.prompt || "", {
        subject,
        body: cleanedBody,
        qaPairs: qaPairs
          .map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`)
          .join("\n\n"),
      });

      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: LLM_CONFIG.QA_MAX_TOKENS,
        },
        undefined,
        userId,
        LLM_OP_GENERATE_QA_ANSWER,
      );

      // Parse response
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.confidence >= minConfidence && parsed.answer) {
            return {
              answer: parsed.answer,
              confidence: parsed.confidence,
              sources: parsed.sources || [],
            };
          }
        }
      } catch (parseError) {
        this.logger.warn("Failed to parse Q&A response", parseError);
      }

      return null;
    } catch (error) {
      this.logger.error("Failed to generate Q&A answer", error);
      return null;
    }
  }
}
