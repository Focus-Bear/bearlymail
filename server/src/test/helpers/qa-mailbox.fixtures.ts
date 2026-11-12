import { MILLISECONDS } from "../../constants/time-constants";

/**
 * A made-up mailbox for FAQ-learning tests: the owner of a small dog-grooming
 * business, a few customers asking real questions, and the machine mail that
 * used to be mistaken for questions. All addresses use reserved example
 * domains; none of this is anyone's real mail.
 */

export const QA_FIXTURE_USER_EMAIL = "owner@sunnypaws.example";
export const QA_FIXTURE_USER_ALIAS = "Sunny Paws <bookings@sunnypaws.example>";

export const QA_FIXTURE_THREADS = {
  WEEKEND_ALICE: "t-weekend-alice",
  WEEKEND_BEN: "t-weekend-ben",
  PRICE_CHLOE: "t-price-chloe",
  PARKING_DAN_1: "t-parking-dan-1",
  PARKING_DAN_2: "t-parking-dan-2",
  ORDER_ERIN: "t-order-erin",
  THANKS_FRANK: "t-thanks-frank",
  HOURS_GRACE_AUTO_REPLIED: "t-hours-grace",
  NO_QUESTION_HENRY: "t-paperwork-henry",
  NEWSLETTER: "t-newsletter",
  RECEIPT: "t-receipt",
  CALENDAR_INVITE: "t-invite",
  USER_STARTED: "t-user-started",
} as const;

