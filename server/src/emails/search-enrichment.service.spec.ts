import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { toEnrichedResult } from "./search-enrichment.service";

/**
 * The search snippet is built from `Email.body`, which is not reliably plain
 * text: when a message has no text/plain part the provider stores markup there,
 * which used to reach the results list as literal `<p>` tags.
 */
describe("toEnrichedResult snippet", () => {
  const emailWith = (
    fields: Partial<Email>,
  ): Email & { thread?: EmailThread } =>
    ({
      id: "email-1",
      messageId: "msg-1",
      threadId: "thread-1",
      subject: "Free Access to Executive Functioning App",
      from: "jeremy@focusbear.io",
      isRead: false,
      receivedAt: new Date("2026-09-01T00:00:00Z"),
      ...fields,
    }) as Email & { thread?: EmailThread };

  it("renders an HTML-only body as readable text", () => {
    const result = toEnrichedResult(
      emailWith({
        body: "<p>Hi again,</p><p>Wanted to check if you got my last email.</p>",
      }),
    );

    expect(result.snippet).not.toContain("<p>");
    expect(result.snippet).toContain("Hi again,");
    expect(result.snippet).toContain(
      "Wanted to check if you got my last email.",
    );
  });

  it("leaves an already plain-text body readable", () => {
    const result = toEnrichedResult(
      emailWith({ body: "Hi VU Disability and accessibility services team," }),
    );

    expect(result.snippet).toContain(
      "Hi VU Disability and accessibility services team,",
    );
  });

  it("falls back to the html body when there is no plain-text body", () => {
    const result = toEnrichedResult(
      emailWith({ body: "", htmlBody: "<div>Only markup here</div>" }),
    );

    expect(result.snippet).not.toContain("<div>");
    expect(result.snippet).toContain("Only markup here");
  });

  it("returns an empty snippet when the email has no content at all", () => {
    expect(toEnrichedResult(emailWith({ body: "" })).snippet).toBe("");
  });
});
