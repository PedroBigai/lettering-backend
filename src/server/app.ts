import express, { type ErrorRequestHandler } from 'express';
import type { AuthService } from '../modules/authService';
import { createAuthRouter } from '../routes/authRoutes';
import { ApiError } from './errors';
import { ZodError } from 'zod';

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};

type AppDependencies = {
  authService?: AuthService;
  allowedOrigins?: readonly string[];
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const allowedOrigins = new Set(dependencies.allowedOrigins ?? []);

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const origin = request.header('origin');

    if (!origin) {
      next();
      return;
    }

    if (!allowedOrigins.has(origin)) {
      next(new ApiError(403, 'CORS_ORIGIN_DENIED', 'Request origin is not allowed'));
      return;
    }

    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }

    next();
  });
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  if (dependencies.authService) {
    app.use('/api/v1/auth', createAuthRouter(dependencies.authService));
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  app.use(errorHandler);

  return app;
}
