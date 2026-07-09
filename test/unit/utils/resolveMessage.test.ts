/**
 * Unit tests for resolveStoredMessage
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveStoredMessage } from '../../../src/utils/resolveMessage';
import type { MiawClient } from 'miaw-core';

function clientWith(messages: Array<{ id: string }> | undefined, success = true) {
  return {
    getChatMessages: vi.fn().mockResolvedValue({ success, messages }),
  } as unknown as MiawClient;
}

describe('resolveStoredMessage', () => {
  it('returns the message whose id matches', async () => {
    const client = clientWith([{ id: 'm1' }, { id: 'm2' }]);
    const msg = await resolveStoredMessage(client, '628@s.whatsapp.net', 'm2');
    expect(msg.id).toBe('m2');
    expect(client.getChatMessages).toHaveBeenCalledWith('628@s.whatsapp.net');
  });

  it('throws NotFound when no message matches the id', async () => {
    const client = clientWith([{ id: 'm1' }]);
    await expect(
      resolveStoredMessage(client, '628@s.whatsapp.net', 'missing')
    ).rejects.toThrow(/not found/i);
  });

  it('throws NotFound when the chat has no messages', async () => {
    const client = clientWith(undefined, false);
    await expect(
      resolveStoredMessage(client, '628@s.whatsapp.net', 'm1')
    ).rejects.toThrow(/not found/i);
  });
});
