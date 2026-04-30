/**
 * WebSocket Service - Centralized WebSocket management
 *
 * Provides:
 * - WebSocket handler creation (upgradeWebSocket)
 * - Connection tracking (by user, channel)
 * - Publishing API (publishToUser, publishToChannel)
 * - Bun.serve websocket handler
 *
 * Channel Namespacing:
 * Channels should be namespaced by resource type to avoid conflicts:
 * - `chat-rooms/${roomId}` for chat room channels
 * - `notifications/${userId}` for user notification channels
 * - `consultations/${consultationId}` for consultation channels
 */

import { createBunWebSocket } from 'hono/bun';
import type { Context, Next } from 'hono';
import type { WSContext } from 'hono/ws';
import type { Logger } from '@/types/logger';

/**
 * WebSocket handler configuration
 * Exported from ws.*.ts files for code generation
 */
export interface WebSocketHandler {
  path: string;
  description?: string;
  middleware?: Array<(ctx: Context, next: Next) => Promise<void>>;
  onConnect?: (ctx: Context, ws: WSContext) => Promise<void>;
  onMessage?: (ctx: Context, ws: WSContext, message: any) => Promise<void>;
  onClose?: (ctx: Context, ws: WSContext) => Promise<void>;
  onError?: (ctx: Context, ws: WSContext, error: any) => Promise<void>;
}

/**
 * WebSocket message envelope
 * Standard format for all WebSocket messages
 */
export interface WebSocketMessage {
  event: string;
  payload?: any;
}

/**
 * Connection metadata
 */
interface ConnectionMetadata {
  ws: WSContext;
  userId?: string;
  channelId?: string;
}

/**
 * WebSocket Service
 * Manages WebSocket connections and provides publishing API
 */
export class WebSocketService {
  public upgradeWebSocket: any;
  public websocket: any; // For Bun.serve()

  private logger: Logger;

  // Connection tracking by different identifiers
  private connections = {
    byUser: new Map<string, WSContext>(),
    byChannel: new Map<string, Set<WSContext>>(),
    metadata: new WeakMap<WSContext, ConnectionMetadata>(),
  };

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'websocket' });

    // Create Hono WebSocket utilities
    const { upgradeWebSocket, websocket } = createBunWebSocket();
    this.upgradeWebSocket = upgradeWebSocket;
    this.websocket = websocket;

    this.logger.debug('WebSocket service initialized');
  }

  // ==================== Publishing API ====================

  /**
   * Publish message to a specific user's WebSocket connection
   * @param userId - User ID to send message to
   * @param event - Event type/name
   * @param payload - Optional event data
   */
  async publishToUser(userId: string, event: string, payload?: any): Promise<boolean> {
    const ws = this.connections.byUser.get(userId);

    if (!ws) {
      this.logger.debug({ userId, event }, 'User not connected, skipping WebSocket publish');
      return false;
    }

    const message: WebSocketMessage = { event, payload };
    ws.send(JSON.stringify(message));

    this.logger.debug({ userId, event }, 'Published message to user');
    return true;
  }

  /**
   * Publish message to all connections in a channel
   * @param channelId - Channel ID to send message to (should be namespaced, e.g., 'chat-rooms/123')
   * @param event - Event type/name
   * @param payload - Optional event data
   * @param excludeWs - Optional WebSocket connection to exclude (don't echo to sender)
   */
  async publishToChannel(channelId: string, event: string, payload?: any, excludeWs?: WSContext): Promise<number> {
    const connections = this.connections.byChannel.get(channelId);

    if (!connections || connections.size === 0) {
      this.logger.debug({ channelId, event }, 'No connections in channel, skipping publish');
      return 0;
    }

    const message: WebSocketMessage = { event, payload };
    const messageStr = JSON.stringify(message);

    let sent = 0;
    let excluded = 0;
    const excludeId = excludeWs ? (excludeWs.raw as any).__wsId : null;

    connections.forEach(ws => {
      const wsId = (ws.raw as any).__wsId;
      // Skip the excluded connection (sender) using unique ID
      if (excludeId && wsId === excludeId) {
        excluded++;
        this.logger.debug({ channelId, event, wsId }, 'Excluding sender from channel publish');
        return;
      }

      ws.send(messageStr);
      sent++;
    });

    this.logger.debug({ channelId, event, sent, excluded, totalConnections: connections.size }, 'Published message to channel');
    return sent;
  }

  // ==================== Connection Tracking API ====================

  /**
   * Track a user's WebSocket connection
   * Used by handlers in onConnect
   * @param userId - User ID
   * @param ws - WebSocket context
   */
  trackUser(userId: string, ws: WSContext): void {
    // Remove existing connection for this user (ensures single connection per user)
    const existing = this.connections.byUser.get(userId);
    if (existing) {
      this.logger.debug({ userId }, 'Replacing existing user connection');
      this.untrackUser(userId);
    }

    this.connections.byUser.set(userId, ws);

    // Update metadata
    const metadata: ConnectionMetadata = this.connections.metadata.get(ws) || { ws };
    metadata.userId = userId;
    this.connections.metadata.set(ws, metadata);

    this.logger.info({ userId }, 'User connection tracked');
  }

  /**
   * Remove user connection tracking
   * Used by handlers in onClose
   * @param userId - User ID
   */
  untrackUser(userId: string): void {
    const ws = this.connections.byUser.get(userId);
    if (ws) {
      this.connections.byUser.delete(userId);
      this.logger.info({ userId }, 'User connection untracked');
    }
  }

  /**
   * Track a channel connection
   * Used by handlers in onConnect
   * @param channelId - Channel ID (should be namespaced, e.g., 'chat-rooms/123')
   * @param ws - WebSocket context
   */
  trackChannel(channelId: string, ws: WSContext): void {
    if (!this.connections.byChannel.has(channelId)) {
      this.connections.byChannel.set(channelId, new Set());
    }

    this.connections.byChannel.get(channelId)!.add(ws);

    // Update metadata
    const metadata: ConnectionMetadata = this.connections.metadata.get(ws) || { ws };
    metadata.channelId = channelId;
    this.connections.metadata.set(ws, metadata);

    const channelSize = this.connections.byChannel.get(channelId)!.size;
    this.logger.info({ channelId, channelSize }, 'Channel connection tracked');
  }

  /**
   * Remove channel connection tracking
   * Used by handlers in onClose
   * @param channelId - Channel ID (should be namespaced, e.g., 'chat-rooms/123')
   * @param ws - WebSocket context
   */
  untrackChannel(channelId: string, ws: WSContext): void {
    const channel = this.connections.byChannel.get(channelId);

    if (channel) {
      channel.delete(ws);

      // Clean up empty channels
      if (channel.size === 0) {
        this.connections.byChannel.delete(channelId);
        this.logger.info({ channelId }, 'Empty channel cleaned up');
      } else {
        this.logger.info({ channelId, channelSize: channel.size }, 'Channel connection untracked');
      }
    }
  }

  // ==================== Stats / Health ====================

  /**
   * Get connection statistics
   */
  getStats() {
    const totalConnections = Array.from(this.connections.byChannel.values())
      .reduce((sum, set) => sum + set.size, 0);

    return {
      totalConnections,
      userConnections: this.connections.byUser.size,
      channels: this.connections.byChannel.size,
    };
  }
}

/**
 * Factory function to create WebSocketService
 * @param logger - Logger instance
 * @returns WebSocketService instance
 */
export function createWebSocketService(logger: Logger): WebSocketService {
  return new WebSocketService(logger);
}
