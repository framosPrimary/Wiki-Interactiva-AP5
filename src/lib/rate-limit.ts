const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
