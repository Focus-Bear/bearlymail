import {
  deriveRecipientDisplayName,
  parseRecipientsFromString,
  sanitizeRecipientList,
} from "./email-address.utils";

describe("parseRecipientsFromString", () => {
  it("parses a bare email", () => {
    expect(parseRecipientsFromString("alice@example.com")).toEqual([
      { email: "alice@example.com" },
    ]);
  });

  it("parses a name + angle-addr", () => {
    expect(parseRecipientsFromString("Alice <alice@example.com>")).toEqual([
      { name: "Alice", email: "alice@example.com" },
    ]);
  });

  it("parses a comma-separated list of distinct recipients", () => {
    expect(parseRecipientsFromString("alice@a.com, Bob <bob@b.com>")).toEqual([
      { email: "alice@a.com" },
      { name: "Bob", email: "bob@b.com" },
    ]);
  });

  it("does NOT split on a comma inside a quoted display name", () => {
    expect(
      parseRecipientsFromString(
        '"Nagel, Jeremy - Founder" <jeremy@focusbear.io>',
      ),
    ).toEqual([
      { name: "Nagel, Jeremy - Founder", email: "jeremy@focusbear.io" },
    ]);
  });

  it("handles a quoted comma name mixed with a bare email (reply-all case)", () => {
    expect(
      parseRecipientsFromString(
        'rohan@gmail.com, "Jeremy Nagel - Founder, Focus Bear" <jeremy@focusbear.io>',
      ),
    ).toEqual([
      { email: "rohan@gmail.com" },
      {
        name: "Jeremy Nagel - Founder, Focus Bear",
        email: "jeremy@focusbear.io",
      },
    ]);
  });

  it("unescapes escaped quotes inside a quoted name", () => {
    expect(
      parseRecipientsFromString('"The \\"Boss\\"" <boss@example.com>'),
    ).toEqual([{ name: 'The "Boss"', email: "boss@example.com" }]);
  });

  it("drops empty segments from trailing/double commas", () => {
    expect(parseRecipientsFromString("a@x.com,, b@y.com,")).toEqual([
      { email: "a@x.com" },
      { email: "b@y.com" },
    ]);
  });
});

describe("sanitizeRecipientList", () => {
  it("passes a normal list through unchanged", () => {
    expect(sanitizeRecipientList("alice@a.com, Bob <bob@b.com>")).toEqual({
      sanitized: "alice@a.com, Bob <bob@b.com>",
      invalid: [],
    });
  });

  it('silently drops the empty-group token "undisclosed-recipients:;"', () => {
    expect(
      sanitizeRecipientList(
        "committees@aadpa.com.au, undisclosed-recipients:;",
      ),
    ).toEqual({ sanitized: "committees@aadpa.com.au", invalid: [] });
  });

  it("drops group tokens without the trailing semicolon", () => {
    expect(sanitizeRecipientList("Undisclosed recipients:")).toEqual({
      sanitized: "",
      invalid: [],
    });
  });

  it('drops the empty-group token with whitespace "undisclosed-recipients: ;"', () => {
    expect(
      sanitizeRecipientList(
        "committees@aadpa.com.au, undisclosed-recipients: ;",
      ),
    ).toEqual({ sanitized: "committees@aadpa.com.au", invalid: [] });
  });

  it("reports addresses without an @ as invalid", () => {
    expect(sanitizeRecipientList("a@x.com, bob")).toEqual({
      sanitized: "a@x.com",
      invalid: ["bob"],
    });
  });

  it("reports a name + angle-addr whose addr-spec has no @ as invalid", () => {
    expect(sanitizeRecipientList("Bob <bob>")).toEqual({
      sanitized: "",
      invalid: ["Bob <bob>"],
    });
  });

  it("keeps a quoted display name containing a colon", () => {
    expect(sanitizeRecipientList('"Re: project" <project@x.com>')).toEqual({
      sanitized: '"Re: project" <project@x.com>',
      invalid: [],
    });
  });

  it("keeps a quoted display name containing a comma", () => {
    expect(sanitizeRecipientList('"Doe, Jane" <jane@x.com>')).toEqual({
      sanitized: '"Doe, Jane" <jane@x.com>',
      invalid: [],
    });
  });

  it("returns empty for an empty string", () => {
    expect(sanitizeRecipientList("")).toEqual({ sanitized: "", invalid: [] });
  });
});

describe("deriveRecipientDisplayName", () => {
  it("returns the display name when present", () => {
    expect(deriveRecipientDisplayName("Sudhir Kumar <sudhir@noat.ca>")).toBe(
      "Sudhir Kumar",
    );
  });

  it("title-cases the local part when there is no display name", () => {
    expect(deriveRecipientDisplayName("sudhir@noat.ca")).toBe("Sudhir");
  });

  it("splits and title-cases a dotted local part", () => {
    expect(deriveRecipientDisplayName("sudhir.kumar@noat.ca")).toBe(
      "Sudhir Kumar",
    );
  });

  it("splits on underscores and hyphens too", () => {
    expect(deriveRecipientDisplayName("sudhir_kumar@noat.ca")).toBe(
      "Sudhir Kumar",
    );
    expect(deriveRecipientDisplayName("sudhir-kumar@noat.ca")).toBe(
      "Sudhir Kumar",
    );
  });

  it("only uses the first recipient when there are multiple", () => {
    expect(
      deriveRecipientDisplayName("sudhir@noat.ca, Bob <bob@noat.ca>"),
    ).toBe("Sudhir");
  });

  it("strips a plus-addressing suffix before deriving the name", () => {
    expect(deriveRecipientDisplayName("sudhir+test@noat.ca")).toBe("Sudhir");
    expect(deriveRecipientDisplayName("sudhir.kumar+test@noat.ca")).toBe(
      "Sudhir Kumar",
    );
  });

  it("returns null for empty or missing input", () => {
    expect(deriveRecipientDisplayName("")).toBeNull();
    expect(deriveRecipientDisplayName(undefined)).toBeNull();
    expect(deriveRecipientDisplayName(null)).toBeNull();
  });
});
