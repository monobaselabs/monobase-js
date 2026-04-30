import type { ValidatedContext } from '@/types/app';
import type { EndVideoCallParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';
import type { VideoCallEndResponse } from './repos/comms.schema';
import { differenceInMinutes } from 'date-fns';

/**
 * endVideoCall
 * 
 * Path: POST /comms/chat-rooms/{room}/video-call/end
 * OperationId: endVideoCall
 * 
 * End active video call (admin only)
 */
export async function endVideoCall(
  ctx: ValidatedContext<never, never, EndVideoCallParams>
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

  // Check if user has permission to end calls (must be an admin)
  const isAdmin = room.admins.includes(user.id);

  if (!isAdmin) {
    throw new ForbiddenError('Only room admin can end video calls');
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
  
  // Calculate call duration
  const startTime = activeCall.videoCallData.startedAt ?
    new Date(activeCall.videoCallData.startedAt) :
    new Date(activeCall.timestamp);
  const endTime = new Date();
  const durationMinutes = differenceInMinutes(endTime, startTime);
  
  // End the video call
  const endedMessage = await messageRepo.updateVideoCallData(activeCall.id, {
    status: 'ended',
    endedAt: endTime.toISOString(),
    durationMinutes
  });

  // Clear the room's active video call reference
  await roomRepo.setActiveVideoCall(params.room, null);

  // Send notifications to all participants who were in the call
  const notifs = ctx.get('notifs');
  const participantsInCall = activeCall.videoCallData.participants
    .filter(p => p.joinedAt && !p.leftAt && p.user !== user.id)
    .map(p => p.user);

  let notificationsSent = 0;
  for (const participantId of participantsInCall) {
    try {
      await notifs.createNotification({
        recipient: participantId,
        type: 'comms.video-call-ended',
        channel: 'in-app',
        title: 'Video Call Ended',
        message: `Video call ended by ${user.name || 'admin'} (${durationMinutes} minutes)`,
        relatedEntityType: 'chat-room',
        relatedEntity: params.room,
        consentValidated: true
      });
      notificationsSent++;
    } catch (error) {
      // Log notification error but don't fail the end operation
      logger?.warn({
        participantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'send_end_notification'
      }, 'Failed to send end notification to participant');
    }
  }

  // Create system message for call ended
  const systemMessage = await messageRepo.createSystemMessage(
    params.room,
    `Video call ended by ${user.name || 'admin'} (${durationMinutes} minutes)`,
    user.id
  );
  
  // Update room's last message timestamp
  await roomRepo.updateLastMessage(params.room, systemMessage.timestamp);
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    callMessageId: activeCall.id,
    durationMinutes,
    notificationsCount: notificationsSent,
    action: 'end_video_call'
  }, 'Video call ended by admin');
  
  const response: VideoCallEndResponse = {
    message: 'Video call ended successfully',
    callDuration: durationMinutes,
    systemMessage
  };
  
  return ctx.json(response, 200);
}