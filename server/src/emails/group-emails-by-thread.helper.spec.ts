import { groupEmailsByThread } from "./group-emails-by-thread.helper";

describe("groupEmailsByThread", () => {
  it("groups by thread in first-seen order, keeping each thread's emails in input order", () => {
    const emails = [
      { id: "e1", emailThreadId: "t-a" },
      { id: "e2", emailThreadId: "t-b" },
      { id: "e3", emailThreadId: "t-a" },
      { id: "e4", emailThreadId: "t-b" },
      { id: "e5", emailThreadId: "t-a" },
    ];

    const groups = groupEmailsByThread(emails);

    expect(groups.map((group) => group.map((email) => email.id))).toEqual([
      ["e1", "e3", "e5"],
      ["e2", "e4"],
    ]);
  });

  it("puts each thread-less email in its own group", () => {
    const emails = [
      { id: "e1", emailThreadId: null },
      { id: "e2", emailThreadId: null },
    ];

    const groups = groupEmailsByThread(emails);

    expect(groups.map((group) => group.map((email) => email.id))).toEqual([
      ["e1"],
      ["e2"],
    ]);
  });
});
