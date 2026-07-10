/**
 * HTTP Helper for Integration Tests
 */

interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    defaultTimeout: number = 30000,
  ) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
    this.defaultTimeout = defaultTimeout;
  }

  async request(path: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const { method = 'GET', headers = {}, body, timeout = this.defaultTimeout } = options;

    const url = `${this.baseUrl}${path}`;
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async get(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'GET' });
  }

  async post(path: string, body?: any, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'POST', body });
  }

  async put(path: string, body?: any, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'PUT', body });
  }

  async delete(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.request(path, { ...options, method: 'DELETE' });
  }

  withApiKey(apiKey: string): HttpClient {
    return new HttpClient(this.baseUrl, {
      ...this.defaultHeaders,
      Authorization: `Bearer ${apiKey}`,
    });
  }

  withoutAuth(): HttpClient {
    const headers = { ...this.defaultHeaders };
    delete headers['Authorization'];
    return new HttpClient(this.baseUrl, headers);
  }
}
