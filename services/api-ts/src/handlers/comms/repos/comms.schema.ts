/**
 * Database schema for comms module - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL for chat rooms and messages
 */

import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  integer, 
  jsonb, 
  index,
  pgEnum
} from 'drizzle-orm/pg-core';
import { baseEntityFields } from '@/core/database.schema';

// Participants are referenced by person ID in the persons table.

// Enums for chat room and message status
export const chatRoomStatusEnum = pgEnum('chat_room_status', [
  'active',
  'archived'
]);

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'system', 
  'video_call'
]);

export const videoCallStatusEnum = pgEnum('video_call_status', [
  'starting',
  'active',
  'ended',
  'cancelled'
]);

export const participantTypeEnum = pgEnum('participant_type', [
  'client',
  'host'
]);

// Chat Rooms - Flexible communication rooms supporting any number of participants
export const chatRooms = pgTable('chat_room', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,

  // Flexible participant and admin arrays
  participants: jsonb('participants')
    .$type<string[]>()
    .notNull(),

  admins: jsonb('admins')
    .$type<string[]>()
    .notNull(),

  // Generic context linking (bookings, billing sessions, etc.)
  context: text('context_id'),
    // Note: Generic reference - can link to bookings, billing, etc.
  
  // Room status and metadata
  status: chatRoomStatusEnum('status')
    .notNull()
    .default('active'),
  
  lastMessageAt: timestamp('last_message_at'),
  
  messageCount: integer('message_count')
    .notNull()
    .default(0),
  
  // Efficiency reference for active video call
  activeVideoCallMessage: uuid('active_video_call_message_id'),
}, (table) => ({
  // Performance indexes for array operations
  participantsIdx: index('chat_rooms_participants_idx').using('gin', table.participants),
  adminsIdx: index('chat_rooms_admins_idx').using('gin', table.admins),
  contextIdx: index('chat_rooms_context_idx').on(table.context),
  statusIdx: index('chat_rooms_status_idx').on(table.status),
  lastMessageAtIdx: index('chat_rooms_last_message_at_idx').on(table.lastMessageAt),
  activeVideoCallIdx: index('chat_rooms_active_video_call_idx').on(table.activeVideoCallMessage),


  // Compound indexes for common queries
  statusLastMessageIdx: index('chat_rooms_status_last_message_idx')
    .on(table.status, table.lastMessageAt),
}));

// Chat Messages - Immutable messages with optional video call data
export const chatMessages = pgTable('chat_message', {
  // Base entity fields
  ...baseEntityFields,
  
  // Core message fields
  chatRoom: uuid('chat_room_id')
    .notNull()
    .references(() => chatRooms.id, { onDelete: 'cascade' }),
  
  sender: uuid('sender_id')
    .notNull(),
  
  timestamp: timestamp('timestamp')
    .notNull()
    .defaultNow(),
  
  messageType: messageTypeEnum('message_type')
    .notNull(),
  
  // Text content (for text and system messages)
  message: text('message'), // maxLength validation in repository (5000 chars)
  
  // Video call data (for video_call messages)
  videoCallData: jsonb('video_call_data').$type<VideoCallData>(),
}, (table) => ({
  // Performance indexes
  chatRoomIdx: index('chat_messages_chat_room_idx').on(table.chatRoom),
  senderIdx: index('chat_messages_sender_idx').on(table.sender),
  timestampIdx: index('chat_messages_timestamp_idx').on(table.timestamp),
  messageTypeIdx: index('chat_messages_type_idx').on(table.messageType),

  
  // Compound indexes for common queries
  chatRoomTimestampIdx: index('chat_messages_room_timestamp_idx')
    .on(table.chatRoom, table.timestamp),
  chatRoomTypeIdx: index('chat_messages_room_type_idx')
    .on(table.chatRoom, table.messageType),
  senderTimestampIdx: index('chat_messages_sender_timestamp_idx')
    .on(table.sender, table.timestamp),
}));

// TypeScript interfaces for video call data structure
export interface VideoCallData {
  status: 'starting' | 'active' | 'ended' | 'cancelled';
  roomUrl?: string;
  token?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  participants: CallParticipant[];
}

export interface CallParticipant {
  user: string; // UUID
  userType: 'client' | 'host';
  displayName: string;
  joinedAt?: string;
  leftAt?: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

// Type exports for TypeScript
export type ChatRoom = typeof chatRooms.$inferSelect;
export type NewChatRoom = typeof chatRooms.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// Request/Response types for handlers
export interface ChatRoomFilters {
  participants?: string[]; // Find rooms containing any of these participants
  admins?: string[]; // Find rooms with any of these admins
  status?: 'active' | 'archived';
  context?: string; // Generic context ID (booking, billing, etc.)
  withParticipant?: string; // Find rooms containing this specific participant
  hasActiveCall?: boolean;
}

export interface ChatMessageFilters {
  chatRoom?: string;
  sender?: string;
  messageType?: 'text' | 'system' | 'video_call';
  timestampFrom?: string;
  timestampTo?: string;
}

// API request types
export interface SendTextMessageRequest {
  messageType: 'text';
  message: string;
}

export interface StartVideoCallRequest {
  messageType: 'video_call';
  videoCallData: StartVideoCallData;
}

export interface StartVideoCallData {
  status: 'starting';
  participants: CallParticipant[];
}

export interface JoinVideoCallRequest {
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface UpdateParticipantRequest {
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

export interface CreateChatRoomRequest {
  participants: string[];
  admins?: string[];
  context?: string;
  upsert?: boolean;
}

// API response types
export interface VideoCallJoinResponse {
  roomUrl: string;
  token: string;
  callStatus: 'starting' | 'active' | 'ended' | 'cancelled';
  participants: CallParticipant[];
}

export interface VideoCallEndResponse {
  message: string;
  callDuration?: number;
  systemMessage?: ChatMessage;
}

export interface LeaveVideoCallResponse {
  message: string;
  callStillActive: boolean;
  remainingParticipants: number;
}

// Helper types for queries with expanded data
export interface ChatRoomWithLastMessage extends ChatRoom {
  lastMessage?: ChatMessage;
}

export interface ChatMessageWithSender extends ChatMessage {
  senderName?: string;
  senderType?: 'client' | 'host';
}