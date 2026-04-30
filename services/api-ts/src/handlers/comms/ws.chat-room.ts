/**
 * Chat Room WebSocket Handler
 * Room-specific connection for real-time chat and video signaling
 *
 * Endpoint: /ws/comms/chat-rooms/:room
 * Auth: Required + room participant validation
 *
 * Handles:
 * - Chat messages in this room
 * - Video signaling (offer/answer/ICE candidates)
 * - Presence indicators (typing, online status)
 */

import type { Context } from 'hono';
import type { WSContext } from 'hono/ws';
import type { WebSocketHandler } from '@/core/ws';
import type { User } from '@/types/auth';
import type { DatabaseInstance } from '@/core/database';
import { authMiddleware } from '@/middleware/auth';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';

/**
 * Message types for chat room WebSocket
 */
type MessageType =
  | 'chat.message'
  | 'chat.typing'
  | 'video.offer'
  | 'video.answer'
  | 'video.ice-candidate'
  | 'ping';

/**
 * WebRTC signaling message structure
 */
interface SignalMessage {
  type: 'video.offer' | 'video.answer' | 'video.ice-candidate';
  from: string;
  data: any; // RTCSessionDescriptionInit | RTCIceCandidateInit from WebRTC API
}

export const config: WebSocketHandler = {
  path: '/ws/comms/chat-rooms/:room',
  description: 'Chat room real-time communication (chat + video signaling)',
  middleware: [authMiddleware()],

  async onConnect(ctx: Context, ws: WSContext) {
    const roomId = ctx.req.param('room');
    const user = ctx.get('user') as User;
    const db = ctx.get('database') as DatabaseInstance;
    const wsService = ctx.get('ws');
    const logger = ctx.get('logger');

    // Verify room exists and user is a participant
    const roomRepo = new ChatRoomRepository(db, logger);

    // Authorization uses Person ID directly (no profile lookups needed)

    // Check room exists
    const room = await roomRepo.findOneById(roomId);
    if (!room) {
      logger.error({ roomId }, 'Chat room not found');
      ws.send(JSON.stringify({ event: 'error', payload: { message: 'Chat room not found' } }));
      ws.close(1008, 'Room not found');
      return;
    }

    // Check if user is a participant (via their profiles)
    const isParticipant = room.participants.includes(user.id);

    if (!isParticipant) {
      logger.error({ userId: user.id, roomId }, 'User is not a participant in chat room');
      ws.send(JSON.stringify({ event: 'error', payload: { message: 'Access denied: not a participant' } }));
      ws.close(1008, 'Not authorized');
      return;
    }

    // Track channel connection (namespaced to avoid conflicts with other resource types)
    const channel = `chat-rooms/${roomId}`;
    wsService.trackChannel(channel, ws);

    // Send connection confirmation
    ws.send(JSON.stringify({
      event: 'connected',
      payload: {
        roomId,
        userId: user.id,
        timestamp: new Date().toISOString(),
      },
    }));

    // Notify channel about new participant (exclude self)
    await wsService.publishToChannel(channel, 'user.joined', {
      userId: user.id,
      timestamp: new Date().toISOString(),
    }, ws);

    logger.info({ userId: user.id, roomId }, 'User connected to chat room WebSocket');
  },

  async onMessage(ctx: Context, ws: WSContext, message: any) {
    const roomId = ctx.req.param('room');
    const user = ctx.get('user') as User;
    const db = ctx.get('database') as DatabaseInstance;
    const wsService = ctx.get('ws');
    const logger = ctx.get('logger');

    const wsId = (ws.raw as any).__wsId;
    logger.debug({ userId: user.id, roomId, wsId, messageType: message.type }, 'Processing WebSocket message');

    const { type, data } = message as { type: MessageType; data: any };
    const channel = `chat-rooms/${roomId}`;

    switch (type) {
      case 'ping':
        // Heartbeat/keepalive
        ws.send(JSON.stringify({ event: 'pong', payload: { timestamp: new Date().toISOString() } }));
        break;

      case 'chat.message': {
        // Persist message to database
        const messageRepo = new ChatMessageRepository(db, logger);
        const roomRepo = new ChatRoomRepository(db, logger);

        const savedMessage = await messageRepo.createTextMessage(
          roomId,
          user.id,
          data.text
        );

        // Update room metadata
        await roomRepo.updateLastMessage(roomId, savedMessage.timestamp);

        // Broadcast complete message object to all channel participants
        await wsService.publishToChannel(channel, 'chat.message', savedMessage);

        logger.debug({ userId: user.id, roomId, messageId: savedMessage.id }, 'Chat message persisted and sent');
        break;
      }

      case 'chat.typing':
        // Relay typing indicator to channel
        await wsService.publishToChannel(channel, 'chat.typing', {
          from: user.id,
          isTyping: data.isTyping,
        });
        break;

      case 'video.offer':
      case 'video.answer':
      case 'video.ice-candidate': {
        // Relay WebRTC signaling to channel participants (exclude sender)
        const signalMessage: SignalMessage = {
          type,
          from: user.id,
          data: data,
        };

        await wsService.publishToChannel(channel, type, signalMessage, ws);
        logger.debug({ userId: user.id, roomId, type }, 'Video signaling message relayed');
        break;
      }

      default:
        logger.warn({ userId: user.id, roomId, type }, 'Unknown message type from chat room WebSocket');
    }
  },

  async onClose(ctx: Context, ws: WSContext) {
    const roomId = ctx.req.param('room');
    const user = ctx.get('user') as User;
    const wsService = ctx.get('ws');
    const logger = ctx.get('logger');

    // Untrack channel connection
    const channel = `chat-rooms/${roomId}`;
    wsService.untrackChannel(channel, ws);

    // Notify channel about participant leaving
    await wsService.publishToChannel(channel, 'user.left', {
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    logger.info({ userId: user.id, roomId }, 'User disconnected from chat room WebSocket');
  },
};
