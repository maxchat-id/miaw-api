/**
 * Unit tests for Error Handler utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
  errorHandler,
} from '../../../src/utils/errorHandler';

describe('Error Classes', () => {
  describe('ApiError', () => {
    it('should create an error with all properties', () => {
      const error = new ApiError(400, 'TEST_ERROR', 'Test message', {
        field: 'test',
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.name).toBe('ApiError');
    });

    it('should generate a valid UUID for correlationId', () => {
      const error = new ApiError(400, 'TEST_ERROR', 'Test message');

      expect(error.correlationId).toBeDefined();
      expect(error.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique correlationIds for different errors', () => {
      const error1 = new ApiError(400, 'TEST_ERROR', 'Test 1');
      const error2 = new ApiError(400, 'TEST_ERROR', 'Test 2');

      expect(error1.correlationId).not.toBe(error2.correlationId);
    });

    it('should work without details', () => {
      const error = new ApiError(500, 'SERVER_ERROR', 'Server error');

      expect(error.details).toBeUndefined();
    });
  });

  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Unauthorized');
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Invalid token');
    });

    it('should have correlationId', () => {
      const error = new UnauthorizedError();

      expect(error.correlationId).toBeDefined();
    });
  });

  describe('BadRequestError', () => {
    it('should create with message only', () => {
      const error = new BadRequestError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toBeUndefined();
    });

    it('should create with message and details', () => {
      const error = new BadRequestError('Validation failed', {
        fields: ['email', 'phone'],
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual({ fields: ['email', 'phone'] });
    });
  });

  describe('NotFoundError', () => {
    it('should format message with resource name', () => {
      const error = new NotFoundError('Instance');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Instance not found');
    });

    it('should work with different resource names', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource already exists');
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Instance not connected');

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('Instance not connected');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Schema validation failed');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Schema validation failed');
    });

    it('should create validation error with details', () => {
      const error = new ValidationError('Invalid fields', {
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'phone', message: 'Phone is required' },
        ],
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.errors).toHaveLength(2);
    });
  });
});

describe('errorHandler', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      log: {
        error: vi.fn(),
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('handling ApiError', () => {
    it('should respond with correct status and format', () => {
      const error = new ApiError(400, 'TEST_ERROR', 'Test message', {
        extra: 'data',
      });

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test message',
          details: { extra: 'data' },
          correlationId: error.correlationId,
        },
      });
    });

    it('should log error with correlationId', () => {
      const error = new ApiError(400, 'TEST_ERROR', 'Test message');

      errorHandler(error, mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalledWith({
        correlationId: error.correlationId,
        error,
      });
    });

    it('should handle UnauthorizedError correctly', () => {
      const error = new UnauthorizedError('Missing API key');

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
            message: 'Missing API key',
          }),
        }),
      );
    });

    it('should handle NotFoundError correctly', () => {
      const error = new NotFoundError('Instance');

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Instance not found',
          }),
        }),
      );
    });

    it('should handle ValidationError correctly', () => {
      const error = new ValidationError('Invalid schema', { field: 'email' });

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Invalid schema',
            details: { field: 'email' },
          }),
        }),
      );
    });
  });

  describe('handling unknown errors', () => {
    it('should respond with 500 and generic message', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          }),
        }),
      );
    });

    it('should NOT leak internal error details', () => {
      const error = new Error('Database connection failed: password=secret123');

      errorHandler(error, mockRequest, mockReply);

      const sentPayload = mockReply.send.mock.calls[0][0];
      expect(sentPayload.error.message).toBe('An unexpected error occurred');
      expect(sentPayload.error.message).not.toContain('Database');
      expect(sentPayload.error.message).not.toContain('secret123');
    });

    it('should generate correlationId for unknown errors', () => {
      const error = new Error('Unknown error');

      errorHandler(error, mockRequest, mockReply);

      const sentPayload = mockReply.send.mock.calls[0][0];
      expect(sentPayload.error.correlationId).toBeDefined();
      expect(sentPayload.error.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should log full error details for unknown errors', () => {
      const error = new Error('Internal failure');

      errorHandler(error, mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: expect.any(String),
          error,
        }),
      );
    });
  });

  describe('handling Fastify framework errors', () => {
    it('should respect the statusCode of a client validation error', () => {
      const error = Object.assign(new Error('body must be object'), {
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
      });

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      const sentPayload = mockReply.send.mock.calls[0][0];
      expect(sentPayload.error.code).toBe('FST_ERR_VALIDATION');
      expect(sentPayload.error.message).toBe('body must be object');
    });

    it('should respect the statusCode of an empty-body error', () => {
      const error = Object.assign(new Error('Body cannot be empty'), {
        statusCode: 400,
        code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
      });

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should NOT expose 5xx framework errors as client errors', () => {
      const error = Object.assign(new Error('upstream exploded'), {
        statusCode: 502,
      });

      errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      const sentPayload = mockReply.send.mock.calls[0][0];
      expect(sentPayload.error.message).toBe('An unexpected error occurred');
      expect(sentPayload.error.message).not.toContain('upstream');
    });
  });

  describe('error inheritance', () => {
    it('should identify all custom errors as ApiError instances', () => {
      expect(new UnauthorizedError()).toBeInstanceOf(ApiError);
      expect(new BadRequestError('test')).toBeInstanceOf(ApiError);
      expect(new NotFoundError('test')).toBeInstanceOf(ApiError);
      expect(new ConflictError('test')).toBeInstanceOf(ApiError);
      expect(new ServiceUnavailableError('test')).toBeInstanceOf(ApiError);
      expect(new ValidationError('test')).toBeInstanceOf(ApiError);
    });

    it('should identify all custom errors as Error instances', () => {
      expect(new ApiError(400, 'TEST', 'test')).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
      expect(new ValidationError('test')).toBeInstanceOf(Error);
    });
  });
});
