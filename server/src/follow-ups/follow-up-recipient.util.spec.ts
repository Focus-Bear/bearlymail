import {
  resolveFollowUpRecipient,
  ThreadMessage,
} from "./follow-up-recipient.util";

/**
 * Regression tests for the #14 fix: a follow-up must chase the person the user
 * was actually writing to, not whoever most recently sent a non-user message in
 * the thread (which, on an introduction thread, is the introducer).
 */
describe("resolveFollowUpRecipient", () => {
  const scottIntro: ThreadMessage = {
    from: "Scott Crowe <scott@focusbear.io>",
    fromName: "Scott Crowe",
    to: "Jeremy Nagel <jeremy@focusbear.io>, Sasha Gusain <sasha@summer-works.com>",
    body: "Hi Sasha and Jeremy, as discussed I think it makes sense for you to chat.",
    receivedAt: new Date("2026-07-07T02:41:01Z"),
    isFromUser: false,
  };
  const jeremyToSasha: ThreadMessage = {
    from: "Jeremy Nagel <jeremy@focusbear.io>",
    fromName: "Jeremy Nagel",
    to: "Sasha Gusain <sasha@summer-works.com>",
    body: "Thanks heaps for the intro Scott. Hi Sasha, would you be up for a chat?",
    receivedAt: new Date("2026-07-07T03:00:00Z"),
    isFromUser: true,
  };

  it("resolves the real recipient, not the introducer, when they have not replied", () => {
    const result = resolveFollowUpRecipient(
      [scottIntro, jeremyToSasha],
      "Jeremy Nagel",
    );

    expect(result.theirName).toBe("Sasha Gusain");
    expect(result.theirName).not.toBe("Scott Crowe");
    // Sasha never replied, so there is no message from the current recipient.
    expect(result.messagesFromCurrentRecipient).toHaveLength(0);
  });

  it("uses the recipient's own reply once they have replied", () => {
    const sashaReply: ThreadMessage = {
      from: "Sasha Gusain <sasha@summer-works.com>",
      fromName: "Sasha Gusain",
      to: "Jeremy Nagel <jeremy@focusbear.io>",
      body: "Sure, Tuesday works for me.",
      receivedAt: new Date("2026-07-08T09:00:00Z"),
      isFromUser: false,
    };

    const result = resolveFollowUpRecipient(
      [scottIntro, jeremyToSasha, sashaReply],
      "Jeremy Nagel",
    );

    expect(result.theirName).toBe("Sasha Gusain");
    expect(result.messagesFromCurrentRecipient).toHaveLength(1);
    expect(result.messagesFromCurrentRecipient[0].body).toContain("Tuesday");
  });

  it("ignores replies from other people in the thread (only the addressed recipient)", () => {
    const scottChiming: ThreadMessage = {
      ...scottIntro,
      body: "Great, glad you two are connecting!",
      receivedAt: new Date("2026-07-09T10:00:00Z"),
    };

    const result = resolveFollowUpRecipient(
      [scottIntro, jeremyToSasha, scottChiming],
      "Jeremy Nagel",
    );

    // The user addressed Sasha; Scott's later message must not be treated as
    // "their" reply.
    expect(result.theirName).toBe("Sasha Gusain");
    expect(result.messagesFromCurrentRecipient).toHaveLength(0);
  });

  it("throws when the thread has no message from the user", () => {
    expect(() =>
      resolveFollowUpRecipient([scottIntro], "Jeremy Nagel"),
    ).toThrow("No user message found in thread");
  });
});
