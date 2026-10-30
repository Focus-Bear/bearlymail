import { KeyedSemaphore } from "./keyed-semaphore";

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("KeyedSemaphore", () => {
  it("caps concurrent work per key and releases waiters in order", async () => {
    const semaphore = new KeyedSemaphore(2);
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const runs = [1, 2, 3].map((position) =>
      semaphore.run("user-1", async () => {
        started.push(position);
        await new Promise<void>((resolve) => releases.push(resolve));
      }),
    );
    await tick();
    expect(started).toEqual([1, 2]);
    releases[0]();
    await tick();
    expect(started).toEqual([1, 2, 3]);
    releases[1]();
    releases[2]();
    await Promise.all(runs);
  });

  it("does not make other keys wait", async () => {
    const semaphore = new KeyedSemaphore(1);
    let release: () => void = () => undefined;
    const blocked = semaphore.run(
      "user-1",
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await expect(semaphore.run("user-2", async () => "free")).resolves.toBe(
      "free",
    );
    release();
    await blocked;
  });

  it("frees the slot when work throws", async () => {
    const semaphore = new KeyedSemaphore(1);
    await expect(
      semaphore.run("user-1", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    await expect(semaphore.run("user-1", async () => "ok")).resolves.toBe("ok");
  });
});
