import { TONE_CHECK } from "../constants/tone-check.constants";
import {
  describeRecipient,
  summariseAttachments,
  summariseRecipients,
  suppressAttachmentNagsWhenAttached,
} from "./llm-tone.helper";
import type { ToneCheckResult } from "./llm-tone.types";

describe("describeRecipient", () => {
  it("renders a named recipient as 'Name <email>'", () => {
    expect(
      describeRecipient({ name: "Rob Smith", email: "rob@acme.com" }),
    ).toBe("Rob Smith <rob@acme.com>");
  });

  it("falls back to the bare address when no name is known", () => {
    expect(describeRecipient({ email: "rob@acme.com" })).toBe("rob@acme.com");
    expect(describeRecipient({ email: "rob@acme.com", name: "  " })).toBe(
      "rob@acme.com",
    );
  });
});

describe("summariseAttachments / summariseRecipients", () => {
  it("joins the lists for the prompt", () => {
    expect(summariseAttachments(["a.csv", "b.pdf"])).toBe("a.csv, b.pdf");
    expect(
      summariseRecipients([
        { name: "Rob Smith", email: "rob@acme.com" },
        { email: "sam@acme.com" },
      ]),
    ).toBe("Rob Smith <rob@acme.com>, sam@acme.com");
  });

  it("renders the empty case as the exact label the prompt keys off", () => {
    expect(summariseAttachments([])).toBe(TONE_CHECK.NO_ATTACHMENTS_LABEL);
    expect(summariseRecipients([])).toBe(TONE_CHECK.UNKNOWN_RECIPIENTS_LABEL);
  });
});

describe("suppressAttachmentNagsWhenAttached", () => {
  const flagged: ToneCheckResult = {
    isOk: false,
    significance: "medium",
    suggestions: ["The draft is missing the attachment mentioned in the text."],
    revisedText: "<p>revised</p>",
    attachmentReminder: "You mentioned an attachment — did you forget it?",
  };

  it("leaves the result untouched when nothing is attached", () => {
    expect(suppressAttachmentNagsWhenAttached(flagged, [])).toEqual(flagged);
  });

  it("clears the reminder and the blocking suggestion when a file is attached", () => {
    const result = suppressAttachmentNagsWhenAttached(flagged, ["report.csv"]);

    expect(result.attachmentReminder).toBeNull();
    expect(result.suggestions).toEqual([]);
    expect(result.isOk).toBe(true);
    expect(result.revisedText).toBeUndefined();
  });

  it("keeps genuine tone suggestions and stays blocking", () => {
    const result = suppressAttachmentNagsWhenAttached(
      {
        ...flagged,
        suggestions: [
          "The draft is missing the attachment mentioned in the text.",
          "The opening line reads as accusatory.",
        ],
      },
      ["report.csv"],
    );

    expect(result.suggestions).toEqual([
      "The opening line reads as accusatory.",
    ]);
    expect(result.isOk).toBe(false);
    expect(result.attachmentReminder).toBeNull();
  });
});
