import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export function requestContext(enableLogging: boolean): RequestHandler {
  return (request, response, next) => {
    const suppliedRequestId = request.header('x-request-id')?.trim();
    const requestId = suppliedRequestId && /^[A-Za-z0-9._-]{1,100}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
    const startedAt = Date.now();
    response.setHeader('X-Request-Id', requestId);

    if (enableLogging) {
      response.once('finish', () => {
        console.log(JSON.stringify({
          type: 'http_request',
          requestId,
          method: request.method,
          path: request.originalUrl,
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
        }));
      });
    }
    next();
  };
}
