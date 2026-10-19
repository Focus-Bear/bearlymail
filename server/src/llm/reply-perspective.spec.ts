import { INBOX_MODES } from "../constants/query-limits";
import {
  isFromUserAddress,
  resolveReplyPerspective,
  toReplyThreadHistory,
  UNKNOWN_RECIPIENT_NAME,
} from "./reply-perspective";

const USER_EMAIL = "jeremy@focusbear.io";
const OTHER_PARTY_EMAIL = "wellbeing@mq.edu.au";

const theirOutreachReply = {
  from: OTHER_PARTY_EMAIL,
  fromName: "Student Wellbeing",
  to: USER_EMAIL,
  receivedAt: new Date("2026-10-01T09:00:00Z"),
};
const userFollowUp = {
  from: USER_EMAIL,
  fromName: "Jeremy Nagel",
  to: "Wellbeing@mq.edu.au",
  receivedAt: new Date("2026-10-14T06:00:00Z"),
};

describe("isFromUserAddress", () => {
  it("matches the user's address regardless of case and display name", () => {
    expect(
      isFromUserAddress("Jeremy Nagel <Jeremy@FocusBear.io>", USER_EMAIL),
    ).toBe(true);
  });

  it("does not match another address or an unknown user email", () => {
    expect(isFromUserAddress(OTHER_PARTY_EMAIL, USER_EMAIL)).toBe(false);
    expect(isFromUserAddress("", "")).toBe(false);
    expect(isFromUserAddress(USER_EMAIL, null)).toBe(false);
  });
});

describe("resolveReplyPerspective", () => {
  it("is a follow-up to the other party when the user sent the latest message", () => {
    const perspective = resolveReplyPerspective({
      threadMessages: [userFollowUp, theirOutreachReply],
      replyTarget: userFollowUp,
      userEmail: USER_EMAIL,
    });

    expect(perspective).toEqual({
      isFollowUp: true,
      userEmail: USER_EMAIL,
      recipientName: "Student Wellbeing",
      recipientEmail: OTHER_PARTY_EMAIL,
    });
  });

  it("addresses the follow-up to whoever the user wrote to when nobody has replied yet", () => {
    const perspective = resolveReplyPerspective({
      threadMessages: [userFollowUp],
      replyTarget: userFollowUp,
      userEmail: USER_EMAIL,
    });

    expect(perspective.isFollowUp).toBe(true);
    expect(perspective.recipientEmail).toBe(OTHER_PARTY_EMAIL);
    expect(perspective.recipientName).toBe("Wellbeing");
    expect(perspective.recipientName).not.toBe("Jeremy Nagel");
  });

  it("judges the posted email alone when the thread is unknown", () => {
    const perspective = resolveReplyPerspective({
      threadMessages: [],
      replyTarget: {
        from: USER_EMAIL,
        fromName: "Jeremy Nagel",
        to: "Sam Lee <sam@example.com>",
      },
      userEmail: USER_EMAIL,
    });

    expect(perspective.isFollowUp).toBe(true);
    expect(perspective.recipientName).toBe("Sam Lee");
    expect(perspective.recipientEmail).toBe("sam@example.com");
  });

  it("is a follow-up when replying from the Follow-Up inbox", () => {
    const perspective = resolveReplyPerspective({
      threadMessages: [theirOutreachReply],
      replyTarget: theirOutreachReply,
      userEmail: USER_EMAIL,
      inboxMode: INBOX_MODES.FOLLOW_UP,
    });

    expect(perspective.isFollowUp).toBe(true);
    expect(perspective.recipientEmail).toBe(OTHER_PARTY_EMAIL);
  });

  it("is a normal reply to the sender when someone else sent the latest message", () => {
    const theirLatestReply = {
      ...theirOutreachReply,
      receivedAt: new Date("2026-10-15T09:00:00Z"),
    };
    const perspective = resolveReplyPerspective({
      threadMessages: [userFollowUp, theirLatestReply],
      replyTarget: theirLatestReply,
      userEmail: USER_EMAIL,
      inboxMode: INBOX_MODES.ACTION,
    });

    expect(perspective).toEqual({
      isFollowUp: false,
      userEmail: USER_EMAIL,
      recipientName: "Student Wellbeing",
      recipientEmail: OTHER_PARTY_EMAIL,
    });
  });

  it("falls back to a generic greeting name when nobody else is in the thread", () => {
    const perspective = resolveReplyPerspective({
      threadMessages: [{ ...userFollowUp, to: USER_EMAIL }],
      replyTarget: userFollowUp,
      userEmail: USER_EMAIL,
    });

    expect(perspective.recipientName).toBe(UNKNOWN_RECIPIENT_NAME);
    expect(perspective.recipientEmail).toBe("");
  });
});

describe("toReplyThreadHistory", () => {
  it("returns history oldest first without the email being replied to", () => {
    const history = toReplyThreadHistory(
      [
        { id: "latest", ...userFollowUp, body: "Just following up" },
        { id: "earlier", ...theirOutreachReply, body: "Tell us more" },
      ],
      "latest",
      USER_EMAIL,
    );

    expect(history).toEqual([
      {
        from: OTHER_PARTY_EMAIL,
        fromName: "Student Wellbeing",
        body: "Tell us more",
        receivedAt: theirOutreachReply.receivedAt,
        isFromUser: false,
      },
    ]);
  });
});
