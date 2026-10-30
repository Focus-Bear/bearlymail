/**
 * Caps concurrent work per key. Mail hosts limit simultaneous IMAP logins per
 * mailbox (Dovecot's default is 10, many shared hosts allow fewer), and
 * callers such as context analysis fan out thread fetches in parallel.
 */
export class KeyedSemaphore {
  private readonly active = new Map<string, number>();
  private readonly waiting = new Map<string, Array<() => void>>();

  constructor(private readonly limit: number) {}

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    await this.acquire(key);
    try {
      return await work();
    } finally {
      this.release(key);
    }
  }

  private async acquire(key: string): Promise<void> {
    const running = this.active.get(key) ?? 0;
    if (running < this.limit) {
      this.active.set(key, running + 1);
      return;
    }
    await new Promise<void>((resolve) => {
      const queue = this.waiting.get(key) ?? [];
      queue.push(resolve);
      this.waiting.set(key, queue);
    });
  }

  private release(key: string): void {
    const next = this.waiting.get(key)?.shift();
    if (next) {
      // Hand the slot straight to the next waiter; the count is unchanged.
      next();
      return;
    }
    const running = (this.active.get(key) ?? 1) - 1;
    if (running <= 0) {
      this.active.delete(key);
      this.waiting.delete(key);
    } else {
      this.active.set(key, running);
    }
  }
}
