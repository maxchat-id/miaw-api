/**
 * Own Profile Routes (v2)
 *
 * GET    /instances/:instanceId/profile
 * PATCH  /instances/:instanceId/profile
 * PUT    /instances/:instanceId/profile/picture
 * DELETE /instances/:instanceId/profile/picture
 *
 * v1 gave each field its own route — `/profile/name` and `/profile/status` —
 * so changing both meant two requests and two chances to half-fail. v2 patches
 * the profile as one resource, applying the fields the caller sent.
 *
 * All four v1 mutations answered `data: { success: ... }`, which repeated the
 * envelope and buried a second flag inside the payload. v2 returns what
 * changed instead.
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import {
  ApiError,
  NotFoundError,
  BadRequestError,
  ServiceUnavailableError,
} from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

function requireConnectedClient(server: FastifyInstance, instanceId: string): MiawClient {
  const client = server.instanceManager.getClient(instanceId);
  const instance = server.instanceManager.getInstance(instanceId);

  if (!client || !instance) {
    throw new NotFoundError('Instance');
  }
  if (instance.status !== 'connected') {
    throw new ServiceUnavailableError('Instance is not connected');
  }
  return client;
}

/**
 * Normalize an unexpected error into a 400, while letting anything we already
 * classified (404, 503, or a 400 that carries its own message and details)
 * travel to the error handler untouched.
 */
function failed(what: string, err: any): never {
  if (err instanceof ApiError) {
    throw err;
  }
  throw new BadRequestError(`Failed to ${what}`, { error: err?.message });
}

export async function profileRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/profile',
    {
      schema: {
        description: 'Get the profile of the connected account',
        tags: ['Profile'],
        summary: 'Get own profile',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      const profile = await client.getOwnProfile();
      if (!profile) {
        throw new NotFoundError('Profile');
      }

      reply.send({ success: true, data: profile });
    },
  );

  server.patch(
    '/instances/:instanceId/profile',
    {
      schema: {
        description:
          'Update the display name and/or the status text. Replaces the v1 ' +
          '/profile/name and /profile/status routes.',
        tags: ['Profile'],
        summary: 'Update own profile',
        params: instanceParams,
        body: {
          type: 'object',
          additionalProperties: false,
          // An empty patch would report success while changing nothing.
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1 },
            status: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as { name?: string; status?: string };
      const client = requireConnectedClient(server, instanceId);

      const updated: Record<string, string> = {};

      try {
        // Applied in order and reported field by field: if the status update
        // fails after the name succeeded, the error names which one is live.
        if (body.name !== undefined) {
          const result = await client.updateProfileName(body.name);
          if (!result.success) {
            throw new BadRequestError('Failed to update profile name', { error: result.error });
          }
          updated.name = body.name;
        }

        if (body.status !== undefined) {
          const result = await client.updateProfileStatus(body.status);
          if (!result.success) {
            throw new BadRequestError('Failed to update profile status', {
              error: result.error,
              updated,
            });
          }
          updated.status = body.status;
        }
      } catch (err: any) {
        failed('update profile', err);
      }

      reply.send({ success: true, data: updated });
    },
  );

  server.put(
    '/instances/:instanceId/profile/picture',
    {
      schema: {
        description: 'Set the profile picture from a URL, file path, or data URI',
        tags: ['Profile'],
        summary: 'Set profile picture',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: { url: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { url } = request.body as { url: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.updateProfilePicture(url);
        if (!result.success) {
          throw new BadRequestError('Failed to set profile picture', { error: result.error });
        }
        reply.send({ success: true, data: { updated: true } });
      } catch (err: any) {
        failed('set profile picture', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/profile/picture',
    {
      schema: {
        description: 'Remove the profile picture',
        tags: ['Profile'],
        summary: 'Remove profile picture',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.removeProfilePicture();
        if (!result.success) {
          throw new BadRequestError('Failed to remove profile picture', { error: result.error });
        }
        reply.send({ success: true, data: { removed: true } });
      } catch (err: any) {
        failed('remove profile picture', err);
      }
    },
  );
}
