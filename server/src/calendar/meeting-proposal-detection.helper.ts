/**
 * Runs meeting-proposal detection on the email the user is viewing: the timezone-aware LLM
 * detector with earlier thread messages as context, then the bare-time pattern fallback.
 */

import { createLogger } from "../utils/logger";
import type { CalendarService } from "./calendar.service";
import {
  applyTimePatternFallback,
  type AttributedMeetingProposal,
} from "./meeting-proposal-enrichment.helper";

const proposalLog = createLogger("CalendarMeetingProposal");

type ViewedEmail = NonNullable<
  Awaited<ReturnType<CalendarService["emailsService"]["getEmailById"]>>
>;

/** How many earlier thread messages to feed the detector as confirmation-reply context. */
const MAX_PRIOR_THREAD_MESSAGES = 4;

/**
 * Returns the messages that came BEFORE the viewed email in its thread, oldest first,
 * capped to the most recent {@link MAX_PRIOR_THREAD_MESSAGES}. These give the detector
 * the original proposal so a short confirmation reply can inherit its day/date.
 */
async function getPriorThreadMessages(
  service: CalendarService,
  userId: string,
  viewedEmail: { id: string; threadId?: string | null },
): Promise<Array<{ from: string; fromName?: string; body: string }>> {
  if (!viewedEmail.threadId) {
    return [];
  }
  try {
    const threadEmails = await service.emailsService.getThreadEmails(
      userId,
      viewedEmail.threadId,
      { order: "ASC" },
    );
    const viewedIndex = threadEmails.findIndex(
      (threadEmail) => threadEmail.id === viewedEmail.id,
    );
    const priorEmails =
      viewedIndex !== -1 ? threadEmails.slice(0, viewedIndex) : threadEmails;
    return priorEmails
      .filter(
        (threadEmail) =>
          threadEmail.id !== viewedEmail.id &&
          Boolean(threadEmail.body || threadEmail.htmlBody),
      )
      .slice(-MAX_PRIOR_THREAD_MESSAGES)
      .map((threadEmail) => ({
        from: threadEmail.from,
        fromName: threadEmail.fromName,
        body: threadEmail.body || threadEmail.htmlBody || "",
      }));
  } catch (error) {
    proposalLog.warn(
      `[getPriorThreadMessages] failed to load thread context for email ${viewedEmail.id}`,
      error,
    );
    return [];
  }
}

export async function detectProposalForEmail(
  service: CalendarService,
  userId: string,
  email: ViewedEmail,
  userTimezone: string,
): Promise<AttributedMeetingProposal> {
  // Gather earlier messages in the thread so a short confirmation reply
  // ("great, lock in 2pm") can inherit the day/date from the original
  // proposal — the viewed email alone often only restates the time.
  const priorMessages = await getPriorThreadMessages(service, userId, email);

  proposalLog.debug(
    `[checkMeetingProposal] running timezone-aware detect on viewed email ${email.id} with userTimezone="${userTimezone}" priorMessages=${priorMessages.length}`,
  );
  const latestBody = email.body || email.htmlBody || "";
  const detected = await service.llmService.detectMeetingProposal(
    {
      from: email.from,
      fromName: email.fromName,
      subject: email.subject || "",
      body: latestBody,
      priorMessages,
    },
    undefined,
    userId,
    userTimezone,
  );
  // The LLM only accepts proposals that name a day, so "Would 11.30am (Fremantle time) suit?"
  // came back empty and the card fell back to generic share-availability actions.
  return applyTimePatternFallback(detected, {
    latestBody,
    priorBodies: priorMessages.map((message) => message.body),
    userTimezone,
    receivedAt: email.receivedAt ? new Date(email.receivedAt) : undefined,
    now: new Date(),
  });
}
