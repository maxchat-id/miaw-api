/**
 * Instance Manager Service
 * Manages multiple MiawClient instances
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import {
  MiawClient,
  MiawClientOptions,
  ConnectionState,
  maskProxyUrl,
  validateProxyConfig,
} from 'miaw-core';
import type { ProxyConfig } from 'miaw-core';
import pino from 'pino';
import { config } from '../config';
import { InstanceConfig, InstanceState, WebhookEvent, WebhookPayload } from '../types';
import {
  describeProxy,
  type EffectiveProxyInfo,
  type ProxyInput,
  type ProxyPoolService,
  type ProxySource,
} from './ProxyService';

interface InstanceManagerOptions {
  sessionPath: string;
  webhookSecret: string;
  webhookTimeout: number;
  webhookMaxRetries: number;
  webhookRetryDelay: number;
  proxyPool?: ProxyPoolService;
}

interface ManagedInstance {
  config: InstanceConfig;
  client: MiawClient;
  state: InstanceState;
  disconnectTimeout?: NodeJS.Timeout;
  effectiveProxy?: ProxyInput;
  proxySource: ProxySource;
}

/**
 * Manages MiawClient instances
 */
export class InstanceManager extends EventEmitter {
  private instances: Map<string, ManagedInstance> = new Map();
  private options: InstanceManagerOptions;
  private logger: pino.Logger;
  private registryPath: string;

  constructor(options: InstanceManagerOptions) {
    super();
    this.options = options;
    // LOG_LEVEL applies here too; a hardcoded level ignored the setting and
    // made the service the loudest thing in a test run.
    this.logger = pino({ level: config.logLevel });
    this.registryPath = path.join(options.sessionPath, 'instances.json');
  }

  /**
   * Persist the instance registry (ids + webhook config) so instances survive a
   * restart. Session auth already lives on disk; this restores the list and
   * webhook targets that would otherwise be in-memory only.
   */
  private async persist(): Promise<void> {
    try {
      const registry: InstanceConfig[] = Array.from(this.instances.values()).map((m) => ({
        instanceId: m.state.instanceId,
        webhookUrl: m.state.webhookUrl,
        webhookEvents: m.state.webhookEvents,
        webhookEnabled: m.state.webhookEnabled,
      }));
      await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
      await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2));
    } catch (err) {
      this.logger.error({ err }, 'Failed to persist instance registry');
    }
  }

  /**
   * Recreate persisted instances on startup and reconnect them. Sessions live
   * on disk, so connect() resumes without a new QR. Connects run in the
   * background so a slow or failed one never blocks startup.
   */
  async restore(): Promise<void> {
    let registry: InstanceConfig[];
    try {
      registry = JSON.parse(await fs.readFile(this.registryPath, 'utf8'));
    } catch {
      return; // no registry yet (first boot)
    }

    for (const config of registry) {
      try {
        await this.createInstance(config);
        this.getClient(config.instanceId)
          ?.connect()
          .catch((err) =>
            this.logger.error({ instanceId: config.instanceId, err }, 'Restore connect failed'),
          );
      } catch (err) {
        this.logger.error({ instanceId: config.instanceId, err }, 'Restore failed');
      }
    }
    this.logger.info({ count: registry.length }, 'Instances restored');
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

    const storedConfig = this.cloneConfig(config);
    const { proxy: effectiveProxy, source: proxySource } = this.resolveEffectiveProxy(storedConfig);
    const client = this.createClient(storedConfig, effectiveProxy);

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
      config: storedConfig,
      client,
      state,
      effectiveProxy,
      proxySource,
    };

    this.instances.set(instanceId, managed);
    void this.persist();

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

    // Fully tear down the client for ANY status (clears reconnect timer, closes
    // socket, removes listeners). Deleting a still-connecting instance must stop
    // its reconnect loop — otherwise it can emit 'error' after teardown and crash
    // the whole (multi-tenant) process.
    await managed.client.dispose();

    // Delete from map
    this.instances.delete(instanceId);
    void this.persist();

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
    void this.persist();
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

  getProxy(instanceId: string): EffectiveProxyInfo {
    const managed = this.instances.get(instanceId);
    if (!managed) throw new Error(`Instance ${instanceId} not found`);
    return describeProxy(managed.effectiveProxy, managed.proxySource);
  }

  async replaceProxy(
    instanceId: string,
    proxy?: ProxyConfig | string,
  ): Promise<EffectiveProxyInfo> {
    const managed = this.instances.get(instanceId);
    if (!managed) throw new Error(`Instance ${instanceId} not found`);
    if (managed.state.status !== 'disconnected') {
      throw new Error('Instance must be disconnected before changing its proxy');
    }
    if (proxy !== undefined && !validateProxyConfig(proxy)) {
      throw new Error(`Invalid proxy configuration: ${maskProxyUrl(proxy)}`);
    }

    const nextClientOptions = { ...(managed.config.clientOptions || {}) };
    if (proxy === undefined) {
      delete nextClientOptions.proxy;
    } else {
      nextClientOptions.proxy = proxy;
    }

    const nextConfig: InstanceConfig = {
      ...managed.config,
      clientOptions: nextClientOptions,
    };
    const { proxy: effectiveProxy, source: proxySource } = this.resolveEffectiveProxy(nextConfig);
    const nextClient = this.createClient(nextConfig, effectiveProxy);

    await managed.client.disconnect();
    managed.client.removeAllListeners();
    this.setupClientEvents(instanceId, nextClient);
    managed.client = nextClient;
    managed.config = nextConfig;
    managed.effectiveProxy = effectiveProxy;
    managed.proxySource = proxySource;

    this.logger.info(
      { instanceId, proxy: describeProxy(effectiveProxy, proxySource) },
      'Instance proxy replaced',
    );
    return this.getProxy(instanceId);
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

  private cloneConfig(config: InstanceConfig): InstanceConfig {
    return {
      ...config,
      clientOptions: config.clientOptions ? { ...config.clientOptions } : undefined,
      webhookEvents: config.webhookEvents ? [...config.webhookEvents] : undefined,
    };
  }

  private resolveEffectiveProxy(config: InstanceConfig): {
    proxy?: ProxyInput;
    source: ProxySource;
  } {
    const explicit = config.clientOptions?.proxy;
    if (explicit !== undefined) {
      if (!validateProxyConfig(explicit)) {
        throw new Error(`Invalid proxy configuration: ${maskProxyUrl(explicit)}`);
      }
      return { proxy: explicit, source: 'explicit' };
    }

    const pooled = this.options.proxyPool?.select(config.instanceId);
    return pooled ? { proxy: pooled, source: 'pool' } : { source: 'none' };
  }

  private createClient(config: InstanceConfig, proxy?: ProxyInput): MiawClient {
    const clientOptions: MiawClientOptions = {
      ...config.clientOptions,
      instanceId: config.instanceId,
      sessionPath: this.options.sessionPath,
      debug: config.clientOptions?.debug ?? false,
      ...(proxy !== undefined ? { proxy } : {}),
    };
    return new MiawClient(clientOptions);
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
        // Paired now → drop any cached QR so a pull returns empty.
        this.updateState(instanceId, { lastQr: undefined });
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
      this.updateState(instanceId, { status: 'qr_required', lastQr: qr });
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

    // Own outgoing message not sent via the API (e.g. typed on the phone)
    client.on('message_own', (message: any) => {
      this.logger.debug({ instanceId, messageId: message.id }, 'Own message');
      this.emitWebhook(instanceId, 'message_own', message);
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
