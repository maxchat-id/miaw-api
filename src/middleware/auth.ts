/**
 * Authentication Middleware
 * Validates API key for protected endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errorHandler';

/**
 * Timing-safe string comparison to prevent timing attacks
 * Returns false if lengths differ, then uses constant-time comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Extract API key from request
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try X-API-Key header
  const apiKey = request.headers['x-api-key'] as string;
  if (apiKey) {
    return apiKey;
  }

  return null;
}

/**
 * Authentication middleware factory
 */
export function createAuthMiddleware() {
  return async function authMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const apiKey = extractApiKey(request);

    if (!apiKey) {
      // Log auth failure for security auditing
      request.log.warn(
        {
          event: 'auth_failure',
          reason: 'missing_api_key',
          ip: request.ip,
          method: request.method,
          url: request.url,
        },
        'Authentication failed: Missing API key',
      );
      throw new UnauthorizedError('Missing API key');
    }

    if (!timingSafeEqual(apiKey, config.apiKey)) {
      // Log auth failure for security auditing (don't log the invalid key itself)
      request.log.warn(
        {
          event: 'auth_failure',
          reason: 'invalid_api_key',
          ip: request.ip,
          method: request.method,
          url: request.url,
        },
        'Authentication failed: Invalid API key',
      );
      throw new UnauthorizedError('Invalid API key');
    }

    // API key is valid, continue
  };
}
