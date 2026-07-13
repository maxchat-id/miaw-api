/**
 * API Type Definitions
 */

// ============================================================================
// Instance Types
// ============================================================================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'qr_required';

export interface InstanceConfig {
  instanceId: string;
  webhookUrl?: string;
  webhookEvents?: WebhookEvent[];
  webhookEnabled?: boolean;
}

export interface InstanceState {
  instanceId: string;
  status: ConnectionState;
  webhookUrl?: string;
  webhookEvents: WebhookEvent[];
  webhookEnabled: boolean;
  createdAt: Date;
  lastActivity: Date;
  connectedAt?: Date;
  phoneNumber?: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEvent =
  | 'qr'
  | 'ready'
  | 'message'
  | 'message_edit'
  | 'message_delete'
  | 'message_reaction'
  | 'message_receipt'
  | 'presence'
  | 'connection'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface WebhookPayload {
  event: WebhookEvent;
  instanceId: string;
  timestamp: number;
  data: any;
}

// ============================================================================
// Message Types
// ============================================================================

export interface SendTextOptions {
  quoted?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export type ApiResult<T = any> = ApiResponse<T> | ApiError;

// ============================================================================
// HTTP Types
// ============================================================================

export interface HttpError extends Error {
  statusCode: number;
  code: string;
}
