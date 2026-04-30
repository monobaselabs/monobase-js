import type { ValidatedContext } from '@/types/app';
import type { LeaveVideoCallParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';
import type { LeaveVideoCallResponse } from './repos/comms.schema';

/**
 * leaveVideoCall
 * 
 * Path: POST /comms/chat-rooms/{room}/video-call/leave
 * OperationId: leaveVideoCall
 * 
 * Leave active video call
 */
export async function leaveVideoCall(
  ctx: ValidatedContext<never, never, LeaveVideoCallParams>
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
  
  // Mark participant as left
  const updatedMessage = await messageRepo.removeVideoCallParticipant(
    activeCall.id,
    user.id
  );
  
  // Count remaining active participants
  const remainingParticipants = updatedMessage.videoCallData?.participants.filter(
    p => p.joinedAt && !p.leftAt
  ) || [];

  const callStillActive = remainingParticipants.length > 0;

  // Send notifications to remaining participants
  const notifs = ctx.get('notifs');
  const remainingParticipantIds = remainingParticipants.map(p => p.user);

  let notificationsSent = 0;
  for (const participantId of remainingParticipantIds) {
    try {
      await notifs.createNotification({
        recipient: participantId,
        type: 'comms.video-call-left',
        channel: 'in-app',
        title: 'User Left Call',
        message: `${participant.displayName} left the video call`,
        relatedEntityType: 'chat-room',
        relatedEntity: params.room,
        consentValidated: true
      });
      notificationsSent++;
    } catch (error) {
      // Log notification error but don't fail the leave operation
      logger?.warn({
        participantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'send_leave_notification'
      }, 'Failed to send leave notification to participant');
    }
  }

  // Create system message for user leaving
  await messageRepo.createSystemMessage(
    params.room,
    `${participant.displayName} left the video call`,
    user.id
  );
  
  // If no participants remain, end the call automatically
  if (!callStillActive) {
    await messageRepo.updateVideoCallData(activeCall.id, {
      status: 'ended',
      endedAt: new Date().toISOString()
    });
    
    // Clear room's active video call reference
    await roomRepo.setActiveVideoCall(params.room, null);
    
    // Create system message for call ended
    await messageRepo.createSystemMessage(
      params.room,
      'Video call ended (no participants remaining)',
      user.id
    );
    
    logger?.info({
      userId: user.id,
      roomId: params.room,
      callMessageId: activeCall.id,
      action: 'auto_end_video_call'
    }, 'Video call ended automatically (no participants remaining)');
  }
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    callMessageId: activeCall.id,
    displayName: participant.displayName,
    remainingParticipants: remainingParticipants.length,
    notificationsCount: notificationsSent,
    callStillActive,
    action: 'leave_video_call'
  }, 'User left video call');
  
  const response: LeaveVideoCallResponse = {
    message: 'Successfully left the video call',
    callStillActive,
    remainingParticipants: remainingParticipants.length
  };
  
  return ctx.json(response, 200);
}