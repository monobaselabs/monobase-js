import type { ValidatedContext } from '@/types/app';
import type { ListChatRoomsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import type { ChatRoomFilters } from './repos/comms.schema';

/**
 * listChatRooms
 * 
 * Path: GET /comms/chat-rooms
 * OperationId: listChatRooms
 * 
 * Lists user's chat rooms with optional filtering
 */
export async function listChatRooms(
  ctx: ValidatedContext<never, ListChatRoomsQuery, never>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated query parameters
  const query = ctx.req.valid('query') as {
    status?: 'active' | 'archived';
    context?: string;
    withParticipant?: string;
    hasActiveCall?: boolean;
    page?: number;
    pageSize?: number;
    offset?: number;
    limit?: number;
  };
  
  // Get dependencies from context for authorization check
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Authorization uses Person ID directly (no profile lookups needed)

  // Instantiate repository
  const repo = new ChatRoomRepository(db, logger);

  // Build pagination options
  const page = query.page || 1;
  const pageSize = query.pageSize || query.limit || 50;
  const offset = query.offset || (page - 1) * pageSize;

  // Build filters based on user's profiles
  const filters: ChatRoomFilters = {
    status: query.status,
    context: query.context,
    hasActiveCall: query.hasActiveCall
  };

  // If withParticipant is specified, need to find rooms with both current user's profiles
  // AND the specified participant
  if (query.withParticipant) {
    // This is more complex with arrays - we need to find rooms where:
    // 1. The user (using Person ID) is a participant
    // 2. The specified participant is also a participant
    // Get all user rooms and filter
    const userRooms = await repo.findUserChatRooms(user.id, {
      status: query.status,
      hasActiveCall: query.hasActiveCall,
      limit: pageSize,
      offset: offset
    });

    // Filter to only rooms that also contain the specified participant
    const filteredRooms = userRooms.filter(room =>
      room.participants.includes(query.withParticipant!)
    );

    // Return filtered results
    return ctx.json({
      data: filteredRooms,
      pagination: {
        page: page,
        pageSize: pageSize,
        totalCount: filteredRooms.length,
        totalPages: Math.ceil(filteredRooms.length / pageSize)
      }
    }, 200);
  }

  // Get user's chat rooms (rooms where user's Person ID is a participant)
  const allUserRooms = await repo.findUserChatRooms(user.id, {
    status: query.status,
    hasActiveCall: query.hasActiveCall
  });

  // Apply pagination
  const start = offset;
  const end = offset + pageSize;
  let finalRooms = allUserRooms.slice(start, end);

  // Apply context filter if specified
  if (query.context) {
    finalRooms = finalRooms.filter(room => room.context === query.context);
  }

  // Log audit trail
  logger?.info({
    userId: user.id,
    filters,
    resultCount: finalRooms.length,
    action: 'list_chat_rooms'
  }, 'Chat rooms listed successfully');

  // Return paginated response matching TypeSpec definition
  return ctx.json({
    data: finalRooms,
    pagination: {
      page: page,
      pageSize: pageSize,
      totalCount: allUserRooms.length, // Total before pagination
      totalPages: Math.ceil(allUserRooms.length / pageSize)
    }
  }, 200);
}