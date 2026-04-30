import type { ValidatedContext } from '@/types/app';
import type { SendChatMessageBody, SendChatMessageParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError
} from '@/core/errors';
import { ChatRoomRepository } from './repos/chatRoom.repo';
import { ChatMessageRepository } from './repos/chatMessage.repo';
import type { 
  SendTextMessageRequest, 
  StartVideoCallRequest,
  VideoCallData,
  CallParticipant
} from './repos/comms.schema';

/**
 * sendChatMessage
 * 
 * Path: POST /comms/chat-rooms/{room}/messages
 * OperationId: sendChatMessage
 * 
 * Send message (text or start video call) in chat room
 */
export async function sendChatMessage(
  ctx: ValidatedContext<SendChatMessageBody, never, SendChatMessageParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { room: string };
  
  // Extract validated request body
  const body = ctx.req.valid('json') as SendTextMessageRequest | StartVideoCallRequest;
  
  if (!params.room) {
    throw new ValidationError('Room ID is required');
  }
  
  if (!body.messageType) {
    throw new ValidationError('Message type is required');
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

  // Check if user is a participant (using Person ID)
  const isParticipant = room.participants.includes(user.id);

  if (!isParticipant) {
    throw new ForbiddenError('Access denied: not a participant in this chat room');
  }
  
  let message;
  
  if (body.messageType === 'text') {
    // Handle text message
    const textBody = body as SendTextMessageRequest;
    
    if (!textBody.message || !textBody.message.trim()) {
      throw new ValidationError('Message content is required');
    }
    
    message = await messageRepo.createTextMessage(
      params.room,
      user.id,
      textBody.message
    );
    
    logger?.info({
      messageId: message.id,
      userId: user.id,
      roomId: params.room,
      messageType: 'text',
      action: 'send_text_message'
    }, 'Text message sent');
    
  } else if (body.messageType === 'video_call') {
    // Handle video call start
    const videoBody = body as StartVideoCallRequest;
    
    // Check if room already has an active video call
    const activeCall = await messageRepo.findActiveVideoCall(params.room);
    if (activeCall) {
      throw new ConflictError('An active video call already exists in this room');
    }
    
    // Check admin permissions for starting video calls - check if user is admin
    const isAdmin = room.admins.includes(user.id);

    if (!isAdmin) {
      throw new ForbiddenError('Only room admin can start video calls');
    }
    
    // Validate video call data
    if (!videoBody.videoCallData || !videoBody.videoCallData.participants) {
      throw new ValidationError('Video call data with participants is required');
    }
    
    // Ensure the initiator is included in participants
    // User type is determined by room context (participant role)
    const initiatorParticipant: CallParticipant = {
      user: user.id,
      userType: 'host', // Monobase uses person-centric model
      displayName: user.name || 'User',
      audioEnabled: true,
      videoEnabled: true
    };
    
    // Make sure initiator is in participants list
    let participants = videoBody.videoCallData.participants;
    const initiatorExists = participants.some(p => p.user === user.id);
    if (!initiatorExists) {
      participants = [initiatorParticipant, ...participants];
    }
    
    // Create video call data structure
    const videoCallData: VideoCallData = {
      status: 'starting',
      participants: participants,
      startedAt: new Date().toISOString()
    };
    
    message = await messageRepo.createVideoCallMessage(
      params.room,
      user.id,
      videoCallData
    );
    
    // Update room's active video call reference
    await roomRepo.setActiveVideoCall(params.room, message.id);

    // Send notifications to other participants
    const notifs = ctx.get('notifs');
    const otherParticipants = room.participants.filter(p => p !== user.id);

    let notificationsSent = 0;
    for (const participantId of otherParticipants) {
      try {
        await notifs.createNotification({
          recipient: participantId,
          type: 'comms.video-call-started',
          channel: 'in-app',
          title: 'Video Call Started',
          message: `${user.name || 'Someone'} started a video call`,
          relatedEntityType: 'chat-room',
          relatedEntity: params.room,
          consentValidated: true // Room participation implies consent
        });
        notificationsSent++;
      } catch (error) {
        // Log notification error but don't fail the video call creation
        logger?.warn({
          participantId,
          error: error instanceof Error ? error.message : 'Unknown error',
          action: 'send_video_call_notification'
        }, 'Failed to send video call notification to participant');
      }
    }

    logger?.info({
      messageId: message.id,
      userId: user.id,
      roomId: params.room,
      messageType: 'video_call',
      participantCount: participants.length,
      notificationsCount: notificationsSent,
      action: 'start_video_call'
    }, 'Video call started');
    
  } else {
    throw new ValidationError('Invalid message type. Must be "text" or "video_call"');
  }
  
  // Update room's last message timestamp and count
  await roomRepo.updateLastMessage(params.room, message.timestamp);
  
  return ctx.json(message, 201);
}