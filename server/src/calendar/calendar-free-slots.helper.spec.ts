import { excludeIntervalFromBusy } from "./calendar-free-slots.helper";

const OWN_SLOT = {
  start: new Date("2024-01-16T14:00:00.000Z"),
  end: new Date("2024-01-16T14:30:00.000Z"),
};

describe("excludeIntervalFromBusy", () => {
  it("drops a busy period that is exactly the interval", () => {
    expect(
      excludeIntervalFromBusy(
        [
          {
            start: "2024-01-16T14:00:00.000Z",
            end: "2024-01-16T14:30:00.000Z",
          },
        ],
        OWN_SLOT,
      ),
    ).toEqual([]);
  });

  it("keeps the parts of a merged period on either side of the interval", () => {
    expect(
      excludeIntervalFromBusy(
        [
          {
            start: "2024-01-16T13:30:00.000Z",
            end: "2024-01-16T15:00:00.000Z",
          },
        ],
        OWN_SLOT,
      ),
    ).toEqual([
      { start: "2024-01-16T13:30:00.000Z", end: "2024-01-16T14:00:00.000Z" },
      { start: "2024-01-16T14:30:00.000Z", end: "2024-01-16T15:00:00.000Z" },
    ]);
  });

  it("leaves periods that don't overlap the interval untouched", () => {
    const busy = [
      { start: "2024-01-16T09:00:00.000Z", end: "2024-01-16T10:00:00.000Z" },
      { start: "2024-01-16T14:30:00.000Z", end: "2024-01-16T15:00:00.000Z" },
    ];
    expect(excludeIntervalFromBusy(busy, OWN_SLOT)).toEqual(busy);
  });
});
