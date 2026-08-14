/**
 * Message Sending Routes (v2)
 *
 * POST /instances/:instanceId/messages/text
 * POST /instances/:instanceId/messages/image
 * POST /instances/:instanceId/messages/video
 * POST /instances/:instanceId/messages/audio
 * POST /instances/:instanceId/messages/document
 * POST /instances/:instanceId/messages/location
 * POST /instances/:instanceId/messages/contact
 * POST /instances/:instanceId/messages/sticker
 * POST /instances/:instanceId/messages/poll
 *
 * v1 exposed two overlapping ways to send: the verb-shaped `/send-text` and
 * `/send-media` (which sniffed the mimetype to pick a sender), plus a typed
 * `/messages/{image,video,audio,document}` family. v2 keeps only the typed
 * family — one path per media kind, no server-side sniffing.
 *
 * The soft-failure guard is carried over from v1: miaw-core reports a failed
 * send as `{ success: false }` rather than throwing, so a handler that only
 * catches exceptions would answer 200 for a message that never left.
 *
 * Location, contact, sticker and poll have no v1 route; they are new here,
 * following the same shape as the ported ones.
 */

import { FastifyInstance } from 'fastify';
import type { ContactCard, MiawClient, MiawMessage, SendMessageResult } from 'miaw-core';
import { createAuthMiddleware } from '../../middleware/auth';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../../utils/errorHandler';

const instanceParams = {
  type: 'object',
  required: ['instanceId'],
  properties: { instanceId: { type: 'string' } },
};

interface SendBody {
  to: string;
  chatJid?: string;
  quoted?: string;
}

/**
 * Resolve the connected client, or fail the way the contract expects: 404 when
 * the instance does not exist, 503 when it exists but is not connected.
 */
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
 * miaw-core needs the full MiawMessage (with `raw`) to quote a reply, so the
 * id is resolved against the in-memory store first.
 */
async function resolveQuoted(
  client: MiawClient,
  quotedId: string | undefined,
  chatJid?: string,
): Promise<MiawMessage | undefined> {
  if (!quotedId) {
    return undefined;
  }

  if (chatJid) {
    const result = await client.getChatMessages(chatJid);
    const found = result.success ? result.messages?.find((m) => m.id === quotedId) : undefined;
    if (!found) {
      throw new NotFoundError('Message');
    }
    return found;
  }

  for (const jid of client.getMessageCounts().keys()) {
    const result = await client.getChatMessages(jid);
    const found = result.success ? result.messages?.find((m) => m.id === quotedId) : undefined;
    if (found) {
      return found;
    }
  }
  throw new NotFoundError('Message');
}

/**
 * Run a send and normalize both failure modes — a thrown error and a
 * `{ success: false }` result — into the same 400.
 */
async function send(
  what: string,
  to: string,
  run: () => Promise<SendMessageResult>,
): Promise<{ messageId?: string; to: string; timestamp: number }> {
  let result: SendMessageResult;
  try {
    result = await run();
  } catch (err: unknown) {
    throw new BadRequestError(`Failed to send ${what}`, { error: (err as Error).message });
  }

  if (!result.success) {
    throw new BadRequestError(`Failed to send ${what}`, { error: result.error });
  }

  return { messageId: result.messageId, to, timestamp: Date.now() };
}

