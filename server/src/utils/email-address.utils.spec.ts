import { parseRecipientsFromString } from "./email-address.utils";

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
