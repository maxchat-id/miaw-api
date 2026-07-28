/**
 * Unit tests for the 404 not-found handler (API report ISSUE-04).
 * Unknown routes must return the same app-level error shape as other errors,
 * not Fastify's default {message,error,statusCode}.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notFoundHandler } from '../../../src/utils/errorHandler';

describe('notFoundHandler', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/nonexistent/route',
      log: { error: vi.fn() },
    };
    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  it('responds with 404 and the app-level error envelope', () => {
    notFoundHandler(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(404);
    const payload = mockReply.send.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(typeof payload.error.message).toBe('string');
    expect(payload.error.message.length).toBeGreaterThan(0);
  });

  it('does not use the Fastify default error shape', () => {
    notFoundHandler(mockRequest, mockReply);

    const payload = mockReply.send.mock.calls[0][0];
    expect(payload).not.toHaveProperty('statusCode');
    expect(payload.error).not.toBe('Not Found');
  });
});