export async function messagingSendRoutesV2(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', createAuthMiddleware());

  server.post(
    '/instances/:instanceId/messages/text',
    {
      schema: {
        description: 'Send a text message',
        tags: ['Messaging'],
        summary: 'Send text',
        params: instanceParams,
        body: { $ref: 'v2SendText#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & { text: string };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('message', body.to, () =>
        client.sendText(body.to, body.text, quoted ? { quoted } : undefined),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/image',
    {
      schema: {
        description: 'Send an image message',
        tags: ['Messaging'],
        summary: 'Send image',
        params: instanceParams,
        body: { $ref: 'v2SendImage#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        image: string;
        caption?: string;
        viewOnce?: boolean;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('image', body.to, () =>
        client.sendImage(body.to, body.image, {
          caption: body.caption,
          viewOnce: body.viewOnce,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/video',
    {
      schema: {
        description: 'Send a video message',
        tags: ['Messaging'],
        summary: 'Send video',
        params: instanceParams,
        body: { $ref: 'v2SendVideo#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        video: string;
        caption?: string;
        viewOnce?: boolean;
        gifPlayback?: boolean;
        ptv?: boolean;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('video', body.to, () =>
        client.sendVideo(body.to, body.video, {
          caption: body.caption,
          viewOnce: body.viewOnce,
          gifPlayback: body.gifPlayback,
          ptv: body.ptv,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/audio',
    {
      schema: {
        description: 'Send an audio message',
        tags: ['Messaging'],
        summary: 'Send audio',
        params: instanceParams,
        body: { $ref: 'v2SendAudio#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        audio: string;
        ptt?: boolean;
        mimetype?: string;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('audio', body.to, () =>
        client.sendAudio(body.to, body.audio, {
          ptt: body.ptt,
          mimetype: body.mimetype,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/document',
    {
      schema: {
        description: 'Send a document message',
        tags: ['Messaging'],
        summary: 'Send document',
        params: instanceParams,
        body: { $ref: 'v2SendDocument#' },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        document: string;
        caption?: string;
        fileName?: string;
        mimetype?: string;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('document', body.to, () =>
        client.sendDocument(body.to, body.document, {
          caption: body.caption,
          fileName: body.fileName,
          mimetype: body.mimetype,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/location',
    {
      schema: {
        description: 'Send a location pin',
        tags: ['Messaging'],
        summary: 'Send location',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['to', 'latitude', 'longitude'],
          additionalProperties: false,
          properties: {
            to: { type: 'string', minLength: 1, maxLength: 100 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            name: { type: 'string' },
            address: { type: 'string' },
            chatJid: { type: 'string', nullable: true },
            quoted: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('location', body.to, () =>
        client.sendLocation(body.to, body.latitude, body.longitude, {
          name: body.name,
          address: body.address,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/contact',
    {
      schema: {
        description: 'Send one or more contact cards',
        tags: ['Messaging'],
        summary: 'Send contact',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['to', 'contacts'],
          additionalProperties: false,
          properties: {
            to: { type: 'string', minLength: 1, maxLength: 100 },
            contacts: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['fullName', 'phone'],
                additionalProperties: false,
                properties: {
                  fullName: { type: 'string', minLength: 1 },
                  phone: { type: 'string', minLength: 1 },
                  organization: { type: 'string' },
                },
              },
            },
            chatJid: { type: 'string', nullable: true },
            quoted: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & { contacts: ContactCard[] };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('contact', body.to, () =>
        client.sendContact(body.to, body.contacts, { quoted }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/sticker',
    {
      schema: {
        description: 'Send a sticker. WhatsApp expects WebP.',
        tags: ['Messaging'],
        summary: 'Send sticker',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['to', 'sticker'],
          additionalProperties: false,
          properties: {
            to: { type: 'string', minLength: 1, maxLength: 100 },
            sticker: { type: 'string', minLength: 1 },
            chatJid: { type: 'string', nullable: true },
            quoted: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & { sticker: string };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      const data = await send('sticker', body.to, () =>
        client.sendSticker(body.to, body.sticker, { quoted }),
      );
      reply.send({ success: true, data });
    },
  );

  server.post(
    '/instances/:instanceId/messages/poll',
    {
      schema: {
        description: 'Send a poll',
        tags: ['Messaging'],
        summary: 'Send poll',
        params: instanceParams,
        body: {
          type: 'object',
          required: ['to', 'name', 'options'],
          additionalProperties: false,
          properties: {
            to: { type: 'string', minLength: 1, maxLength: 100 },
            name: { type: 'string', minLength: 1, description: 'The question.' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 12,
              items: { type: 'string', minLength: 1 },
            },
            selectableCount: {
              type: 'integer',
              minimum: 1,
              default: 1,
              description: 'How many options one voter may pick.',
            },
            chatJid: { type: 'string', nullable: true },
            quoted: { type: 'string', nullable: true },
          },
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params as { instanceId: string };
      const body = request.body as SendBody & {
        name: string;
        options: string[];
        selectableCount?: number;
      };

      const client = requireConnectedClient(server, instanceId);
      const quoted = await resolveQuoted(client, body.quoted, body.chatJid);

      if (body.selectableCount !== undefined && body.selectableCount > body.options.length) {
        throw new BadRequestError('selectableCount cannot exceed the number of options');
      }

      const data = await send('poll', body.to, () =>
        client.sendPoll(body.to, body.name, body.options, {
          selectableCount: body.selectableCount,
          quoted,
        }),
      );
      reply.send({ success: true, data });
    },
  );
}
