/**
 * Environment configuration
 */

// Default values that indicate insecure configuration
const DEFAULT_API_KEY = 'miaw-api-key';
const DEFAULT_WEBHOOK_SECRET = 'webhook-secret';

interface Config {
  // API Configuration
  port: number;
  host: string;
  apiKey: string;
  webhookSecret: string;

  // Public base URL shown in API docs (supports `{subdomain}` template)
  publicServerUrl: string;
  publicServerSubdomain: string;

  // CORS
  corsOrigin: string;

  // Session Storage
  sessionPath: string;

  // Webhook Configuration
  webhookTimeout: number;
  webhookMaxRetries: number;
  webhookRetryDelay: number;
  // Hosts (or host:port) exempt from the webhook SSRF address check
  webhookSsrfAllowlist: string[];

  // Logging
  logLevel: string;
}

function loadConfig(): Config {
  const config: Config = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    publicServerUrl: process.env.PUBLIC_SERVER_URL || '',
    publicServerSubdomain: process.env.PUBLIC_SERVER_SUBDOMAIN || 'api',
    apiKey: process.env.API_KEY || DEFAULT_API_KEY,
    webhookSecret: process.env.WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    sessionPath: process.env.SESSION_PATH || './sessions',
    webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10),
    webhookMaxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '6', 10),
    webhookRetryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || '60000', 10),
    webhookSsrfAllowlist: (process.env.WEBHOOK_SSRF_ALLOWLIST || '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  // Validate configuration and log warnings
  validateConfig(config);

  return config;
}

/**
 * Validate configuration and log security warnings
 */
function validateConfig(config: Config): void {
  const warnings: string[] = [];

  // Check for insecure defaults
  if (config.apiKey === DEFAULT_API_KEY) {
    warnings.push('Using default API key. Set API_KEY environment variable for production.');
  }

  if (config.webhookSecret === DEFAULT_WEBHOOK_SECRET) {
    warnings.push(
      'Using default webhook secret. Set WEBHOOK_SECRET environment variable for production.',
    );
  }

  // Validate port range
  if (config.port < 1 || config.port > 65535) {
    warnings.push(
      `Invalid port ${config.port}. Port must be between 1 and 65535. Defaulting to 3000.`,
    );
    config.port = 3000;
  }

  // Check for open CORS in non-development
  if (config.corsOrigin === '*' && process.env.NODE_ENV === 'production') {
    warnings.push(
      'CORS origin is set to "*" in production. Consider restricting to specific origins.',
    );
  }

  // Log all warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Configuration Warnings:');
    warnings.forEach((warning) => {
      console.warn(`   - ${warning}`);
    });
    console.warn('');
  }
}

export const config = loadConfig();
