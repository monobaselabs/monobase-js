import type { ValidatedContext } from '@/types/app';
import type { GetChatRoomParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';

/**
 * getChatRoom
 * 
 * Path: GET /comms/chat-rooms/{room}
 * OperationId: getChatRoom
 * 
 * Get specific chat room (only accessible to participants)
 */
export async function getChatRoom(
  ctx: ValidatedContext<never, never, GetChatRoomParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { room: string };
  
  if (!params.room) {
    throw new ValidationError('Room ID is required');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Authorization uses Person ID directly (no profile lookups needed)

  // Instantiate repository
  const repo = new ChatRoomRepository(db, logger);

  // Find the chat room
  const room = await repo.findOneById(params.room);

  if (!room) {
    throw new NotFoundError('Chat room not found', {
      resourceType: 'chat-room',
      resource: params.room,
      suggestions: ['Check chat room ID format', 'Verify chat room exists']
    });
  }

  // Security check: user must be a participant in the room (using Person ID)
  const isParticipant = room.participants.includes(user.id);

  if (!isParticipant) {
    throw new ForbiddenError('Access denied: not a participant in this chat room');
  }
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    action: 'get_chat_room'
  }, 'Chat room accessed successfully');
  
  return ctx.json(room, 200);
}