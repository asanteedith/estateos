/**
 * Simple fixed-window limiter kept in memory. On serverless hosting each
 * instance has its own window, so this slows down guessing but is not a hard
 * global limit. Replace with a shared store (e.g. Upstash free tier) if needed.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