export interface FixtureSentReply {
  threadId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

export interface FixtureInboundMessage {
  threadId: string;
  emailThreadId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

const REPLY_DELAY_HOURS = 2;
const USER_STARTED_DAY_OFFSET = 14;
const BASE_TIME = new Date("2026-10-01T09:00:00Z").getTime();

interface FixtureThread {
  threadId: string;
  dayOffset: number;
  asker: string;
  subject: string;
  question: string;
  reply?: string;
  replyFrom?: string;
}

const THREADS: FixtureThread[] = [
  {
    threadId: QA_FIXTURE_THREADS.WEEKEND_ALICE,
    dayOffset: 1,
    asker: "Alice Nguyen <alice@example.com>",
    subject: "Saturday grooming?",
    question:
      "Hi there, do you have any appointments on Saturdays? Biscuit gets anxious when the salon is busy on weekdays.",
    reply:
      "Hi Alice, yes, we're open Saturdays 9am to 3pm. Saturday slots book out about two weeks ahead, so grab one at https://sunnypaws.example/book soon.",
  },
  {
    threadId: QA_FIXTURE_THREADS.WEEKEND_BEN,
    dayOffset: 3,
    asker: "ben.okafor@example.org",
    subject: "Weekend hours",
    question:
      "Are you open on weekends at all? Work makes weekday drop-offs really tricky for me.",
    reply:
      "Hi Ben, yes, we're open Saturdays 9am to 3pm and closed on Sundays. You can book online at https://sunnypaws.example/book.",
    replyFrom: QA_FIXTURE_USER_ALIAS,
  },
  {
    threadId: QA_FIXTURE_THREADS.PRICE_CHLOE,
    dayOffset: 4,
    asker: "Chloe Martin <chloe@example.net>",
    subject: "Price for a big dog",
    question:
      "How much is a full groom for a large dog like a golden retriever?",
    reply:
      "Hi Chloe, a full groom for a large dog is $95 and takes about two and a half hours. Matted coats can cost a little more.",
  },
  {
    threadId: QA_FIXTURE_THREADS.PARKING_DAN_1,
    dayOffset: 5,
    asker: "dan@example.com",
    subject: "Parking",
    question: "Is there parking near you? I'll have two dogs with me.",
    reply:
      "Hi Dan, yes, there's free two-hour parking right out front on Elm Street.",
  },
  {
    threadId: QA_FIXTURE_THREADS.PARKING_DAN_2,
    dayOffset: 9,
    asker: "Dan Price <dan@example.com>",
    subject: "Parking again",
    question: "Sorry, me again. Where is the best place to park on a Saturday?",
    reply:
      "No worries Dan, the free two-hour parking out front on Elm Street is the best spot.",
  },
  {
    threadId: QA_FIXTURE_THREADS.ORDER_ERIN,
    dayOffset: 6,
    asker: "Erin Walsh <erin@example.com>",
    subject: "Re: Your order #1234",
    question:
      "Thanks for the receipt. When will my oatmeal shampoo order ship?",
    reply:
      "Hi Erin, shampoo orders ship within 2 business days from our Elm Street shop, and you'll get a tracking link by email.",
  },
  {
    threadId: QA_FIXTURE_THREADS.THANKS_FRANK,
    dayOffset: 7,
    asker: "frank@example.org",
    subject: "Tomorrow?",
    question: "Can you fit Rex in tomorrow morning?",
    reply: "Sure thing, see you then!",
  },
  {
    threadId: QA_FIXTURE_THREADS.HOURS_GRACE_AUTO_REPLIED,
    dayOffset: 8,
    asker: "grace@example.net",
    subject: "Opening hours",
    question: "What are your opening hours during the week?",
    reply:
      "Hi Grace, we're open 8am to 6pm Monday to Friday, and 9am to 3pm on Saturdays.",
  },
  {
    threadId: QA_FIXTURE_THREADS.NO_QUESTION_HENRY,
    dayOffset: 10,
    asker: "henry@example.com",
    subject: "Paperwork",
    question: "Attached is the signed vaccination form from last week.",
    reply:
      "Thanks Henry, got the form and saved it to Milo's file so you're all set for next month.",
  },
  {
    threadId: QA_FIXTURE_THREADS.NEWSLETTER,
    dayOffset: 11,
    asker: "Pet Supplies Co <newsletter@petsupplies.example>",
    subject: "Is your dog ready for winter?",
    question:
      "Is your dog ready for winter? Shop our coat sale this week only.",
    reply:
      "Please remove me from this list, I never signed up and do not want these emails.",
  },
  {
    threadId: QA_FIXTURE_THREADS.RECEIPT,
    dayOffset: 12,
    asker: "orders@groomsupply.example",
    subject: "Your order confirmation #4411",
    question: "Thanks for your order! Questions? Reply to this email.",
    reply:
      "Hi, could you change the delivery address to the salon at 12 Elm Street please? Thanks.",
  },
  {
    threadId: QA_FIXTURE_THREADS.CALENDAR_INVITE,
    dayOffset: 13,
    asker: "Ivy Chen <ivy@example.org>",
    subject: "Invitation: Supplier catch-up @ Tue 14 Oct 10am",
    question:
      "Would you like to join the supplier catch-up? Join with the link.",
    reply:
      "Hi Ivy, Tuesday works for me, I'll bring the updated price list for the shampoos.",
  },
];

/** A thread the user started; nobody asked anything. */
const USER_STARTED_REPLY: FixtureSentReply = {
  threadId: QA_FIXTURE_THREADS.USER_STARTED,
  from: QA_FIXTURE_USER_EMAIL,
  subject: "Holiday closure",
  body: "Hi all, just a heads up that the salon is closed from 24 December to 2 January.",
  receivedAt: new Date(BASE_TIME + USER_STARTED_DAY_OFFSET * MILLISECONDS.DAY),
};

function askedAt(thread: FixtureThread): Date {
  return new Date(BASE_TIME + thread.dayOffset * MILLISECONDS.DAY);
}

export function buildFixtureInboundMessages(): FixtureInboundMessage[] {
  return THREADS.map((thread) => ({
    threadId: thread.threadId,
    emailThreadId: `db-${thread.threadId}`,
    from: thread.asker,
    subject: thread.subject,
    body: thread.question,
    receivedAt: askedAt(thread),
  }));
}

export function buildFixtureSentReplies(): FixtureSentReply[] {
  const replies = THREADS.filter((thread) => thread.reply).map((thread) => ({
    threadId: thread.threadId,
    from: thread.replyFrom ?? QA_FIXTURE_USER_EMAIL,
    subject: `Re: ${thread.subject}`,
    body: thread.reply ?? "",
    receivedAt: new Date(
      askedAt(thread).getTime() + REPLY_DELAY_HOURS * MILLISECONDS.HOUR,
    ),
  }));
  return [...replies, USER_STARTED_REPLY];
}
