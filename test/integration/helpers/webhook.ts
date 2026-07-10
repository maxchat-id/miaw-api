/**
 * Webhook Test Server
 * Receives webhook events for testing
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';

export interface WebhookEvent {
  event: string;
  instanceId: string;
  timestamp: number;
  data: any;
}

export interface WebhookRequest {
  body: WebhookEvent;
  headers: Record<string, string>;
  timestamp: number;
}

export class WebhookTestServer {
  private server?: Server;
  private port: number;
  private events: WebhookEvent[] = [];
  private requests: WebhookRequest[] = [];
  private isRunning: boolean = false;
  private failMode: boolean = false;
  private requestCount: number = 0;

  constructor(port = 3001) {
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        this.isRunning = true;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.requestCount++;

    if (req.method === 'POST' && req.url === '/webhook') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const event: WebhookEvent = JSON.parse(body);
          this.events.push(event);

          // Capture headers and request data
          this.requests.push({
            body: event,
            headers: req.headers as Record<string, string>,
            timestamp: Date.now(),
          });

          // Handle fail mode (for retry testing)
          if (this.failMode) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received: true }));
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  getWebhookUrl(): string {
    return `http://127.0.0.1:${this.port}/webhook`;
  }

  getEvents(): WebhookEvent[] {
    return [...this.events];
  }

  getEventsByType(eventType: string): WebhookEvent[] {
    return this.events.filter((e) => e.event === eventType);
  }

  clearEvents(): void {
    this.events = [];
    this.requests = [];
  }

  getRequests(): WebhookRequest[] {
    return [...this.requests];
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }

  setFailMode(enabled: boolean): void {
    this.failMode = enabled;
  }

  waitForEvent(eventType: string, timeout: number = 10000): Promise<WebhookEvent | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const event = this.events.find((e) => e.event === eventType);
        if (event) {
          clearInterval(checkInterval);
          resolve(event);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  }

  waitForEvents(eventTypes: string[], timeout: number = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const receivedTypes = new Set(this.events.map((e) => e.event));
        const hasAll = eventTypes.every((type) => receivedTypes.has(type));

        if (hasAll) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }
}
