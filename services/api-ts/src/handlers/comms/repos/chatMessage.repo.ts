/**
 * ChatMessageRepository - Data access layer for chat messages
 * Handles immutable messages with video call data support
 */

import { eq, and, gte, lte, desc, asc, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import {
  chatMessages,
  type ChatMessage,
  type NewChatMessage,
  type ChatMessageFilters,
  type VideoCallData,
  type CallParticipant,
  type SendTextMessageRequest,
  type StartVideoCallRequest
} from './comms.schema';
import { differenceInMinutes, max } from 'date-fns';

export class ChatMessageRepository extends DatabaseRepository<ChatMessage, NewChatMessage, ChatMessageFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, chatMessages, logger);
  }

  /**
   * Build where conditions for chat message filtering
   */
  protected buildWhereConditions(filters?: ChatMessageFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.chatRoom) {
      conditions.push(eq(chatMessages.chatRoom, filters.chatRoom));
    }
    
    if (filters.sender) {
      conditions.push(eq(chatMessages.sender, filters.sender));
    }
    
    if (filters.messageType) {
      conditions.push(eq(chatMessages.messageType, filters.messageType));
    }
    
    if (filters.timestampFrom) {
      conditions.push(gte(chatMessages.timestamp, new Date(filters.timestampFrom)));
    }
    
    if (filters.timestampTo) {
      conditions.push(lte(chatMessages.timestamp, new Date(filters.timestampTo)));
    }
    
    return conditions.length > 0 ? and(...conditions as any) : undefined;
  }

  /**
   * Create a text message
   */
  async createTextMessage(
    chatRoomId: string,
    senderId: string,
    messageContent: string
  ): Promise<ChatMessage> {
    this.logger?.debug({ chatRoomId, senderId }, 'Creating text message');
    
    // Validate message length
    if (messageContent.length > 5000) {
      throw new Error('Message content exceeds maximum length of 5000 characters');
    }
    
    if (!messageContent.trim()) {
      throw new Error('Message content cannot be empty');
    }
    
    const message = await this.createOne({
      chatRoom: chatRoomId,
      sender: senderId,
      messageType: 'text',
      message: messageContent.trim(),
      timestamp: new Date()
    });
    
    this.logger?.info({ 
      messageId: message.id,
      chatRoomId,
      senderId 
    }, 'Text message created');
    
    return message;
  }

  /**
   * Create a video call message (start video call)
   */
  async createVideoCallMessage(
    chatRoomId: string,
    senderId: string,
    videoCallData: VideoCallData
  ): Promise<ChatMessage> {
    this.logger?.debug({ chatRoomId, senderId }, 'Creating video call message');
    
    // Validate video call data
    if (!videoCallData.participants || videoCallData.participants.length === 0) {
      throw new Error('Video call must have at least one participant');
    }
    
    // Ensure status is 'starting' for new calls
    const callData: VideoCallData = {
      ...videoCallData,
      status: 'starting',
      startedAt: new Date().toISOString()
    };
    
    const message = await this.createOne({
      chatRoom: chatRoomId,
      sender: senderId,
      messageType: 'video_call',
      videoCallData: callData,
      timestamp: new Date()
    });
    
    this.logger?.info({ 
      messageId: message.id,
      chatRoomId,
      senderId,
      participantCount: callData.participants.length 
    }, 'Video call message created');
    
    return message;
  }

  /**
   * Create a system message (for call ended, user joined, etc.)
   */
  async createSystemMessage(
    chatRoomId: string,
    systemMessage: string,
    triggeredByUserId: string
  ): Promise<ChatMessage> {
    this.logger?.debug({ chatRoomId, systemMessage, triggeredByUserId }, 'Creating system message');

    const message = await this.createOne({
      chatRoom: chatRoomId,
      sender: triggeredByUserId, // User who triggered the system action
      messageType: 'system',
      message: systemMessage,
      timestamp: new Date()
    });
    
    this.logger?.info({ 
      messageId: message.id,
      chatRoomId 
    }, 'System message created');
    
    return message;
  }

  /**
   * Update video call status and data
   * Used for join, leave, end actions
   */
  async updateVideoCallData(
    messageId: string,
    updates: Partial<VideoCallData>
  ): Promise<ChatMessage> {
    this.logger?.debug({ messageId, updates }, 'Updating video call data');
    
    const message = await this.findOneById(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    
    if (message.messageType !== 'video_call') {
      throw new Error(`Message ${messageId} is not a video call message`);
    }
    
    if (!message.videoCallData) {
      throw new Error(`Message ${messageId} has no video call data to update`);
    }
    
    // Merge updates with existing data
    const updatedVideoCallData: VideoCallData = {
      ...message.videoCallData,
      ...updates
    };
    
    // Calculate duration if call is ending
    if (updates.status === 'ended' && message.videoCallData.startedAt && !updates.endedAt) {
      const startTime = new Date(message.videoCallData.startedAt);
      const endTime = new Date();
      updatedVideoCallData.endedAt = endTime.toISOString();
      updatedVideoCallData.durationMinutes = differenceInMinutes(endTime, startTime);
    }
    
    const updatedMessage = await this.updateOneById(messageId, {
      videoCallData: updatedVideoCallData
    });
    
    this.logger?.info({ 
      messageId,
      status: updatedVideoCallData.status,
      participantCount: updatedVideoCallData.participants.length 
    }, 'Video call data updated');
    
    return updatedMessage;
  }

  /**
   * Add participant to video call
   */
  async addVideoCallParticipant(
    messageId: string,
    participant: CallParticipant
  ): Promise<ChatMessage> {
    this.logger?.debug({ messageId, participantUserId: participant.user }, 'Adding video call participant');
    
    const message = await this.findOneById(messageId);
    if (!message || message.messageType !== 'video_call' || !message.videoCallData) {
      throw new Error(`Invalid video call message ${messageId}`);
    }
    
    // Check if participant already exists
    const existingParticipantIndex = message.videoCallData.participants.findIndex(
      p => p.user === participant.user
    );
    
    let updatedParticipants: CallParticipant[];
    
    if (existingParticipantIndex >= 0) {
      // Update existing participant
      updatedParticipants = [...message.videoCallData.participants];
      updatedParticipants[existingParticipantIndex] = {
        ...updatedParticipants[existingParticipantIndex],
        ...participant,
        joinedAt: participant.joinedAt || new Date().toISOString()
      };
    } else {
      // Add new participant
      updatedParticipants = [
        ...message.videoCallData.participants,
        {
          ...participant,
          joinedAt: participant.joinedAt || new Date().toISOString()
        }
      ];
    }
    
    return await this.updateVideoCallData(messageId, {
      participants: updatedParticipants
    });
  }

  /**
   * Update participant status in video call
   */
  async updateVideoCallParticipant(
    messageId: string,
    userId: string,
    updates: Partial<CallParticipant>
  ): Promise<ChatMessage> {
    this.logger?.debug({ messageId, userId, updates }, 'Updating video call participant');
    
    const message = await this.findOneById(messageId);
    if (!message || message.messageType !== 'video_call' || !message.videoCallData) {
      throw new Error(`Invalid video call message ${messageId}`);
    }
    
    const participantIndex = message.videoCallData.participants.findIndex(
      p => p.user === userId
    );
    
    if (participantIndex === -1) {
      throw new Error(`Participant ${userId} not found in video call ${messageId}`);
    }
    
    const updatedParticipants = [...message.videoCallData.participants];
    updatedParticipants[participantIndex] = {
      ...updatedParticipants[participantIndex],
      ...updates
    } as any;
    
    return await this.updateVideoCallData(messageId, {
      participants: updatedParticipants
    });
  }

  /**
   * Remove participant from video call (mark as left)
   */
  async removeVideoCallParticipant(
    messageId: string,
    userId: string
  ): Promise<ChatMessage> {
    this.logger?.debug({ messageId, userId }, 'Removing video call participant');
    
    return await this.updateVideoCallParticipant(messageId, userId, {
      leftAt: new Date().toISOString()
    });
  }

  /**
   * Get messages for a chat room with pagination
   */
  async getChatRoomMessages(
    chatRoomId: string,
    options?: {
      messageType?: 'text' | 'system' | 'video_call';
      limit?: number;
      offset?: number;
      orderBy?: 'asc' | 'desc';
    }
  ): Promise<ChatMessage[]> {
    this.logger?.debug({ chatRoomId, options }, 'Getting chat room messages');
    
    const filters: ChatMessageFilters = {
      chatRoom: chatRoomId,
      messageType: options?.messageType
    };
    
    const messages = await this.findMany(filters, {
      orderBy: options?.orderBy === 'asc' ? asc(chatMessages.timestamp) : desc(chatMessages.timestamp),
      pagination: options?.limit || options?.offset ? {
        limit: options?.limit || 50,
        offset: options?.offset || 0
      } : undefined
    });
    
    this.logger?.debug({ 
      chatRoomId, 
      messageCount: messages.length,
      messageType: options?.messageType 
    }, 'Chat room messages retrieved');
    
    return messages;
  }

  /**
   * Find active video call message in a chat room
   */
  async findActiveVideoCall(chatRoomId: string): Promise<ChatMessage | null> {
    this.logger?.debug({ chatRoomId }, 'Finding active video call');
    
    const messages = await this.findMany({
      chatRoom: chatRoomId,
      messageType: 'video_call'
    }, {
      orderBy: desc(chatMessages.timestamp)
    });
    
    // Find the most recent video call that's still active or starting
    const activeCall = messages.find(msg => 
      msg.videoCallData && 
      (msg.videoCallData.status === 'active' || msg.videoCallData.status === 'starting')
    );
    
    this.logger?.debug({ 
      chatRoomId, 
      found: !!activeCall,
      activeCallId: activeCall?.id 
    }, 'Active video call search completed');
    
    return activeCall || null;
  }

  /**
   * Validate message content length
   */
  validateMessageContent(content: string): { isValid: boolean; error?: string } {
    if (!content || !content.trim()) {
      return { isValid: false, error: 'Message content cannot be empty' };
    }
    
    if (content.length > 5000) {
      return { isValid: false, error: 'Message content exceeds maximum length of 5000 characters' };
    }
    
    return { isValid: true };
  }

  /**
   * Get message statistics for a chat room
   */
  async getChatRoomStats(chatRoomId: string): Promise<{
    totalMessages: number;
    textMessages: number;
    systemMessages: number;
    videoCallMessages: number;
    lastMessageAt?: Date;
  }> {
    this.logger?.debug({ chatRoomId }, 'Getting chat room message statistics');
    
    const messages = await this.findMany({ chatRoom: chatRoomId });
    
    const stats = {
      totalMessages: messages.length,
      textMessages: messages.filter(m => m.messageType === 'text').length,
      systemMessages: messages.filter(m => m.messageType === 'system').length,
      videoCallMessages: messages.filter(m => m.messageType === 'video_call').length,
      lastMessageAt: messages.length > 0 ?
        max(messages.map(m => new Date(m.timestamp))) :
        undefined
    };
    
    this.logger?.debug({ chatRoomId, stats }, 'Chat room statistics calculated');
    
    return stats;
  }
}