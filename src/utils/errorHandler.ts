/**
 * Error handling utilities
 */

import { FastifyReply } from 'fastify';
import crypto from 'crypto';

export class ApiError extends Error {
  public readonly correlationId: string;

  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'ApiError';
    this.correlationId = crypto.randomUUID();
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, 'INVALID_REQUEST', message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message: string) {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/**
 * Global error handler
 */
export function errorHandler(error: Error, request: any, reply: FastifyReply): void {
  if (error instanceof ApiError) {
    request.log.error({ correlationId: error.correlationId, error });

    reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        correlationId: error.correlationId,
      },
    });
    return;
  }

  // Fastify framework errors (validation, empty body, etc.) carry their own
  // statusCode/code. Preserve client errors (4xx) instead of masking them as 500.
  const fastifyError = error as { statusCode?: number; code?: string };
  if (
    typeof fastifyError.statusCode === 'number' &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    const correlationId = crypto.randomUUID();
    request.log.error({ correlationId, error });

    reply.status(fastifyError.statusCode).send({
      success: false,
      error: {
        code: fastifyError.code || 'INVALID_REQUEST',
        message: error.message,
        correlationId,
      },
    });
    return;
  }

  // Handle unknown errors with a generated correlation ID for tracking
  const correlationId = crypto.randomUUID();
  request.log.error({ correlationId, error });

  reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId,
    },
  });
}
