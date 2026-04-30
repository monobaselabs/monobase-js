import type { ValidatedContext } from '@/types/app';
import type { UpdateVideoCallParticipantBody, UpdateVideoCallParticipantParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';
import type { UpdateParticipantRequest, CallParticipant } from './repos/comms.schema';

/**
 * updateVideoCallParticipant
 * 
 * Path: PATCH /comms/chat-rooms/{room}/video-call/participant
 * OperationId: updateVideoCallParticipant
 * 
 * Update participant status in video call (audio/video enabled)
 */
export async function updateVideoCallParticipant(
  ctx: ValidatedContext<UpdateVideoCallParticipantBody, never, UpdateVideoCallParticipantParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { room: string };
  
  // Extract validated request body
  const body = ctx.req.valid('json') as UpdateParticipantRequest;
  
  if (!params.room) {
    throw new ValidationError('Room ID is required');
  }
  
  // Validate that at least one field is being updated
  if (body.audioEnabled === undefined && body.videoEnabled === undefined) {
    throw new ValidationError('At least one field (audioEnabled or videoEnabled) must be provided');
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
  
  // Find active video call
  const activeCall = await messageRepo.findActiveVideoCall(params.room);
  if (!activeCall) {
    throw new NotFoundError('No active video call found in this room', {
      resourceType: 'video-call',
      resource: params.room,
      suggestions: ['Check if video call is active', 'Start a new video call', 'Verify room has video call']
    });
  }
  
  if (!activeCall.videoCallData) {
    throw new ValidationError('Invalid video call data');
  }
  
  // Check if user is currently in the call
  const participant = activeCall.videoCallData.participants.find(
    p => p.user === user.id
  );
  
  if (!participant) {
    throw new NotFoundError('User is not a participant in this video call', {
      resourceType: 'video-call',
      resource: user.id,
      suggestions: ['Join the video call first', 'Check if user was invited', 'Verify call participation']
    });
  }
  
  if (participant.leftAt) {
    throw new NotFoundError('User has already left the video call', {
      resourceType: 'video-call',
      resource: user.id,
      suggestions: ['User already left', 'Join the video call again', 'Check participation status']
    });
  }
  
  if (!participant.joinedAt) {
    throw new ValidationError('User has not joined the video call yet');
  }
  
  // Update participant status
  const updates: Partial<CallParticipant> = {};

  if (body.audioEnabled !== undefined) {
    updates.audioEnabled = body.audioEnabled;
  }

  if (body.videoEnabled !== undefined) {
    updates.videoEnabled = body.videoEnabled;
  }
  
  const updatedMessage = await messageRepo.updateVideoCallParticipant(
    activeCall.id,
    user.id,
    updates
  );
  
  // Find the updated participant
  const updatedParticipant = updatedMessage.videoCallData?.participants.find(
    p => p.user === user.id
  );
  
  if (!updatedParticipant) {
    throw new ValidationError('Failed to update participant');
  }
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    callMessageId: activeCall.id,
    updates,
    action: 'update_video_call_participant'
  }, 'Video call participant status updated');
  
  // Create optional system message for significant changes (like muting/unmuting)
  const statusChanges = [];
  if (body.audioEnabled !== undefined) {
    statusChanges.push(`${body.audioEnabled ? 'unmuted' : 'muted'} audio`);
  }
  if (body.videoEnabled !== undefined) {
    statusChanges.push(`${body.videoEnabled ? 'enabled' : 'disabled'} video`);
  }
  
  if (statusChanges.length > 0) {
    await messageRepo.createSystemMessage(
      params.room,
      `${participant.displayName} ${statusChanges.join(' and ')}`,
      user.id
    );
  }
  
  return ctx.json(updatedParticipant, 200);
}