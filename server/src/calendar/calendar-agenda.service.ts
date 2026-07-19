import { Injectable } from "@nestjs/common";
import { calendar_v3 } from "googleapis";

import { LLMService } from "../llm/llm.service";
import { LLM_OP_GENERATE_BOOKING_TITLE } from "../llm/llm-operations";
import { CALENDAR_PROMPT_IDS, getPrompt, renderPrompt } from "../llm/prompts";

export interface BookSlotOptions {
  userId: string;
  startTime: string;
  durationMinutes: number;
  guestEmail: string;
  guestName?: string;
  additionalGuests?: string[];
  agenda?: string;
}

export interface CreateEventOptions {
  userId: string;
  startTime: string;
  durationMinutes: number;
  guestEmail: string;
  guestName?: string;
  title?: string;
  description?: string;
  additionalGuests?: string[];
}

@Injectable()
export class CalendarAgendaService {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Summarises a meeting agenda into a short title using the LLM.
   * Falls back to a truncated version of the agenda text if the LLM call fails.
   */
  async summariseAgendaToTitle(agenda: string): Promise<string> {
    const MAX_TITLE_LENGTH = 60;
    try {
      const promptConfig = getPrompt(
        CALENDAR_PROMPT_IDS.GENERATE_BOOKING_TITLE,
      );
      if (!promptConfig) {
        return agenda.slice(0, MAX_TITLE_LENGTH);
      }
      const prompt = renderPrompt(promptConfig.prompt, {
        maxTitleLength: MAX_TITLE_LENGTH,
        agenda,
      });
      const title = await this.llmService.generateText(
        { prompt },
        undefined,
        undefined,
        LLM_OP_GENERATE_BOOKING_TITLE,
      );
      const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
      return trimmed || agenda.slice(0, MAX_TITLE_LENGTH);
    } catch {
      return agenda.slice(0, MAX_TITLE_LENGTH);
    }
  }

  /**
   * Books a slot, optionally using an agenda to generate a meeting title via LLM.
   * Delegates the actual calendar event creation to the provided `createEventFn`.
   */
  async bookSlotWithAgenda(
    options: BookSlotOptions,
    createEventFn: (
      opts: CreateEventOptions,
    ) => Promise<calendar_v3.Schema$Event & { meetLink: string | null }>,
  ): Promise<calendar_v3.Schema$Event & { meetLink: string | null }> {
    const { agenda, ...rest } = options;

    if (!agenda) {
      return createEventFn(rest);
    }

    const title = await this.summariseAgendaToTitle(agenda);
    return createEventFn({ ...rest, title, description: agenda });
  }
}
