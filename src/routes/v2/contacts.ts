/**
 * Contact Routes (v2)
 *
 * GET    /instances/:instanceId/contacts
 * POST   /instances/:instanceId/contacts/checks
 * GET    /instances/:instanceId/contacts/:contactId
 * PUT    /instances/:instanceId/contacts/:contactId
 * DELETE /instances/:instanceId/contacts/:contactId
 * GET    /instances/:instanceId/contacts/:contactId/profile
 * GET    /instances/:instanceId/contacts/:contactId/profile-picture
 * GET    /instances/:instanceId/contacts/:contactId/business-profile
 * PUT    /instances/:instanceId/contacts/:contactId/presence-subscription
 *
 * v1 spread these across three modules and four naming schemes: `/check-number`
 * and `/check-batch` for lookups, `/contacts/:jid` vs `/contacts/:phone` for
 * reads and deletes, `POST /contacts` for add-or-edit, `/contacts/:jid/picture`
 * and `/contacts/:jid/business` for the sub-resources, and
 * `/subscribe/:jid` over in the presence module.
 *
 * v2 addresses one contact by `:contactId` throughout — a phone number or a
 * JID, whichever the caller has — and folds the two check routes into a single
 * batch. Adding a contact becomes a PUT on its own id, so the same request is
 * safe to repeat.
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

const contactParams = {
  type: 'object',
  required: ['instanceId', 'contactId'],
  properties: {
    instanceId: { type: 'string' },
    contactId: {
      type: 'string',
      minLength: 1,
      description: 'Phone number in international format, or a full JID.',
    },
  },
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

export async function contactRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.get(
    '/instances/:instanceId/contacts',
    {
      schema: {
        description:
          'List contacts from the in-memory store, populated by WhatsApp history sync. ' +
          'Returns an empty collection until a sync has completed.',
        tags: ['Contacts'],
        summary: 'List contacts',
        params: instanceParams,
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const client = requireConnectedClient(server, instanceId);

      const result = await client.fetchAllContacts();
      if (!result.success) {
        throw new BadRequestError('Failed to fetch contacts', { error: result.error });
      }

      const items = result.contacts ?? [];
      reply.send({ success: true, data: { items, total: items.length } });
    },
  );

  server.post(
    '/instances/:instanceId/contacts/checks',
    {
      schema: {
        description:
          'Check whether phone numbers are registered on WhatsApp. ' +
          'v1 split this into /check-number and /check-batch; a single number is a batch of one.',
        tags: ['Contacts'],
        summary: 'Check numbers',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['phones'],
          additionalProperties: false,
          properties: {
            phones: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const { phones } = request.body as { phones: string[] };
      const client = requireConnectedClient(server, instanceId);

      try {
        const items = await client.checkNumbers(phones);
        reply.send({ success: true, data: { items, total: items.length } });
      } catch (err: any) {
        failed('check numbers', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/contacts/:contactId',
    {
      schema: {
        description: 'Get contact information',
        tags: ['Contacts'],
        summary: 'Get contact',
        params: contactParams,
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const contact = await client.getContactInfo(contactId);
        if (!contact) {
          throw new NotFoundError('Contact');
        }
        reply.send({ success: true, data: contact });
      } catch (err: any) {
        failed('get contact', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/contacts/:contactId',
    {
      schema: {
        description:
          'Add or update a contact. The contact id is the phone number, so repeating ' +
          'the same request is safe.',
        tags: ['Contacts'],
        summary: 'Add or update contact',
        params: contactParams,
        body: {
          type: 'object',
          // miaw-core's ContactData requires a display name; without it the
          // entry would land in the phone book unnamed.
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const body = request.body as {
        name: string;
        firstName?: string;
        lastName?: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.addOrEditContact({
          phone: contactId,
          name: body.name,
          firstName: body.firstName,
          lastName: body.lastName,
        });
        if (!result.success) {
          throw new BadRequestError('Failed to save contact', { error: result.error });
        }
        // v1 answered data: { success: true, ... }, burying a second flag.
        reply.send({ success: true, data: { contactId, name: body.name } });
      } catch (err: any) {
        failed('save contact', err);
      }
    },
  );

  server.delete(
    '/instances/:instanceId/contacts/:contactId',
    {
      schema: {
        description: 'Remove a contact',
        tags: ['Contacts'],
        summary: 'Remove contact',
        params: contactParams,
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const result = await client.removeContact(contactId);
        if (!result.success) {
          throw new BadRequestError('Failed to remove contact', { error: result.error });
        }
        reply.send({ success: true, data: { contactId, removed: true } });
      } catch (err: any) {
        failed('remove contact', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/contacts/:contactId/profile',
    {
      schema: {
        description: 'Get a contact profile (name, status, picture URL)',
        tags: ['Contacts'],
        summary: 'Get contact profile',
        params: contactParams,
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const profile = await client.getContactProfile(contactId);
        if (!profile) {
          throw new NotFoundError('Contact profile');
        }
        reply.send({ success: true, data: profile });
      } catch (err: any) {
        failed('get contact profile', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/contacts/:contactId/profile-picture',
    {
      schema: {
        description: 'Get the URL of a contact profile picture',
        tags: ['Contacts'],
        summary: 'Get contact profile picture',
        params: contactParams,
        querystring: {
          type: 'object',
          properties: {
            highRes: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const { highRes = false } = request.query as { highRes?: boolean };
      const client = requireConnectedClient(server, instanceId);

      try {
        const url = await client.getProfilePicture(contactId, highRes);
        if (!url) {
          throw new NotFoundError('Profile picture');
        }
        reply.send({ success: true, data: { url } });
      } catch (err: any) {
        failed('get profile picture', err);
      }
    },
  );

  server.get(
    '/instances/:instanceId/contacts/:contactId/business-profile',
    {
      schema: {
        description: 'Get the WhatsApp Business profile of a contact',
        tags: ['Contacts'],
        summary: 'Get business profile',
        params: contactParams,
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        const profile = await client.getBusinessProfile(contactId);
        if (!profile) {
          throw new NotFoundError('Business profile');
        }
        reply.send({ success: true, data: profile });
      } catch (err: any) {
        failed('get business profile', err);
      }
    },
  );

  server.put(
    '/instances/:instanceId/contacts/:contactId/presence-subscription',
    {
      schema: {
        description:
          'Subscribe to presence updates for a contact. Updates arrive on the webhook. ' +
          'Moved here from the v1 presence module, which addressed it as /subscribe/:jid.',
        tags: ['Contacts'],
        summary: 'Subscribe to contact presence',
        params: contactParams,
      },
    },
    async (request, reply) => {
      const { instanceId, contactId } = request.params as {
        instanceId: string;
        contactId: string;
      };
      const client = requireConnectedClient(server, instanceId);

      try {
        await client.subscribePresence(contactId);
        reply.send({ success: true, data: { contactId, subscribed: true } });
      } catch (err: any) {
        failed('subscribe to presence', err);
      }
    },
  );
}
