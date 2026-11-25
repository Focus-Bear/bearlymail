import { Email } from "../database/entities/email.entity";
import { buildForwardBody } from "./forward-body.helpers";

const original = (fields: Partial<Email>): Email =>
  ({
    from: "jo@example.com",
    fromName: "Jo",
    to: "me@example.com",
    subject: "Numbers",
    receivedAt: new Date("2026-11-20T09:00:00Z"),
    ...fields,
  }) as Email;

describe("buildForwardBody", () => {
  it("is plain text: no tags from the note, and the sender's address kept (#514)", () => {
    const body = buildForwardBody(
      "<p>FYI</p>",
      original({ body: "Plain copy", htmlBody: "<p>Rich copy</p>" }),
    );

    expect(body.startsWith("FYI\n\n----------")).toBe(true);
    expect(body).toContain("From: Jo <jo@example.com>");
    expect(body).toContain("Plain copy");
    expect(body).not.toContain("<p>");
  });

  it("uses the stripped HTML when the original has no text", () => {
    const body = buildForwardBody(
      "FYI",
      original({ body: "", htmlBody: "<p>Rich copy</p>" }),
    );

    expect(body.endsWith("Rich copy")).toBe(true);
  });
});
