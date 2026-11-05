import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { DEAL_NOTE_CONTENT_MAX_LENGTH } from "../deal-notes.constants";
import { DealNoteContentDto } from "./deal-note-content.dto";

const errorsFor = async (body: unknown) =>
  validate(plainToInstance(DealNoteContentDto, body));

describe("DealNoteContentDto", () => {
  it("accepts a note and trims surrounding whitespace", async () => {
    const dto = plainToInstance(DealNoteContentDto, { content: "  Hi  " });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.content).toBe("Hi");
  });

  it.each([
    ["a whitespace-only note", { content: "   " }],
    ["a missing note", {}],
    ["a non-string note", { content: 42 }],
    [
      "an over-long note",
      { content: "x".repeat(DEAL_NOTE_CONTENT_MAX_LENGTH + 1) },
    ],
  ])("rejects %s", async (_label, body) => {
    expect(await errorsFor(body)).not.toHaveLength(0);
  });
});
