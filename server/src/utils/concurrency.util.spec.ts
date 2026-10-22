import { mapWithConcurrency } from "./concurrency.util";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/** Lets every already-scheduled continuation run before asserting. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("mapWithConcurrency", () => {
  const LIMIT = 3;
  const ITEM_COUNT = 8;

  it("never runs more than `limit` workers at once and refills slots as they free up", async () => {
    const deferreds = Array.from({ length: ITEM_COUNT }, createDeferred);
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];

    const run = mapWithConcurrency(
      deferreds,
      LIMIT,
      async (deferred, index) => {
        started.push(index);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await deferred.promise;
        inFlight--;
        return index;
      },
    );

    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2]);

    deferreds[1].resolve();
    await flushMicrotasks();
    expect(started).toEqual([0, 1, 2, 3]);

    deferreds.forEach((deferred) => deferred.resolve());
    await run;
    expect(maxInFlight).toBe(LIMIT);
    expect(started).toHaveLength(ITEM_COUNT);
  });

  it("returns results in input order regardless of completion order", async () => {
    const delaysMs = [30, 0, 10];

    const results = await mapWithConcurrency(
      delaysMs,
      LIMIT,
      async (delayMs) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return delayMs;
      },
    );

    expect(results).toEqual(delaysMs);
  });

  it("resolves to an empty array without calling the worker for no items", async () => {
    const worker = jest.fn();

    await expect(mapWithConcurrency([], LIMIT, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it.each([0, -2, Number.NaN])(
    "still processes every item one at a time for a nonsensical limit (%p)",
    async (limit) => {
      const items = [1, 2, 3];

      const results = await mapWithConcurrency(
        items,
        limit,
        async (item) => item * 2,
      );

      expect(results).toEqual([2, 4, 6]);
    },
  );
});
