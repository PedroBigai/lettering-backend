import type { Request, RequestHandler, Response } from 'express';
import { ApiError } from '../errors';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  key: (request: Request, response: Response) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();

  return (request, response, next) => {
    const now = Date.now();
    const key = options.key(request, response);
    const current = entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current;

    entry.count += 1;
    entries.set(key, entry);
    response.setHeader('RateLimit-Limit', String(options.maxRequests));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, options.maxRequests - entry.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1_000)));

    if (entry.count > options.maxRequests) {
      next(new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests'));
      return;
    }

    if (entries.size > 10_000) {
      for (const [entryKey, value] of entries) {
        if (value.resetAt <= now) entries.delete(entryKey);
      }
    }
    next();
  };
}
