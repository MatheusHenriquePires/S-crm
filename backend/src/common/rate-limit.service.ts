import { Injectable } from '@nestjs/common';

type Bucket = {
  hits: number[];
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  );
  private readonly maxHits = Number(process.env.RATE_LIMIT_MAX ?? 120);

  allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((ts) => now - ts < this.windowMs);
    if (bucket.hits.length >= this.maxHits) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }
}
