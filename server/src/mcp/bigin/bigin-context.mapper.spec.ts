import {
  BIGIN_EMPTY_RESULT,
  BIGIN_ERROR_RESULT,
  biginList,
  CLOSED_DEAL,
  OPEN_DEAL,
} from "./__fixtures__/bigin.fixture";
import {
  contactName,
  emailDomain,
  isCompanyDomain,
  pickMostRecent,
  toDealSummaries,
  toNoteSummaries,
  websiteHost,
} from "./bigin-context.mapper";
import { BiginToolError, readBiginRecords } from "./bigin-records";
import { BIGIN_LIMITS } from "./bigin-sender-context.constants";

const TOOL = "Bigin_searchRecords";

describe("readBiginRecords", () => {
  it("reads records from the JSON text part", () => {
    expect(readBiginRecords(TOOL, biginList([{ id: "r1" }]))).toEqual([
      { id: "r1" },
    ]);
  });

  it("prefers structuredContent when the server sends it", () => {
    const output = { structuredContent: { data: [{ id: "r2" }] } };
    expect(readBiginRecords(TOOL, output)).toEqual([{ id: "r2" }]);
  });

  it.each([
    ["an empty (204) result", BIGIN_EMPTY_RESULT],
    ["non-JSON text", { content: [{ type: "text", text: "No records" }] }],
    ["no content", {}],
    ["null", null],
  ])("treats %s as no records", (_label, output) => {
    expect(readBiginRecords(TOOL, output)).toEqual([]);
  });

  it("drops entries without a string id", () => {
    expect(
      readBiginRecords(TOOL, biginList([{ id: 7 }, "x", { id: "ok" }])),
    ).toEqual([{ id: "ok" }]);
  });

  it("throws on a tool-level error so a failure isn't mistaken for a miss", () => {
    expect(() => readBiginRecords(TOOL, BIGIN_ERROR_RESULT)).toThrow(
      BiginToolError,
    );
  });
});

describe("bigin-context.mapper", () => {
  it("picks the most recently modified record", () => {
    const older = { id: "a", Modified_Time: "2026-01-01T00:00:00Z" };
    const newer = { id: "b", Modified_Time: "2026-06-01T00:00:00Z" };
    expect(pickMostRecent([older, newer])).toBe(newer);
    expect(pickMostRecent([])).toBeNull();
  });

  it("extracts and classifies email domains", () => {
    expect(emailDomain("Ada@Acme.Example")).toBe("acme.example");
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(isCompanyDomain("gmail.com")).toBe(false);
    expect(isCompanyDomain("acme.example")).toBe(true);
  });

  it.each([
    ["https://www.acme.example/about", "acme.example"],
    ["acme.example", "acme.example"],
    ["http://shop.acme.example", "shop.acme.example"],
    ["", null],
    [null, null],
  ])("normalises website %p to host %p", (website, host) => {
    expect(websiteHost(website)).toBe(host);
  });

  it("names a contact from full name, then first/last, then email", () => {
    expect(contactName({ id: "1", Full_Name: "Ada L" })).toBe("Ada L");
    expect(contactName({ id: "1", First_Name: "Ada", Last_Name: "L" })).toBe(
      "Ada L",
    );
    expect(contactName({ id: "1", Email: "ada@x.example" })).toBe(
      "ada@x.example",
    );
    expect(contactName({ id: "1" })).toBe("1");
  });

  it("orders open deals before closed ones, then by recency, capped", () => {
    const many = Array.from(
      { length: BIGIN_LIMITS.DEALS_KEPT + 2 },
      (_unused, index) => ({ ...OPEN_DEAL, id: `open-${index}` }),
    );
    const summaries = toDealSummaries([CLOSED_DEAL, ...many]);

    expect(summaries).toHaveLength(BIGIN_LIMITS.DEALS_KEPT);
    expect(summaries.every((deal) => deal.isOpen)).toBe(true);
    expect(toDealSummaries([CLOSED_DEAL, OPEN_DEAL])[0]).toMatchObject({
      id: OPEN_DEAL.id,
      stage: "Proposal",
      amount: 12000,
      pipeline: "Sales",
    });
    expect(toDealSummaries([CLOSED_DEAL])[0].isOpen).toBe(false);
  });

  it("keeps the newest non-empty notes and trims long bodies", () => {
    const long = "word ".repeat(BIGIN_LIMITS.NOTE_MAX_CHARS);
    const notes = toNoteSummaries([
      { id: "old", Note_Content: "old", Created_Time: "2026-01-01T00:00:00Z" },
      { id: "empty", Note_Content: "  ", Created_Time: "2026-12-01T00:00:00Z" },
      { id: "new", Note_Content: long, Created_Time: "2026-06-01T00:00:00Z" },
    ]);

    expect(notes.map((note) => note.createdAt)).toEqual([
      "2026-06-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ]);
    expect(notes[0].content.length).toBe(BIGIN_LIMITS.NOTE_MAX_CHARS);
  });
});
