/**
 * Webhook Dispatcher Service
 * Handles delivery of webhook events with retry mechanism
 */

import pino from 'pino';
import crypto from 'crypto';

interface WebhookDispatcherOptions {
  secret: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

interface WebhookDelivery {
  url: string;
  payload: any;
  attempt: number;
  nextRetryTime?: number;
}

interface WebhookDeliveryStats {
  queued: number;
  delivered: number;
  failed: number;
  lastDeliveryTime?: number;
  lastFailureTime?: number;
}

/**
 * Manages webhook delivery with retry mechanism
 */
export class WebhookDispatcher {
  private options: WebhookDispatcherOptions;
  private logger: pino.Logger;
  private deliveryQueue: Map<string, WebhookDelivery>;
  private processingInterval?: NodeJS.Timeout;
  // Stats tracking
  private stats: WebhookDeliveryStats = {
    queued: 0,
    delivered: 0,
    failed: 0,
  };

  constructor(options: WebhookDispatcherOptions) {
    this.options = options;
    this.logger = pino({ level: 'info' });
    this.deliveryQueue = new Map();
    this.startProcessing();
  }

  /**
   * Queue webhook for delivery
   */
  async queue(url: string, payload: any): Promise<void> {
    const deliveryId = this.generateDeliveryId(payload);

    this.deliveryQueue.set(deliveryId, {
      url,
      payload,
      attempt: 0,
    });

    this.stats.queued++;
    this.logger.debug({ deliveryId, url, event: payload.event }, 'Webhook queued');
  }

  /**
   * Process queued webhooks
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  /**
   * Process delivery queue
   */
  private async processQueue(): Promise<void> {
    try {
      const now = Date.now();

      for (const [deliveryId, delivery] of this.deliveryQueue.entries()) {
        // Check if it's time to retry
        if (delivery.nextRetryTime && delivery.nextRetryTime > now) {
          continue;
        }

        // Attempt delivery
        const success = await this.deliver(delivery);

        if (success) {
          this.deliveryQueue.delete(deliveryId);
        } else if (delivery.attempt >= this.options.maxRetries) {
          // Max retries reached, give up
          this.logger.warn(
            { deliveryId, attempt: delivery.attempt },
            'Webhook delivery failed, max retries reached',
          );
          this.deliveryQueue.delete(deliveryId);
        } else {
          // Schedule retry
          const retryDelay = this.calculateRetryDelay(delivery.attempt);
          delivery.nextRetryTime = Date.now() + retryDelay;
          this.deliveryQueue.set(deliveryId, delivery);
        }
      }
    } catch (err) {
      // Log error but don't crash the processing loop
      this.logger.error(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'Error in webhook processing queue',
      );
    }
  }

  /**
   * Deliver webhook to URL
   */
  private async deliver(delivery: WebhookDelivery): Promise<boolean> {
    delivery.attempt++;

    this.logger.debug(
      {
        deliveryId: this.generateDeliveryId(delivery.payload),
        attempt: delivery.attempt,
        url: delivery.url,
      },
      'Delivering webhook',
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      const timestamp = Date.now();
      const signature = this.generateSignature(delivery.payload, timestamp);

      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Miaw-Signature': signature,
          'X-Miaw-Timestamp': timestamp.toString(),
          'User-Agent': 'Miaw-Webhook/1.0',
        },
        body: JSON.stringify(delivery.payload),
        signal: controller.signal,
        // Don't follow redirects: a redirect to an internal address would
        // bypass the write-time SSRF validation of the webhook URL.
        redirect: 'error',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.stats.delivered++;
        this.stats.lastDeliveryTime = timestamp;
        this.logger.info(
          {
            deliveryId: this.generateDeliveryId(delivery.payload),
            attempt: delivery.attempt,
            status: response.status,
          },
          'Webhook delivered successfully',
        );
        return true;
      }

      this.logger.warn(
        {
          deliveryId: this.generateDeliveryId(delivery.payload),
          attempt: delivery.attempt,
          status: response.status,
        },
        'Webhook delivery failed with non-OK status',
      );
      return false;
    } catch (err: any) {
      this.stats.failed++;
      this.stats.lastFailureTime = Date.now();
      this.logger.warn(
        {
          deliveryId: this.generateDeliveryId(delivery.payload),
          attempt: delivery.attempt,
          error: err.message,
        },
        'Webhook delivery failed',
      );
      return false;
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delays = [0, 60000, 300000, 900000, 3600000]; // 0, 1min, 5min, 15min, 1hour
    return delays[Math.min(attempt, delays.length - 1)];
  }

  /**
   * Generate webhook signature with timestamp
   * Format: sha256=<hex_signature>
   */
  private generateSignature(payload: any, timestamp: number): string {
    const payloadString = JSON.stringify(payload);
    const payloadWithTimestamp = `${timestamp}.${payloadString}`;
    const signature = crypto
      .createHmac('sha256', this.options.secret)
      .update(payloadWithTimestamp)
      .digest('hex');
    return `sha256=${signature}`;
  }

  /**
   * Verify webhook signature (for webhook consumers)
   * Uses timing-safe comparison to prevent timing attacks
   */
  static verifySignature(
    payload: any,
    signature: string,
    timestamp: number,
    secret: string,
    maxAge: number = 300000, // 5 minutes default
  ): boolean {
    // Check timestamp age (replay prevention)
    const now = Date.now();
    if (now - timestamp > maxAge) {
      return false;
    }

    // Extract signature from format: sha256=<hex>
    const match = signature.match(/^sha256=(.+)$/);
    if (!match) {
      return false;
    }

    const expectedSignature = match[1];
    const payloadString = JSON.stringify(payload);
    const payloadWithTimestamp = `${timestamp}.${payloadString}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadWithTimestamp)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    if (expectedSignature.length !== computedSignature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(computedSignature));
  }

  /**
   * Generate unique delivery ID
   */
  private generateDeliveryId(payload: any): string {
    return `${payload.event}-${payload.instanceId}-${payload.timestamp}`;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.deliveryQueue.size;
  }

  /**
   * Get delivery stats
   */
  getStats(): WebhookDeliveryStats {
    return {
      ...this.stats,
      queued: this.deliveryQueue.size, // Current queue size
    };
  }

  /**
   * Reset stats (for testing)
   */
  resetStats(): void {
    this.stats = {
      queued: 0,
      delivered: 0,
      failed: 0,
    };
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    this.deliveryQueue.clear();
  }
}
