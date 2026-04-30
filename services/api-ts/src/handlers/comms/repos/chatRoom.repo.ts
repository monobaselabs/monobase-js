/**
 * ChatRoomRepository - Data access layer for chat rooms
 * Handles participant-based filtering and room management
 */

import { eq, and, or, ne, desc, sql, isNull, isNotNull, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import { 
  chatRooms,
  chatMessages,
  type ChatRoom, 
  type NewChatRoom,
  type ChatRoomFilters,
  type ChatRoomWithLastMessage
} from './comms.schema';

export class ChatRoomRepository extends DatabaseRepository<ChatRoom, NewChatRoom, ChatRoomFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, chatRooms, logger);
  }

  /**
   * Build where conditions for chat room filtering
   */
  protected buildWhereConditions(filters?: ChatRoomFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    // Array-based participant filtering using JSON operators
    if (filters.participants && filters.participants.length > 0) {
      const participantConditions = filters.participants.map(participantId =>
        sql`${chatRooms.participants} @> ${JSON.stringify([participantId])}`
      );
      conditions.push(or(...participantConditions));
    }

    if (filters.admins && filters.admins.length > 0) {
      const adminConditions = filters.admins.map(adminId =>
        sql`${chatRooms.admins} @> ${JSON.stringify([adminId])}`
      );
      conditions.push(or(...adminConditions));
    }

    if (filters.status) {
      conditions.push(eq(chatRooms.status, filters.status));
    }

    if (filters.context) {
      conditions.push(eq(chatRooms.context, filters.context));
    }

    // Special filter: find rooms where user is a participant
    if (filters.withParticipant) {
      conditions.push(
        sql`${chatRooms.participants} @> ${JSON.stringify([filters.withParticipant])}`
      );
    }

    // Special filter: rooms with active video calls
    if (filters.hasActiveCall !== undefined) {
      if (filters.hasActiveCall) {
        conditions.push(isNotNull(chatRooms.activeVideoCallMessage));
      } else {
        conditions.push(isNull(chatRooms.activeVideoCallMessage));
      }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find chat rooms for a specific user (as either participant)
   */
  async findUserChatRooms(
    userId: string,
    options?: {
      status?: 'active' | 'archived';
      hasActiveCall?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<ChatRoom[]> {
    this.logger?.debug({ userId, options }, 'Finding chat rooms for user');

    const filters: ChatRoomFilters = {
      withParticipant: userId,
      status: options?.status,
      hasActiveCall: options?.hasActiveCall
    };

    const chatRoomList = await this.findMany(filters, {
      orderBy: desc(chatRooms.lastMessageAt),
      pagination: options?.limit || options?.offset ? {
        limit: options?.limit || 50,
        offset: options?.offset || 0
      } : undefined
    });

    this.logger?.debug({
      userId,
      roomCount: chatRoomList.length
    }, 'User chat rooms retrieved');

    return chatRoomList;
  }

  /**
   * Find chat room containing all specified participants
   */
  async findRoomWithParticipants(
    participantIds: string[]
  ): Promise<ChatRoom | null> {
    this.logger?.debug({ participantIds }, 'Finding room with participants');

    if (participantIds.length === 0) return null;

    // Use custom SQL to find rooms containing all participants
    const [room] = await this.db
      .select()
      .from(chatRooms)
      .where(
        // Room must contain all specified participants
        sql`${chatRooms.participants} @> ${JSON.stringify(participantIds)}`
      )
      .limit(1);

    this.logger?.debug({
      participantIds,
      found: !!room
    }, 'Room lookup with participants completed');

    return room || null;
  }

  /**
   * Find chat room between exactly two participants (for backward compatibility)
   */
  async findRoomBetweenParticipants(
    participant1Id: string,
    participant2Id: string
  ): Promise<ChatRoom | null> {
    return this.findRoomWithParticipants([participant1Id, participant2Id]);
  }

  /**
   * Find or create chat room for booking context
   * Updated to use flexible participant/admin arrays
   */
  async findOrCreateBookingChatRoom(
    bookingId: string,
    participantIds: string[],
    adminIds?: string[]
  ): Promise<{ room: ChatRoom; created: boolean }> {
    this.logger?.debug({
      bookingId,
      participantIds,
      adminIds
    }, 'Finding or creating booking chat room');

    // First check if room already exists for this booking
    let room = await this.findOne({ context: bookingId });

    if (room) {
      this.logger?.debug({ bookingId, roomId: room.id }, 'Found existing booking room');
      return { room, created: false };
    }

    // Check if room exists between these participants (without context link)
    room = await this.findRoomWithParticipants(participantIds);

    if (room) {
      // Link existing room to booking
      const updatedRoom = await this.updateOneById(room.id, {
        context: bookingId
      });

      this.logger?.info({
        bookingId,
        roomId: room.id
      }, 'Linked existing room to booking');

      return { room: updatedRoom, created: false };
    }

    // Create new room for booking
    const newRoom = await this.createOne({
      participants: participantIds,
      admins: adminIds || participantIds, // Default: all participants are admins
      context: bookingId,
      status: 'active',
      messageCount: 0
    });

    this.logger?.info({
      bookingId,
      roomId: newRoom.id,
      participantIds
    }, 'Created new booking chat room');

    return { room: newRoom, created: true };
  }

  /**
   * Update last message timestamp and increment message count
   * Called when new messages are added
   */
  async updateLastMessage(
    roomId: string,
    messageTimestamp: Date = new Date()
  ): Promise<ChatRoom> {
    this.logger?.debug({ roomId, messageTimestamp }, 'Updating room last message');
    
    // Get current message count and increment
    const currentRoom = await this.findOneById(roomId);
    if (!currentRoom) {
      throw new Error(`Chat room ${roomId} not found`);
    }
    
    const updatedRoom = await this.updateOneById(roomId, {
      lastMessageAt: messageTimestamp,
      messageCount: currentRoom.messageCount + 1
    });
    
    this.logger?.debug({ 
      roomId, 
      messageCount: updatedRoom.messageCount 
    }, 'Room last message updated');
    
    return updatedRoom;
  }

  /**
   * Set or clear active video call message reference
   */
  async setActiveVideoCall(
    roomId: string,
    videoCallMessageId: string | null
  ): Promise<ChatRoom> {
    this.logger?.debug({ roomId, videoCallMessageId }, 'Setting active video call');
    
    const updatedRoom = await this.updateOneById(roomId, {
      activeVideoCallMessage: videoCallMessageId
    });
    
    this.logger?.info({ 
      roomId, 
      videoCallMessageId,
      action: videoCallMessageId ? 'set' : 'cleared'
    }, 'Active video call updated');
    
    return updatedRoom;
  }

  /**
   * Check if user/profile is a participant in the room
   */
  async isUserParticipant(roomId: string, userOrProfileId: string): Promise<boolean> {
    this.logger?.debug({ roomId, userOrProfileId }, 'Checking if user is participant');

    const room = await this.findOneById(roomId);
    if (!room) {
      return false;
    }

    const isParticipant = room.participants.includes(userOrProfileId);

    this.logger?.debug({ roomId, userOrProfileId, isParticipant }, 'Participant check completed');

    return isParticipant;
  }

  /**
   * Check if user/profile is an admin of the room
   */
  async isUserAdmin(roomId: string, userOrProfileId: string): Promise<boolean> {
    this.logger?.debug({ roomId, userOrProfileId }, 'Checking if user is admin');

    const room = await this.findOneById(roomId);
    if (!room) {
      return false;
    }

    const isAdmin = room.admins.includes(userOrProfileId);

    this.logger?.debug({ roomId, userOrProfileId, isAdmin }, 'Admin check completed');

    return isAdmin;
  }

  /**
   * Archive a chat room (soft delete alternative)
   */
  async archiveRoom(roomId: string): Promise<ChatRoom> {
    this.logger?.debug({ roomId }, 'Archiving chat room');
    
    const archivedRoom = await this.updateOneById(roomId, {
      status: 'archived'
    });
    
    this.logger?.info({ roomId }, 'Chat room archived');
    
    return archivedRoom;
  }
}