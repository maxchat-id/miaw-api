/**
 * Data & Fetch Routes (v0.9.0)
 *
 * GET endpoints for fetching contacts, groups, profile, labels, messages, and chats from in-memory store.
 * These endpoints return data from WhatsApp's history sync - they may return empty arrays if no history has been synced yet.
 */

import { FastifyInstance } from 'fastify';
import { InstanceManager } from '../services/InstanceManager';
import { NotFoundError, BadRequestError } from '../utils/errorHandler';

/**
 * Register basic GET operation routes
 */
export async function basicGetsRoutes(
  server: FastifyInstance,
  instanceManager: InstanceManager,
): Promise<void> {
  // ============================================================================
  // GET /instances/:id/contacts - Get all contacts
  // ============================================================================
  server.get(
    '/instances/:instanceId/contacts',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get all contacts',
        description: `Get all contacts from the in-memory store (populated from WhatsApp history sync).

**Note:** Returns an empty array if no contacts have been synced yet. This happens when:
- The instance was just created
- The user hasn't fully connected to WhatsApp yet
- No history sync has completed

**Response:**
- \`jid\`: Contact JID (e.g., 6281234567890@s.whatsapp.net)
- \`name\`: Contact name (if saved in phone)
- \`phone\`: Phone number extracted from JID`,
        params: {
          type: 'object',
          required: ['instanceId'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const result = await client.fetchAllContacts();

      if (!result.success) {
        throw new BadRequestError('Failed to fetch contacts', result);
      }

      return reply.send(result);
    },
  );

  // ============================================================================
  // GET /instances/:id/groups - Get all groups
  // ============================================================================
  server.get(
    '/instances/:instanceId/groups',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get all groups',
        description: `Get all groups where the authenticated user is a member.

**Response:**
- \`jid\`: Group JID (e.g., 1234567890@g.us)
- \`name\`: Group subject/name
- \`participantCount\`: Number of members in the group`,
        params: {
          type: 'object',
          required: ['instanceId'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const result = await client.fetchAllGroups();

      if (!result.success) {
        throw new BadRequestError('Failed to fetch groups', result);
      }

      return reply.send(result);
    },
  );

  // ============================================================================
  // GET /instances/:id/profile - Get own profile
  // ============================================================================
  server.get(
    '/instances/:instanceId/profile',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get own profile',
        description: `Get the authenticated user's profile information.

**Response:**
- \`jid\`: User's JID
- \`phoneNumber\`: User's phone number (e.g., 6281234567890)
- \`name\`: Display name (push name)
- \`status\`: About/bio text
- \`profilePictureUrl\`: URL to profile picture`,
        params: {
          type: 'object',
          required: ['instanceId'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const profile = await client.getOwnProfile();

      if (!profile) {
        throw new BadRequestError('Failed to get profile');
      }

      return reply.send(profile);
    },
  );

  // ============================================================================
  // GET /instances/:id/labels - Get all labels
  // ============================================================================
  server.get(
    '/instances/:instanceId/labels',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get all labels',
        description: `Get all labels from the account (WhatsApp Business only).

**Note:** Returns empty array for non-Business accounts.

**Response:**
- \`id\`: Label ID
- \`name\`: Label name
- \`color\`: Label color (0-19)`,
        params: {
          type: 'object',
          required: ['instanceId'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const result = await client.fetchAllLabels();

      if (!result.success) {
        throw new BadRequestError('Failed to fetch labels', result);
      }

      return reply.send(result);
    },
  );

  // ============================================================================
  // GET /instances/:id/chats - Get all chats
  // ============================================================================
  server.get(
    '/instances/:instanceId/chats',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get all chats',
        description: `Get all chats from the in-memory store (populated from WhatsApp history sync).

**Note:** Returns an empty array if no chats have been synced yet.

**Response:**
- \`jid\`: Chat JID (ends with @s.whatsapp.net for individuals, @g.us for groups)
- \`name\`: Chat name
- \`isGroup\`: true if group chat, false if individual
- \`lastMessageTimestamp\`: Unix timestamp of last message
- \`unreadCount\`: Number of unread messages
- \`isArchived\`: Whether chat is archived
- \`isPinned\`: Whether chat is pinned`,
        params: {
          type: 'object',
          required: ['instanceId'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const result = await client.fetchAllChats();

      if (!result.success) {
        throw new BadRequestError('Failed to fetch chats', result);
      }

      return reply.send(result);
    },
  );

  // ============================================================================
  // GET /instances/:id/chats/:jid/messages - Get chat messages
  // ============================================================================
  server.get(
    '/instances/:instanceId/chats/:jid/messages',
    {
      schema: {
        tags: ['Data'],
        summary: 'Get chat messages',
        description: `Get messages from a specific chat from the in-memory store.

**JID Format:**
- Individual: \`6281234567890@s.whatsapp.net\`
- Group: \`1234567890@g.us\`
- LID (privacy format): \`12345678@lid\` (WhatsApp's privacy-masked format)

**What is @lid?**
WhatsApp uses LID (Limited ID) as a privacy measure for phone numbers. When WhatsApp doesn't want to expose the actual phone number, it returns an @lid JID instead. Use the \`resolveLidToJid\` method to convert LIDs to actual phone JIDs.

**Note:** Returns empty array if chat has no messages in store.

**Response:** Array of MiawMessage objects with:
- \`id\`: Message ID
- \`from\`: Sender JID
- \`to\`: Recipient JID
- \`text\`: Message text (if text message)
- \`type\`: Message type (text, image, video, audio, document, sticker)
- \`timestamp\`: Unix timestamp
- \`fromMe\`: true if sent by authenticated user`,
        params: {
          type: 'object',
          required: ['instanceId', 'jid'],
          properties: {
            instanceId: { type: 'string', minLength: 1, description: 'Instance ID' },
            jid: {
              type: 'string',
              minLength: 1,
              description:
                'Chat JID (phone@s.whatsapp.net for individual, group@g.us for group, or @lid format)',
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId, jid } = request.params as { instanceId: string; jid: string };

      const client = instanceManager.getClient(instanceId);
      if (!client) {
        throw new NotFoundError('Instance');
      }

      const result = await client.getChatMessages(jid);

      if (!result.success) {
        throw new BadRequestError('Failed to fetch messages', result);
      }

      return reply.send(result);
    },
  );
}
