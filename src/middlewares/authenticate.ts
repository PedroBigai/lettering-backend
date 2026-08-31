import type { RequestHandler } from 'express';
import type { AuthService } from '../modules/authService';
import { ApiError } from '../server/errors';

export function authenticate(authService: AuthService): RequestHandler {
  return (request, response, next) => {
    const authorization = request.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
      return;
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
      return;
    }

    try {
      response.locals.userId = authService.verifyToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

