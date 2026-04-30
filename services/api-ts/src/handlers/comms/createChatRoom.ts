import type { ValidatedContext } from '@/types/app';
import type { CreateChatRoomBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ValidationError,
  ForbiddenError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { type CreateChatRoomRequest } from './repos/comms.schema';

/**
 * createChatRoom
 *
 * Path: POST /comms/chat-rooms
 * OperationId: createChatRoom
 *
 * Create a new chat room between participants (with upsert logic)
 */
export async function createChatRoom(
  ctx: ValidatedContext<CreateChatRoomBody, never, never>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }

  // Extract validated request body
  const body = ctx.req.valid('json') as CreateChatRoomRequest;

  // Validate required fields
  if (!body.participants || body.participants.length === 0) {
    throw new ValidationError('At least one participant is required');
  }

  if (body.participants.length < 2) {
    throw new ValidationError('At least two participants are required for a chat room');
  }

  // Default admins to all participants if not specified
  const admins = body.admins && body.admins.length > 0 ? body.admins : body.participants;

  // Business rule: prevent duplicate participants
  const uniqueParticipants = [...new Set(body.participants)];
  if (uniqueParticipants.length !== body.participants.length) {
    throw new BusinessLogicError(
      'Duplicate participants not allowed',
      'DUPLICATE_PARTICIPANTS'
    );
  }

  // Get dependencies from context for authorization check
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Business rule: user must be one of the participants or admins (using Person ID)
  // Check if the authenticated user's Person ID is in the participants or admins list
  const allInvolvedIds = [...body.participants, ...admins];
  const isInvolved = allInvolvedIds.includes(user.id);

  if (!isInvolved) {
    throw new ForbiddenError('You can only create chat rooms you are involved in');
  }

  // Instantiate repository
  const repo = new ChatRoomRepository(db, logger);

  // Upsert logic: check if room already exists with these participants
  let room = await repo.findRoomWithParticipants(body.participants);
  let created = false;

  if (room && !body.upsert) {
    // Room exists and upsert is false - return conflict
    throw new ConflictError(
      'Chat room with these participants already exists'
    );
  }

  if (room && body.upsert) {
    // Room exists and upsert is true - update with new settings if needed
    const updates: any = {};

    // Update admins if different
    const currentAdmins = new Set(room.admins);
    const newAdmins = new Set(admins);
    const adminsChanged = currentAdmins.size !== newAdmins.size ||
                         [...currentAdmins].some(admin => !newAdmins.has(admin));

    if (adminsChanged) {
      updates.admins = admins;
    }

    // Link to context if provided and not already linked
    if (body.context && room.context !== body.context) {
      updates.context = body.context;
    }

    // Reactivate if archived
    if (room.status === 'archived') {
      updates.status = 'active';
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      room = await repo.updateOneById(room.id, updates);

      logger?.info({
        userId: user.id,
        roomId: room.id,
        updates,
        action: 'update_existing_chat_room'
      }, 'Existing chat room updated');
    }
  } else {
    // Create new room
    room = await repo.createOne({
      participants: body.participants,
      admins: admins,
      context: body.context,
      status: 'active',
      messageCount: 0,
      createdBy: user.id
    });

    created = true;

    logger?.info({
      userId: user.id,
      roomId: room.id,
      participants: body.participants,
      admins: admins,
      context: body.context,
      action: 'create_chat_room'
    }, 'New chat room created');
  }

  // Return appropriate status code
  const statusCode = created ? 201 : 200;

  return ctx.json({
    ...room,
    created // Include flag to indicate if room was newly created
  }, statusCode);
}