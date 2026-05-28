import { parseLabelsValue, parsePostgresTextArray } from "./labels.util";

describe("parsePostgresTextArray", () => {
  it("parses a quoted Postgres array literal", () => {
    expect(parsePostgresTextArray('{"INBOX","IMPORTANT"}')).toEqual([
      "INBOX",
      "IMPORTANT",
    ]);
  });

  it("parses an unquoted Postgres array literal", () => {
    expect(parsePostgresTextArray("{INBOX,IMPORTANT}")).toEqual([
      "INBOX",
      "IMPORTANT",
    ]);
  });

  it("parses an empty array literal", () => {
    expect(parsePostgresTextArray("{}")).toEqual([]);
  });

  it("preserves spaces and special characters in quoted elements", () => {
    expect(parsePostgresTextArray('{"My Label","CATEGORY_PERSONAL"}')).toEqual([
      "My Label",
      "CATEGORY_PERSONAL",
    ]);
  });

  it("handles a comma inside a quoted element", () => {
    expect(parsePostgresTextArray('{"a,b","c"}')).toEqual(["a,b", "c"]);
  });

  it("handles escaped quotes and backslashes", () => {
    expect(parsePostgresTextArray('{"a\\"b","c\\\\d"}')).toEqual([
      'a"b',
      "c\\d",
    ]);
  });

  it("returns null for non-array-literal input", () => {
    expect(parsePostgresTextArray('["INBOX"]')).toBeNull();
    expect(parsePostgresTextArray("plain")).toBeNull();
  });
});

describe("parseLabelsValue", () => {
  it("parses the canonical JSON array form", () => {
    expect(parseLabelsValue('["INBOX","IMPORTANT"]')).toEqual([
      "INBOX",
      "IMPORTANT",
    ]);
  });

  it("parses the legacy Postgres array-literal form (the inbox-spam cause)", () => {
    expect(parseLabelsValue('{"INBOX","IMPORTANT"}')).toEqual([
      "INBOX",
      "IMPORTANT",
    ]);
  });

  it("treats empty string as no labels", () => {
    expect(parseLabelsValue("")).toEqual([]);
    expect(parseLabelsValue("   ")).toEqual([]);
  });

  it("returns null for unrecognised / malformed values (caller defaults to [])", () => {
    expect(parseLabelsValue("INBOX")).toBeNull();
    expect(parseLabelsValue("[broken")).toBeNull();
  });

  it("coerces non-string JSON array elements to strings", () => {
    expect(parseLabelsValue("[1,2]")).toEqual(["1", "2"]);
  });
});
