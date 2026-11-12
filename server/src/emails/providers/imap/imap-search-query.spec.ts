import { IMAP_SEARCH_SCOPE, translateSearchQuery } from "./imap-search-query";

describe("translateSearchQuery", () => {
  it("translates the date range context analysis sends", () => {
    expect(translateSearchQuery("after:2026/10/01 before:2026/10/08")).toEqual({
      scope: IMAP_SEARCH_SCOPE.INBOX,
      criteria: {
        since: new Date(Date.UTC(2026, 9, 1)),
        before: new Date(Date.UTC(2026, 9, 8)),
      },
    });
  });

  it("searches the Sent folder for in:sent", () => {
    expect(translateSearchQuery("in:sent from:me@crazy.test")).toEqual({
      scope: IMAP_SEARCH_SCOPE.SENT,
      criteria: { from: "me@crazy.test" },
    });
  });

  it("keeps quoted operator values and turns the rest into full text", () => {
    expect(translateSearchQuery('subject:"kitchen quote" tiles')).toEqual({
      scope: IMAP_SEARCH_SCOPE.INBOX,
      criteria: { subject: "kitchen quote", text: "tiles" },
    });
  });

  it("maps is:unread / is:starred to flags", () => {
    expect(translateSearchQuery("is:unread is:starred").criteria).toEqual({
      seen: false,
      flagged: true,
    });
  });

  it("leaves unknown operators in the full-text search", () => {
    expect(translateSearchQuery("has:attachment").criteria).toEqual({
      text: "has:attachment",
    });
  });

  it("matches everything for an empty query", () => {
    expect(translateSearchQuery("  ").criteria).toEqual({ all: true });
  });
});
