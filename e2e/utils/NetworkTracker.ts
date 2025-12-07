import { Page, Response } from '@playwright/test';

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  timing: number;
}

export class NetworkTracker {
  private requests: NetworkRequest[] = [];
  private page: Page;
  private filterPatterns: string[];

  constructor(page: Page, filterPatterns: string[] = []) {
    this.page = page;
    this.filterPatterns = filterPatterns;
    this.setupTracking();
  }

  private setupTracking(): void {
    this.page.on('response', (response: Response) => {
      const request = response.request();
      const url = request.url();
      const method = request.method();
      const status = response.status();

      // Filter requests based on patterns
      const shouldTrack = this.filterPatterns.length === 0 || 
        this.filterPatterns.some(pattern => url.includes(pattern));

      if (shouldTrack) {
        // Calculate timing from response timing object
        // response.timing() returns an object with timing information
        let timing = 0;
        try {
          const timingObj = response.timing();
          if (timingObj && typeof timingObj.responseEnd === 'number' && typeof timingObj.requestStart === 'number') {
            timing = timingObj.responseEnd - timingObj.requestStart;
          }
        } catch (e) {
          // If timing() fails, use 0 as default
          timing = 0;
        }
        this.requests.push({
          url,
          method,
          status,
          timing,
        });
      }
    });
  }

  getRequests(): NetworkRequest[] {
    return [...this.requests];
  }

  getRequestsByPattern(pattern: string): NetworkRequest[] {
    return this.requests.filter(req => req.url.includes(pattern));
  }

  getDuplicateRequests(): Map<string, number> {
    const duplicates = new Map<string, number>();
    const requestGroups = new Map<string, number>();

    this.requests.forEach((req) => {
      const key = `${req.method} ${req.url}`;
      const count = requestGroups.get(key) || 0;
      requestGroups.set(key, count + 1);
      
      if (count > 0) {
        duplicates.set(key, count + 1);
      }
    });

    return duplicates;
  }

  getTotalNetworkTime(): number {
    return this.requests.reduce((sum, req) => sum + req.timing, 0);
  }

  getAverageRequestTime(): number {
    if (this.requests.length === 0) return 0;
    return this.getTotalNetworkTime() / this.requests.length;
  }

  reset(): void {
    this.requests = [];
  }

  logSummary(): void {
    console.log(`\n📈 Network Summary:`);
    console.log(`   Total Requests: ${this.requests.length}`);
    console.log(`   Unique Requests: ${new Set(this.requests.map(r => `${r.method} ${r.url}`)).size}`);
    console.log(`   Total Network Time: ${this.getTotalNetworkTime().toFixed(0)}ms (${(this.getTotalNetworkTime() / 1000).toFixed(2)}s)`);
    console.log(`   Average Request Time: ${this.getAverageRequestTime().toFixed(0)}ms`);

    const duplicates = this.getDuplicateRequests();
    if (duplicates.size > 0) {
      console.log(`\n⚠️  Duplicate Requests Found:`);
      duplicates.forEach((count, key) => {
        console.log(`   ${key} (${count} times)`);
      });
    } else {
      console.log(`\n✅ No duplicate requests`);
    }
  }
}

