/**
 * Instance Manager Service
 * Manages multiple MiawClient instances
 */

import { EventEmitter } from 'events';
import { MiawClient, MiawClientOptions, ConnectionState } from 'miaw-core';
import pino from 'pino';
import { InstanceConfig, InstanceState, WebhookEvent, WebhookPayload } from '../types';

interface InstanceManagerOptions {
  sessionPath: string;
  webhookSecret: string;
  webhookTimeout: number;
  webhookMaxRetries: number;
  webhookRetryDelay: number;
}

interface ManagedInstance {
  config: InstanceConfig;
  client: MiawClient;
  state: InstanceState;
  disconnectTimeout?: NodeJS.Timeout;
}

/**
 * Manages MiawClient instances
 */
export class InstanceManager extends EventEmitter {
  private instances: Map<string, ManagedInstance> = new Map();
  private options: InstanceManagerOptions;
  private logger: pino.Logger;

  constructor(options: InstanceManagerOptions) {
    super();
    this.options = options;
    this.logger = pino({ level: 'info' });
  }

  /**
   * Create a new instance
   */
  async createInstance(config: InstanceConfig): Promise<InstanceState> {
    const { instanceId } = config;

    if (this.instances.has(instanceId)) {
      throw new Error(`Instance ${instanceId} already exists`);
    }

    this.logger.info({ instanceId }, 'Creating instance');

    // Create MiawClient
    const clientOptions: MiawClientOptions = {
      instanceId,
      sessionPath: this.options.sessionPath,
      debug: false,
    };

    const client = new MiawClient(clientOptions);

    // Set up event handlers
    this.setupClientEvents(instanceId, client);

    // Create state
    const state: InstanceState = {
      instanceId,
      status: 'disconnected',
      webhookEvents: config.webhookEvents || [],
      webhookUrl: config.webhookUrl,
      webhookEnabled: !!config.webhookUrl,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    const managed: ManagedInstance = {
      config,
      client,
      state,
    };

    this.instances.set(instanceId, managed);

    this.logger.info({ instanceId }, 'Instance created');

    return state;
  }

  /**
   * Get instance state
   */
  getInstance(instanceId: string): InstanceState | null {
    const managed = this.instances.get(instanceId);
    return managed ? managed.state : null;
  }

  /**
   * List all instances
   */
  listInstances(): InstanceState[] {
    return Array.from(this.instances.values()).map((m) => m.state);
  }

  /**
   * Delete instance
   */
  async deleteInstance(instanceId: string): Promise<void> {
    const managed = this.instances.get(instanceId);

    if (!managed) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    this.logger.info({ instanceId }, 'Deleting instance');

    // Disconnect if connected
    if (managed.state.status === 'connected') {
      await managed.client.disconnect();
    }

    // Remove event listeners
    managed.client.removeAllListeners();

    // Delete from map
    this.instances.delete(instanceId);

    this.logger.info({ instanceId }, 'Instance deleted');
  }

  /**
   * Update an instance's webhook settings without recreating it.
   * Only the fields present in `updates` are changed; passing
   * `webhookUrl: null` clears the webhook and disables delivery.
   */
  updateWebhook(
    instanceId: string,
    updates: { webhookUrl?: string | null; webhookEvents?: WebhookEvent[] },
  ): InstanceState {
    const managed = this.instances.get(instanceId);

    if (!managed) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const patch: Partial<InstanceState> = {};

    if ('webhookUrl' in updates) {
      const url = updates.webhookUrl || undefined;
      patch.webhookUrl = url;
      patch.webhookEnabled = !!url;
    }

    if ('webhookEvents' in updates) {
      patch.webhookEvents = updates.webhookEvents || [];
    }

    this.updateState(instanceId, patch);
    this.logger.info({ instanceId }, 'Webhook updated');

    return managed.state;
  }

  /**
   * Get MiawClient for instance
   */
  getClient(instanceId: string): MiawClient | null {
    const managed = this.instances.get(instanceId);
    return managed ? managed.client : null;
  }

  /**
   * Update instance state
   */
  private updateState(instanceId: string, updates: Partial<InstanceState>): void {
    const managed = this.instances.get(instanceId);
    if (managed) {
      managed.state = { ...managed.state, ...updates, lastActivity: new Date() };
    }
  }

  /**
   * Set up MiawClient event handlers
   */
  private setupClientEvents(instanceId: string, client: MiawClient): void {
    // Connection state changes
    client.on('connection', (state: ConnectionState) => {
      this.logger.info({ instanceId, state }, 'Connection state changed');
      this.updateState(instanceId, { status: state });

      // Emit webhook event
      this.emitWebhook(instanceId, 'connection', { state });

      if (state === 'connected') {
        const user = (client as any).socket?.user;
        if (user) {
          this.updateState(instanceId, {
            connectedAt: new Date(),
            phoneNumber: user.id?.split('@')[0],
          });
        }
        this.emitWebhook(instanceId, 'ready', {
          instanceId,
          connectedAt: Date.now(),
        });
      } else if (state === 'disconnected') {
        this.emitWebhook(instanceId, 'disconnected', {
          reason: 'Disconnected',
        });
      }
    });

    // QR code
    client.on('qr', (qr: string) => {
      this.logger.info({ instanceId }, 'QR code received');
      this.updateState(instanceId, { status: 'qr_required' });
      this.emitWebhook(instanceId, 'qr', { qr });
    });

    // Reconnecting
    client.on('reconnecting', (attempt: number) => {
      this.logger.info({ instanceId, attempt }, 'Reconnecting');
      this.updateState(instanceId, { status: 'reconnecting' });
      this.emitWebhook(instanceId, 'reconnecting', { attempt });
    });

    // Disconnected
    client.on('disconnected', (reason?: string) => {
      this.logger.info({ instanceId, reason }, 'Disconnected');
      this.updateState(instanceId, { status: 'disconnected' });
      this.emitWebhook(instanceId, 'disconnected', { reason });
    });

    // Error
    client.on('error', (error: Error) => {
      this.logger.error({ instanceId, error: error.message }, 'Instance error');
      this.emitWebhook(instanceId, 'error', { error: error.message });
    });

    // Message received
    client.on('message', (message: any) => {
      this.logger.debug({ instanceId, messageId: message.id }, 'Message received');
      this.emitWebhook(instanceId, 'message', message);
    });

    // Message edited
    client.on('message_edit', (edit: any) => {
      this.logger.debug({ instanceId, messageId: edit.messageId }, 'Message edited');
      this.emitWebhook(instanceId, 'message_edit', edit);
    });

    // Message deleted
    client.on('message_delete', (deletion: any) => {
      this.logger.debug({ instanceId, messageId: deletion.messageId }, 'Message deleted');
      this.emitWebhook(instanceId, 'message_delete', deletion);
    });

    // Message reaction
    client.on('message_reaction', (reaction: any) => {
      this.logger.debug({ instanceId, messageId: reaction.messageId }, 'Message reaction');
      this.emitWebhook(instanceId, 'message_reaction', reaction);
    });

    // Message receipt (delivery / read / played)
    client.on('message_receipt', (receipt: any) => {
      this.logger.debug({ instanceId, messageId: receipt.messageId }, 'Message receipt');
      this.emitWebhook(instanceId, 'message_receipt', receipt);
    });

    // Presence update
    client.on('presence', (update: any) => {
      this.logger.debug({ instanceId, jid: update.jid }, 'Presence update');
      this.emitWebhook(instanceId, 'presence', update);
    });

    // Session saved
    client.on('session_saved', () => {
      this.logger.debug({ instanceId }, 'Session saved');
    });
  }

  /**
   * Emit webhook event (actual delivery handled by WebhookDispatcher)
   */
  private emitWebhook(instanceId: string, event: WebhookEvent, data: any): void {
    const managed = this.instances.get(instanceId);
    if (!managed) return;

    // Check if webhook is enabled and event is subscribed
    if (!managed.state.webhookEnabled || !managed.state.webhookUrl) {
      return;
    }

    if (managed.state.webhookEvents.length > 0 && !managed.state.webhookEvents.includes(event)) {
      return;
    }

    const payload: WebhookPayload = {
      event,
      instanceId,
      timestamp: Date.now(),
      data,
    };

    // Emit to be handled by WebhookDispatcher
    this.emit('webhook', managed.state.webhookUrl, payload);
  }

  /**
   * Cleanup all instances
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing InstanceManager');

    const disconnectPromises = Array.from(this.instances.values()).map(async (managed) => {
      if (managed.state.status === 'connected') {
        try {
          await managed.client.disconnect();
        } catch (err) {
          this.logger.error({ instanceId: managed.config.instanceId, err }, 'Error disconnecting');
        }
      }
      managed.client.removeAllListeners();
    });

    await Promise.all(disconnectPromises);
    this.instances.clear();
    this.removeAllListeners();
  }
}
