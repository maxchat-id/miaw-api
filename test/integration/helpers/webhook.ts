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

  /**
   * Files share the port sequentially, and a socket can outlive the previous
   * file's stop() by a few milliseconds. Without an 'error' listener that
   * collision surfaced as an unhandled EADDRINUSE and failed the whole file -
   * and once a file failed in beforeAll its server leaked, so the next one
   * collided too. The preferred port is retried briefly, then any free port is
   * taken; callers read the address back from getWebhookUrl().
   */
  start(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    const attempt = (port: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
          this.handleRequest(req, res);
        });

        const onError = (err: NodeJS.ErrnoException) => {
          server.close();
          if (err.code === 'EADDRINUSE' && Date.now() < deadline) {
            // A previous file's socket may still be closing. Retry the
            // preferred port for a moment, then take any free one - the tests
            // read the URL from getWebhookUrl(), so the number does not matter.
            setTimeout(
              () => attempt(Date.now() + 500 >= deadline ? 0 : port).then(resolve, reject),
              100,
            );
            return;
          }
          reject(err);
        };

        server.once('error', onError);
        server.listen(port, () => {
          server.removeListener('error', onError);
          const address = server.address();
          if (address && typeof address === 'object') {
            this.port = address.port;
          }
          this.server = server;
          this.isRunning = true;
          resolve();
        });
      });

    return attempt(this.port);
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // close() alone waits for keep-alive sockets to go idle, which leaves the
      // port held while the next file is already trying to listen on it.
      this.server.closeAllConnections?.();
      this.server.close(() => {
        this.isRunning = false;
        this.server = undefined;
        resolve();
      });
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
