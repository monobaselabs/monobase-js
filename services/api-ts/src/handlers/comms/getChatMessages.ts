import type { ValidatedContext } from '@/types/app';
import type { GetChatMessagesQuery, GetChatMessagesParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';

/**
 * getChatMessages
 * 
 * Path: GET /comms/chat-rooms/{room}/messages
 * OperationId: getChatMessages
 * 
 * Get messages for a chat room with filtering and pagination
 */
export async function getChatMessages(
  ctx: ValidatedContext<never, GetChatMessagesQuery, GetChatMessagesParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { room: string };
  // Extract validated query parameters
  const query = ctx.req.valid('query') as {
    messageType?: 'text' | 'system' | 'video_call';
    page?: number;
    pageSize?: number;
    offset?: number;
    limit?: number;
  };
  
  if (!params.room) {
    throw new ValidationError('Room ID is required');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Authorization uses Person ID directly (no profile lookups needed)

  // Instantiate repositories
  const roomRepo = new ChatRoomRepository(db, logger);
  const messageRepo = new ChatMessageRepository(db, logger);

  // Security check: verify room exists and user is participant
  const room = await roomRepo.findOneById(params.room);
  if (!room) {
    throw new NotFoundError('Chat room not found', {
      resourceType: 'chat-room',
      resource: params.room,
      suggestions: ['Check chat room ID format', 'Verify chat room exists']
    });
  }

  // Check if user is a participant (via their profiles)
  const isParticipant = room.participants.includes(user.id);

  if (!isParticipant) {
    throw new ForbiddenError('Access denied: not a participant in this chat room');
  }
  
  // Build pagination options
  const page = query.page || 1;
  const pageSize = query.pageSize || query.limit || 50;
  const offset = query.offset || (page - 1) * pageSize;
  
  // Get messages with pagination and filtering
  const result = await messageRepo.findManyWithPagination({
    chatRoom: params.room,
    messageType: query.messageType
  }, {
    pagination: {
      limit: pageSize,
      offset: offset
    }
  });
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    messageType: query.messageType,
    resultCount: result.data.length,
    totalCount: result.totalCount,
    action: 'get_chat_messages'
  }, 'Chat messages retrieved successfully');
  
  // Return paginated response matching TypeSpec definition
  return ctx.json({
    data: result.data,
    pagination: {
      page: page,
      pageSize: pageSize,
      totalCount: result.totalCount,
      totalPages: Math.ceil(result.totalCount / pageSize)
    }
  }, 200);
}