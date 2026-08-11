import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { CreateFromEmailProposalDto } from "./calendar.controller";

/**
 * The create-invite endpoint defaults to inviting everyone on the thread, so the
 * payload carries an `attendees` array. These tests lock in that the array is
 * accepted and that malformed email addresses are rejected by validation.
 */
describe("CreateFromEmailProposalDto validation", () => {
  const base = {
    emailId: "email-1",
    proposedTime: "2026-04-15T09:00:00Z",
    topic: "Team sync",
    durationMinutes: 30,
  };

  const validate = (payload: Record<string, unknown>) =>
    validateSync(plainToInstance(CreateFromEmailProposalDto, payload));

  it("accepts a full list of valid attendee emails", () => {
    const errors = validate({
      ...base,
      attendees: ["a@example.com", "b@example.com", "c@example.com"],
    });
    expect(errors).toHaveLength(0);
  });

  it("accepts a payload without attendees (backward compatibility)", () => {
    expect(validate(base)).toHaveLength(0);
  });

  it("rejects an invalid email in the attendees array", () => {
    const errors = validate({
      ...base,
      attendees: ["ok@example.com", "not-an-email"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("attendees");
  });

  it("rejects a missing required field", () => {
    const errors = validate({
      proposedTime: "2026-04-15T09:00:00Z",
      topic: "x",
    });
    expect(errors.some((error) => error.property === "emailId")).toBe(true);
  });
});
