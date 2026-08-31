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
 * Not-found handler for unknown routes. Emits the same app-level error
 * envelope as {@link errorHandler} so clients see one consistent shape
 * instead of Fastify's default {message,error,statusCode} (ISSUE-04).
 */
export function notFoundHandler(request: any, reply: FastifyReply): void {
  const error = new NotFoundError(`Route ${request.method}:${request.url}`);
  request.log.error({ correlationId: error.correlationId, error });

  reply.status(error.statusCode).send({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      correlationId: error.correlationId,
    },
  });
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

  // Fastify framework errors (validation, empty body, unsupported media type)
  // carry their own statusCode. Preserve client errors (4xx) instead of masking
  // them as 500, but translate the code: `FST_ERR_*` is an artefact of the
  // framework, and putting it in the response would make a Fastify rename a
  // change to this API's contract. The catalogue in docs/ERROR-CODES.md is the
  // contract, so a schema failure is VALIDATION_ERROR and anything else the
  // framework rejects is INVALID_REQUEST.
  const fastifyError = error as {
    statusCode?: number;
    code?: string;
    validation?: unknown[];
  };
  if (
    typeof fastifyError.statusCode === 'number' &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    const correlationId = crypto.randomUUID();
    request.log.error({ correlationId, error });

    const isValidation =
      Array.isArray(fastifyError.validation) || fastifyError.code === 'FST_ERR_VALIDATION';

    reply.status(fastifyError.statusCode).send({
      success: false,
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : 'INVALID_REQUEST',
        message: error.message,
        // ajv's per-field report is the only machine-readable part of a
        // validation failure; without it a client can only show the message.
        ...(fastifyError.validation ? { details: { validation: fastifyError.validation } } : {}),
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
