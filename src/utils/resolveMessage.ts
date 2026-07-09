/**
 * Resolve a messageId to a miaw-core `MiawMessage`.
 *
 * miaw-core's message operations (edit, delete, react, forward, …) take a full
 * `MiawMessage` (with its `raw` payload), not a messageId string, and expose no
 * id-based lookup. We reconstruct it from the in-memory message store via
 * `getChatMessages(chatJid)`. Only messages currently in the store are
 * resolvable; unknown ids raise a NotFoundError.
 */

import type { MiawClient, MiawMessage } from 'miaw-core';
import { NotFoundError } from './errorHandler';

export async function resolveStoredMessage(
  client: MiawClient,
  chatJid: string,
  messageId: string
): Promise<MiawMessage> {
  const result = await client.getChatMessages(chatJid);
  const message = result.messages?.find((m) => m.id === messageId);

  if (!message) {
    throw new NotFoundError('Message');
  }

  return message;
}
