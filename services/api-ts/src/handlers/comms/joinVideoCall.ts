import type { ValidatedContext } from '@/types/app';
import type { JoinVideoCallBody, JoinVideoCallParams } from '@/generated/openapi/validators';
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
  JoinVideoCallRequest,
  VideoCallJoinResponse,
  CallParticipant
} from './repos/comms.schema';

/**
 * joinVideoCall
 * 
 * Path: POST /comms/chat-rooms/{room}/video-call/join
 * OperationId: joinVideoCall
 * 
 * Join active video call in chat room
 */
export async function joinVideoCall(
  ctx: ValidatedContext<JoinVideoCallBody, never, JoinVideoCallParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { room: string };
  
  // Extract validated request body
  const body = ctx.req.valid('json') as JoinVideoCallRequest;
  
  if (!params.room) {
    throw new ValidationError('Room ID is required');
  }
  
  if (!body.displayName || !body.displayName.trim()) {
    throw new ValidationError('Display name is required');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const config = ctx.get('config');

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
  
  // Check if user is already in the call
  const existingParticipant = activeCall.videoCallData.participants.find(
    p => p.user === user.id
  );
  
  if (existingParticipant && existingParticipant.joinedAt && !existingParticipant.leftAt) {
    throw new ConflictError('User is already in the video call');
  }
  
  // Create participant data
  // User type is determined by room context (participant role)
  const userType = 'user'; // Simplified - actual type determined by room context

  const participant: CallParticipant = {
    user: user.id,
    userType: 'host', // Monobase uses person-centric model
    displayName: body.displayName.trim(),
    audioEnabled: body.audioEnabled ?? true,
    videoEnabled: body.videoEnabled ?? true,
    joinedAt: new Date().toISOString()
  };
  
  // Add participant to video call
  const updatedMessage = await messageRepo.addVideoCallParticipant(
    activeCall.id,
    participant
  );
  
  // Update call status to active if it was starting
  let finalMessage = updatedMessage;
  if (updatedMessage.videoCallData?.status === 'starting') {
    finalMessage = await messageRepo.updateVideoCallData(activeCall.id, {
      status: 'active',
      roomUrl: generateWebRTCRoomUrl(params.room, config.auth.baseUrl),
      token: generateWebRTCToken(user.id, activeCall.id)
    });
  }
  
  // Send notifications to other participants already in the call
  // Use finalMessage (updated data) instead of activeCall (stale data)
  const notifs = ctx.get('notifs');
  const activeParticipants = finalMessage.videoCallData!.participants
    .filter(p => p.user !== user.id && p.joinedAt && !p.leftAt)
    .map(p => p.user);

  let notificationsSent = 0;
  for (const participantId of activeParticipants) {
    try {
      await notifs.createNotification({
        recipient: participantId,
        type: 'comms.video-call-joined',
        channel: 'in-app',
        title: 'User Joined Call',
        message: `${body.displayName} joined the video call`,
        relatedEntityType: 'chat-room',
        relatedEntity: params.room,
        consentValidated: true
      });
      notificationsSent++;
    } catch (error) {
      // Log notification error but don't fail the join operation
      logger?.warn({
        participantId,
        error: error instanceof Error ? error.message : 'Unknown error',
        action: 'send_join_notification'
      }, 'Failed to send join notification to participant');
    }
  }

  // Log audit trail
  logger?.info({
    userId: user.id,
    roomId: params.room,
    callMessageId: activeCall.id,
    displayName: body.displayName,
    notificationsCount: notificationsSent,
    action: 'join_video_call'
  }, 'User joined video call');

  // Create system message for user joining
  await messageRepo.createSystemMessage(
    params.room,
    `${body.displayName} joined the video call`,
    user.id
  );
  
  // Return WebRTC connection info
  const response: VideoCallJoinResponse = {
    roomUrl: finalMessage.videoCallData?.roomUrl || generateWebRTCRoomUrl(params.room, config.auth.baseUrl),
    token: finalMessage.videoCallData?.token || generateWebRTCToken(user.id, activeCall.id),
    callStatus: finalMessage.videoCallData?.status || 'active',
    participants: finalMessage.videoCallData?.participants || []
  };
  
  return ctx.json(response, 200);
}

/**
 * Generate WebSocket signaling URL for WebRTC connection
 * Returns the actual WebSocket endpoint for peer-to-peer signaling
 */
function generateWebRTCRoomUrl(roomId: string, baseUrl: string): string {
  // Convert http:// to ws:// or https:// to wss://
  const wsProtocol = baseUrl.startsWith('https://') ? 'wss://' : 'ws://';
  const urlWithoutProtocol = baseUrl.replace(/^https?:\/\//, '');

  return `${wsProtocol}${urlWithoutProtocol}/comms/chat-rooms/${roomId}/video-call/signal`;
}

/**
 * Generate authentication token for WebRTC signaling
 *
 * NOTE: The WebSocket signaling server expects the client's session token
 * via the Authorization header. Clients should use their existing session token
 * when connecting to the WebSocket URL.
 *
 * TODO: Generate short-lived JWT specifically for WebRTC for better security
 */
function generateWebRTCToken(userId: string, callMessageId: string): string {
  // Return placeholder - client should use their session token
  // The WebSocket server validates via Authorization: Bearer <session-token>
  return 'USE_SESSION_TOKEN'; // Sentinel value
}