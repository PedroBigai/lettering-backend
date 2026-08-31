import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function validationError(error: ZodError): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data', error.flatten());
}

