import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { ORG_PLAN_STATUS } from "../constants/domain-statuses";
import {
  EMAIL_TRACKING_STATUS,
  TRACKED_SEND_SOURCE,
  UNTRACKED_REASON,
} from "../constants/email-tracking.constants";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { EmailProvider } from "../emails/interfaces/email-provider.interface";
import { mockPartial } from "../test/helpers/mock-utils";
import { TrackedEmailSender } from "./tracked-email-sender.service";
import {
  buildTrackingPixelUrl,
  extractTrackingTokens,
} from "./tracking-pixel.helpers";

const USER_ID = "user-1";
const PUBLIC_BACKEND = "https://api.bearlymail.com";
const SENT = { messageId: "msg-1", threadId: "thread-1" };
const OLD_TOKEN = "zzzzzzzzzzzzzzzzzzzzzz";

describe("TrackedEmailSender", () => {
  let sender: TrackedEmailSender;
  let provider: jest.Mocked<Pick<EmailProvider, "sendReply" | "sendEmail">> & {
    sendsPlainTextOnly?: boolean;
  };
  const trackingRepository = {
    create: jest.fn((row: Partial<EmailTracking>) => row),
    save: jest.fn(async (row: Partial<EmailTracking>) => row),
  };
  const userRepository = { findOne: jest.fn() };
  const memberRepository = { findOne: jest.fn() };
  const configValues: Record<string, string | undefined> = {};
  const configService = { get: (key: string) => configValues[key] };
  const membershipOnPlan = (org: Partial<Organization>) =>
    mockPartial<OrganizationMember>({
      organization: mockPartial<Organization>({
        planStatus: ORG_PLAN_STATUS.ACTIVE,
        volumeTierProductId: "bearlymail_growth",
        grandfatheredEmailTracking: false,
        trialEndsAt: null,
        ...org,
      }),
    });
  const originalBackendUrl = process.env.BACKEND_URL;

  const asProvider = () => provider as unknown as EmailProvider;
  const savedRow = (): Partial<EmailTracking> =>
    trackingRepository.save.mock.calls[0][0];
  const sentReplyHtml = (): string =>
    provider.sendReply.mock.calls[0][1].options?.htmlBody ?? "";
  const sentEmailHtml = (): string =>
    provider.sendEmail.mock.calls[0][1].htmlBody ?? "";

  const replyParams = (htmlBody?: string) => ({
    threadId: "thread-1",
    to: "Alice <alice@example.com>",
    subject: "Re: hi",
    body: "plain body",
    options: { htmlBody, cc: "bob@example.com" },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.BACKEND_URL = PUBLIC_BACKEND;
    userRepository.findOne.mockResolvedValue(
      mockPartial<User>({ id: USER_ID, trackEmailOpens: true }),
    );
    memberRepository.findOne.mockResolvedValue(membershipOnPlan({}));
    delete configValues.SELF_HOSTED;
    provider = {
      sendReply: jest.fn().mockResolvedValue(SENT),
      sendEmail: jest.fn().mockResolvedValue(SENT),
    };

    const module = await Test.createTestingModule({
      providers: [
        TrackedEmailSender,
        {
          provide: getRepositoryToken(EmailTracking),
          useValue: trackingRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: memberRepository,
        },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    sender = module.get(TrackedEmailSender);
  });

  afterAll(() => {
    process.env.BACKEND_URL = originalBackendUrl;
  });

  it("injects exactly one pixel into a reply's HTML and records the token", async () => {
    const result = await sender.sendReply(
      USER_ID,
      asProvider(),
      replyParams("<p>Hello</p>"),
      { source: TRACKED_SEND_SOURCE.REPLY },
    );

    expect(result).toEqual(SENT);
    const tokens = extractTrackingTokens(sentReplyHtml());
    expect(tokens).toHaveLength(1);
    expect(sentReplyHtml()).toContain(`${PUBLIC_BACKEND}/t/o/${tokens[0]}.gif`);
    // The plain-text part never carries the pixel.
    expect(provider.sendReply.mock.calls[0][1].body).toBe("plain body");
    expect(savedRow()).toMatchObject({
      userId: USER_ID,
      status: EMAIL_TRACKING_STATUS.TRACKED,
      token: tokens[0],
      messageId: SENT.messageId,
      threadId: SENT.threadId,
      recipients: "alice@example.com, bob@example.com",
      recipientCount: 2,
      source: TRACKED_SEND_SOURCE.REPLY,
    });
  });

  it("leaves plain-text-only replies untracked", async () => {
    await sender.sendReply(USER_ID, asProvider(), replyParams(undefined), {
      source: TRACKED_SEND_SOURCE.FOLLOW_UP,
    });

    expect(
      provider.sendReply.mock.calls[0][1].options?.htmlBody,
    ).toBeUndefined();
    expect(savedRow()).toMatchObject({
      status: EMAIL_TRACKING_STATUS.UNTRACKED,
      untrackedReason: UNTRACKED_REASON.PLAIN_TEXT,
      token: null,
      recipients: null,
    });
  });

  it("does not track when the user turned the setting off", async () => {
    userRepository.findOne.mockResolvedValue(
      mockPartial<User>({ id: USER_ID, trackEmailOpens: false }),
    );

    await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
      source: TRACKED_SEND_SOURCE.REPLY,
    });

    expect(extractTrackingTokens(sentReplyHtml())).toHaveLength(0);
    expect(savedRow()).toMatchObject({
      status: EMAIL_TRACKING_STATUS.UNTRACKED,
      untrackedReason: UNTRACKED_REASON.SETTING_DISABLED,
    });
  });

  describe("plan gating", () => {
    const expectPlanExcluded = async (trackOpens?: boolean) => {
      await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
        trackOpens,
      });
      expect(extractTrackingTokens(sentReplyHtml())).toHaveLength(0);
      expect(savedRow()).toMatchObject({
        status: EMAIL_TRACKING_STATUS.UNTRACKED,
        untrackedReason: UNTRACKED_REASON.PLAN_EXCLUDES_TRACKING,
      });
    };

    it("does not track on Starter, even with an explicit per-message opt-in", async () => {
      memberRepository.findOne.mockResolvedValue(
        membershipOnPlan({ volumeTierProductId: "bearlymail_starter" }),
      );
      await expectPlanExcluded(true);
    });

    it("does not track once the plan has expired", async () => {
      memberRepository.findOne.mockResolvedValue(
        membershipOnPlan({ planStatus: ORG_PLAN_STATUS.EXPIRED }),
      );
      await expectPlanExcluded();
    });

    it.each([
      ["Growth", { volumeTierProductId: "bearlymail_growth" }],
      ["Enterprise", { volumeTierProductId: "bearlymail_enterprise" }],
      [
        "a Starter org grandfathered from the old price",
        {
          volumeTierProductId: "bearlymail_starter",
          grandfatheredEmailTracking: true,
        },
      ],
      [
        "a running trial",
        {
          planStatus: ORG_PLAN_STATUS.TRIAL,
          volumeTierProductId: null,
          trialEndsAt: new Date(Date.now() + 60_000),
        },
      ],
    ])("tracks on %s", async (_label, org) => {
      memberRepository.findOne.mockResolvedValue(membershipOnPlan(org));
      await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
      });
      expect(savedRow()).toMatchObject({
        status: EMAIL_TRACKING_STATUS.TRACKED,
      });
    });

    it("ignores plans on a self-hosted deployment", async () => {
      configValues.SELF_HOSTED = "true";
      memberRepository.findOne.mockResolvedValue(
        membershipOnPlan({ volumeTierProductId: "bearlymail_starter" }),
      );
      await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
      });
      expect(savedRow()).toMatchObject({
        status: EMAIL_TRACKING_STATUS.TRACKED,
      });
      expect(memberRepository.findOne).not.toHaveBeenCalled();
    });

    it("reports a per-message opt-out rather than the plan", async () => {
      memberRepository.findOne.mockResolvedValue(
        membershipOnPlan({ volumeTierProductId: "bearlymail_starter" }),
      );
      await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
        trackOpens: false,
      });
      expect(savedRow()).toMatchObject({
        untrackedReason: UNTRACKED_REASON.MESSAGE_OPT_OUT,
      });
    });
  });

  it("honours a per-message opt-out over the setting", async () => {
    await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
      source: TRACKED_SEND_SOURCE.REPLY,
      trackOpens: false,
    });

    expect(extractTrackingTokens(sentReplyHtml())).toHaveLength(0);
    expect(savedRow().untrackedReason).toBe(UNTRACKED_REASON.MESSAGE_OPT_OUT);
  });

  it("honours a per-message opt-in even when the setting is off", async () => {
    userRepository.findOne.mockResolvedValue(
      mockPartial<User>({ id: USER_ID, trackEmailOpens: false }),
    );

    await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
      source: TRACKED_SEND_SOURCE.REPLY,
      trackOpens: true,
    });

    expect(extractTrackingTokens(sentReplyHtml())).toHaveLength(1);
  });

  it("skips providers that only send plain text (Apple Mail)", async () => {
    provider.sendsPlainTextOnly = true;

    await sender.sendEmail(
      USER_ID,
      asProvider(),
      { to: [{ email: "a@example.com" }], subject: "s", body: "<p>Hi</p>" },
      { source: TRACKED_SEND_SOURCE.NEW },
    );

    expect(extractTrackingTokens(sentEmailHtml())).toHaveLength(0);
    expect(savedRow().untrackedReason).toBe(
      UNTRACKED_REASON.PROVIDER_PLAIN_TEXT,
    );
  });

  it("skips tracking when recipients could not reach a localhost backend", async () => {
    process.env.BACKEND_URL = "http://localhost:3001";

    await sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
      source: TRACKED_SEND_SOURCE.REPLY,
    });

    expect(extractTrackingTokens(sentReplyHtml())).toHaveLength(0);
    expect(savedRow().untrackedReason).toBe(UNTRACKED_REASON.NO_PUBLIC_URL);
  });

  it("tracks new messages via the HTML part, treating body as HTML", async () => {
    await sender.sendEmail(
      USER_ID,
      asProvider(),
      {
        to: [{ email: "a@example.com" }],
        cc: [{ email: "c@example.com" }],
        subject: "s",
        body: "<p>Hi</p>",
      },
      { source: TRACKED_SEND_SOURCE.NEW },
    );

    const sentParams = provider.sendEmail.mock.calls[0][1];
    expect(extractTrackingTokens(sentParams.htmlBody)).toHaveLength(1);
    expect(extractTrackingTokens(sentParams.body)).toHaveLength(0);
    expect(savedRow()).toMatchObject({
      status: EMAIL_TRACKING_STATUS.TRACKED,
      recipientCount: 2,
    });
  });

  it("strips an older message's pixel from forwarded content even when untracked", async () => {
    userRepository.findOne.mockResolvedValue(
      mockPartial<User>({ id: USER_ID, trackEmailOpens: false }),
    );
    const quoted = `<p>fwd</p><img src="${buildTrackingPixelUrl(PUBLIC_BACKEND, OLD_TOKEN)}" />`;

    await sender.sendEmail(
      USER_ID,
      asProvider(),
      {
        to: [{ email: "a@example.com" }],
        subject: "Fwd",
        body: "x",
        htmlBody: quoted,
      },
      { source: TRACKED_SEND_SOURCE.FORWARD },
    );

    expect(extractTrackingTokens(sentEmailHtml())).toHaveLength(0);
  });

  it("propagates provider failures without recording anything", async () => {
    provider.sendReply.mockRejectedValue(new Error("boom"));

    await expect(
      sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
      }),
    ).rejects.toThrow("boom");
    expect(trackingRepository.save).not.toHaveBeenCalled();
  });

  it("still reports success when recording the send fails", async () => {
    trackingRepository.save.mockRejectedValueOnce(new Error("db down"));

    await expect(
      sender.sendReply(USER_ID, asProvider(), replyParams("<p>Hi</p>"), {
        source: TRACKED_SEND_SOURCE.REPLY,
      }),
    ).resolves.toEqual(SENT);
  });
});
