/**
 * Contact & Validation Routes
 * POST /instances/:id/check-number - Check if phone number is on WhatsApp
 * POST /instances/:id/check-batch - Batch check multiple numbers
 * GET /instances/:id/contacts/:jid - Get contact info
 * GET /instances/:id/contacts/:jid/profile - Get full contact profile
 * GET /instances/:id/contacts/:jid/picture - Get profile picture URL
 * GET /instances/:id/contacts/:jid/business - Get business profile
 * POST /instances/:id/contacts - Add or edit contact
 * DELETE /instances/:id/contacts/:phone - Remove contact
 */

import { FastifyInstance } from 'fastify';
import type { MiawClient } from 'miaw-core';
import { createAuthMiddleware } from '../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../utils/errorHandler';

/**
 * Register contact routes
 */
export async function contactRoutes(server: FastifyInstance): Promise<void> {
  // All routes require authentication
  server.addHook('onRequest', createAuthMiddleware());

  /**
   * POST /instances/:id/check-number
   * Check if phone number is on WhatsApp
   */
  server.post(
    '/instances/:id/check-number',
    {
      schema: {
        description: 'Check if a phone number is on WhatsApp',
        tags: ['Contacts'],
        summary: 'Check phone number',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'checkNumber#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  exists: { type: 'boolean' },
                  jid: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { phone: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.checkNumber(body.phone);

        reply.send({
          success: true,
          data: {
            exists: result.exists ?? false,
            jid: result.jid ?? null,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to check number', { error: err.message });
      }
    }
  );

  /**
   * POST /instances/:id/check-batch
   * Batch check multiple phone numbers
   */
  server.post(
    '/instances/:id/check-batch',
    {
      schema: {
        description: 'Check multiple phone numbers on WhatsApp (up to 50)',
        tags: ['Contacts'],
        summary: 'Batch check phone numbers',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'checkBatch#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string' },
                    exists: { type: 'boolean' },
                    jid: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { phones: string[] };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const results = await client.checkNumbers(body.phones);

        reply.send({
          success: true,
          data: results,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to check numbers', { error: err.message });
      }
    }
  );

  /**
   * GET /instances/:id/contacts/:jid
   * Get contact information
   */
  server.get(
    '/instances/:id/contacts/:jid',
    {
      schema: {
        description: 'Get contact information by JID',
        tags: ['Contacts'],
        summary: 'Get contact info',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
          },
          required: ['id', 'jid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  jid: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  notify: { type: 'string', nullable: true },
                  verifiedName: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; jid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const contactInfo = await client.getContactInfo(params.jid);

        reply.send({
          success: true,
          data: contactInfo,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get contact info', { error: err.message });
      }
    }
  );

  /**
   * GET /instances/:id/contacts/:jid/profile
   * Get full contact profile including business details
   */
  server.get(
    '/instances/:id/contacts/:jid/profile',
    {
      schema: {
        description: 'Get full contact profile including name, status, picture URL, and business details',
        tags: ['Contacts'],
        summary: 'Get contact profile',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
          },
          required: ['id', 'jid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  jid: { type: 'string' },
                  name: { type: 'string', nullable: true },
                  phone: { type: 'string', nullable: true },
                  status: { type: 'string', nullable: true },
                  isBusiness: { type: 'boolean', nullable: true },
                  pictureUrl: { type: 'string', nullable: true },
                  business: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      description: { type: 'string', nullable: true },
                      category: { type: 'string', nullable: true },
                      website: { type: 'string', nullable: true },
                      email: { type: 'string', nullable: true },
                      address: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; jid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const profile = await client.getContactProfile(params.jid);

        reply.send({
          success: true,
          data: profile,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get contact profile', { error: err.message });
      }
    }
  );

  /**
   * GET /instances/:id/contacts/:jid/picture
   * Get profile picture URL
   */
  server.get(
    '/instances/:id/contacts/:jid/picture',
    {
      schema: {
        description: 'Get profile picture URL for a contact',
        tags: ['Contacts'],
        summary: 'Get profile picture',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
          },
          required: ['id', 'jid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  url: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; jid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const pictureUrl = await client.getProfilePicture(params.jid);

        reply.send({
          success: true,
          data: {
            url: pictureUrl,
          },
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get profile picture', { error: err.message });
      }
    }
  );

  /**
   * GET /instances/:id/contacts/:jid/business
   * Get business profile for WhatsApp Business accounts
   */
  server.get(
    '/instances/:id/contacts/:jid/business',
    {
      schema: {
        description: 'Get business profile for WhatsApp Business accounts (description, category, website, email, address)',
        tags: ['Contacts'],
        summary: 'Get business profile',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            jid: { type: 'string' },
          },
          required: ['id', 'jid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  description: { type: 'string', nullable: true },
                  category: { type: 'string', nullable: true },
                  website: { type: 'string', nullable: true },
                  email: { type: 'string', nullable: true },
                  address: { type: 'string', nullable: true },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; jid: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const businessProfile = await client.getBusinessProfile(params.jid);

        reply.send({
          success: true,
          data: businessProfile,
        });
      } catch (err: any) {
        throw new BadRequestError('Failed to get business profile', { error: err.message });
      }
    }
  );

  /**
   * POST /instances/:id/contacts
   * Add or edit a contact
   */
  server.post(
    '/instances/:id/contacts',
    {
      schema: {
        description: 'Add or edit a contact in WhatsApp',
        tags: ['Contacts'],
        summary: 'Add/edit contact',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          $ref: 'addContact#',
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  phone: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as {
        phone: string;
        name: string;
        firstName?: string;
        lastName?: string;
      };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.addOrEditContact({
          phone: body.phone,
          name: body.name,
          firstName: body.firstName,
          lastName: body.lastName,
        });

        if (!result.success) {
          throw new BadRequestError('Failed to add/edit contact', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            success: true,
            phone: body.phone,
            name: body.name,
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to add/edit contact', { error: err.message });
      }
    }
  );

  /**
   * DELETE /instances/:id/contacts/:phone
   * Remove a contact
   */
  server.delete(
    '/instances/:id/contacts/:phone',
    {
      schema: {
        description: 'Remove a contact from WhatsApp',
        tags: ['Contacts'],
        summary: 'Remove contact',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phone: { type: 'string' },
          },
          required: ['id', 'phone'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  phone: { type: 'string' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const params = request.params as { id: string; phone: string };

      const instanceManager = server.instanceManager;
      const client: MiawClient | null = instanceManager.getClient(params.id);
      const instance = instanceManager.getInstance(params.id);

      if (!client || !instance) {
        throw new NotFoundError('Instance');
      }

      if (instance.status !== 'connected') {
        throw new ServiceUnavailableError('Instance is not connected');
      }

      try {
        const result = await client.removeContact(params.phone);

        if (!result.success) {
          throw new BadRequestError('Failed to remove contact', { error: result.error });
        }

        reply.send({
          success: true,
          data: {
            success: true,
            phone: params.phone,
          },
        });
      } catch (err: any) {
        if (err.code === 'BAD_REQUEST') {
          throw err;
        }
        throw new BadRequestError('Failed to remove contact', { error: err.message });
      }
    }
  );
}
