import { hasCurrentOptions } from "./suggested-replies.service";

describe("hasCurrentOptions", () => {
  const options = [{ label: "Follow Up", text: "Hi Sam" }];

  it("accepts options generated for the thread's newest email", () => {
    expect(
      hasCurrentOptions({ options, lastEmailId: "newest" }, "newest"),
    ).toBe(true);
  });

  it("rejects options generated before a newer email arrived (e.g. the user's own reply)", () => {
    expect(
      hasCurrentOptions({ options, lastEmailId: "their-email" }, "user-reply"),
    ).toBe(false);
  });

  it("rejects empty options and an unknown newest email", () => {
    expect(
      hasCurrentOptions({ options: [], lastEmailId: "newest" }, "newest"),
    ).toBe(false);
    expect(hasCurrentOptions({ options, lastEmailId: null }, null)).toBe(false);
    expect(hasCurrentOptions(null, "newest")).toBe(false);
  });
});
