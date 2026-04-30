/**
 * E2E Test Helpers for Comms Module
 * Provides helper functions for testing chat rooms and video calls
 */

import type { ApiClient } from './client';
import type { 
  ChatRoom, 
  ChatMessage,
  SendTextMessageRequest,
  StartVideoCallRequest,
  JoinVideoCallRequest,
  UpdateParticipantRequest,
  VideoCallJoinResponse,
  VideoCallEndResponse,
  LeaveVideoCallResponse
} from '../../../src/handlers/comms/repos/comms.schema';

// ============================================================================
// CHAT ROOM HELPERS
// ============================================================================

/**
 * List user's chat rooms
 */
export async function listChatRooms(
  client: ApiClient,
  options?: {
    status?: 'active' | 'archived';
    context?: string;
    withParticipant?: string;
    hasActiveCall?: boolean;
    page?: number;
    pageSize?: number;
  }
) {
  const searchParams: Record<string, any> = {};

  if (options?.status) searchParams.status = options.status;
  if (options?.context) searchParams.context = options.context;
  if (options?.withParticipant) searchParams.withParticipant = options.withParticipant;
  if (options?.hasActiveCall !== undefined) searchParams.hasActiveCall = options.hasActiveCall;
  if (options?.page) searchParams.page = options.page;
  if (options?.pageSize) searchParams.pageSize = options.pageSize;
  
  const response = await client.fetch('/comms/chat-rooms', {
    method: 'GET',
    searchParams
  });
  const data = await response.json();
  
  return { response, data };
}

/**
 * Get specific chat room
 */
export async function getChatRoom(client: ApiClient, roomId: string) {
  const response = await client.fetch(`/comms/chat-rooms/${roomId}`, {
    method: 'GET'
  });
  const data = response.ok ? await response.json() : null;
  
  return { response, data: data as ChatRoom | null };
}

/**
 * Get chat room messages
 */
export async function getChatMessages(
  client: ApiClient, 
  roomId: string,
  options?: {
    messageType?: 'text' | 'system' | 'video_call';
    page?: number;
    pageSize?: number;
  }
) {
  const searchParams: Record<string, any> = {};
  if (options?.messageType) searchParams.messageType = options.messageType;
  if (options?.page) searchParams.page = options.page;
  if (options?.pageSize) searchParams.pageSize = options.pageSize;
  
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/messages`, {
    method: 'GET',
    searchParams
  });
  const data = await response.json();
  
  return { response, data };
}

/**
 * Create chat room with array-based participants and admins
 */
export async function createChatRoom(
  client: ApiClient,
  participants: string[],
  admins?: string[],
  options?: {
    context?: string;
    upsert?: boolean;
  }
) {
  const requestBody: any = {
    participants,
    admins: admins || participants, // Default admins to all participants
    upsert: options?.upsert ?? false
  };

  // Only include optional fields if they have values
  if (options?.context) {
    requestBody.context = options.context;
  }

  const response = await client.fetch('/comms/chat-rooms', {
    method: 'POST',
    body: requestBody
  });
  
  // Always try to parse JSON response (for both success and error responses)
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // Response might not be JSON
  }

  return { response, data: data as ChatRoom | null };
}

/**
 * Legacy helper for backwards compatibility - creates room with two participants
 */
export async function createChatRoomLegacy(
  client: ApiClient,
  participant1: string,
  participant2: string,
  admin: string,
  options?: {
    context?: string;
  }
) {
  return createChatRoom(
    client,
    [participant1, participant2],
    [admin],
    {
      context: options?.context,
      upsert: false
    }
  );
}

/**
 * Get or create booking chat room using the general createChatRoom endpoint
 * This replaces the old booking-specific endpoint
 * Uses upsert behavior: creates new room or returns existing room if one exists between the participants
 */
export async function getOrCreateBookingChatRoom(
  client: ApiClient,
  bookingId: string,
  patientId: string,
  providerId: string
) {
  // The admin should be the provider ID (the database expects provider ID, not user ID)
  return createChatRoom(
    client,
    [patientId, providerId],
    [providerId], // Provider is the admin
    {
      context: bookingId,
      upsert: true
    }
  );
}

/**
 * Get or create appointment chat room (alias for booking chat room)
 * Uses upsert behavior: creates new room or returns existing room if one exists between the participants
 */
export async function getOrCreateAppointmentChatRoom(
  client: ApiClient,
  appointmentId: string,
  patientId: string,
  providerId: string
) {
  return createChatRoom(
    client,
    [patientId, providerId],
    [providerId], // Provider is the admin
    {
      context: appointmentId,
      upsert: true
    }
  );
}

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

/**
 * Send text message
 */
export async function sendTextMessage(
  client: ApiClient,
  roomId: string,
  message: string
) {
  const requestBody: SendTextMessageRequest = {
    messageType: 'text',
    message
  };
  
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/messages`, {
    method: 'POST',
    body: requestBody
  });
  const data = response.ok ? await response.json() : null;
  
  return { response, data: data as ChatMessage | null };
}

/**
 * Start video call
 */
export async function startVideoCall(
  client: ApiClient,
  roomId: string,
  participants: Array<{
    user: string;
    displayName: string;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }>
) {
  const requestBody: StartVideoCallRequest = {
    messageType: 'video_call',
    videoCallData: {
      status: 'starting',
      participants: participants.map(p => ({
        user: p.user,
        displayName: p.displayName,
        audioEnabled: p.audioEnabled ?? true,
        videoEnabled: p.videoEnabled ?? true
      }))
    }
  };

  const response = await client.fetch(`/comms/chat-rooms/${roomId}/messages`, {
    method: 'POST',
    body: requestBody
  });
  const data = response.ok ? await response.json() : null;

  // Log error details for debugging startVideoCall
  if (!response.ok) {
    const errorData = await response.text().catch(() => null);
    console.log(`startVideoCall failed with ${response.status}:`, errorData);
  }

  return { response, data: data as ChatMessage | null };
}

// ============================================================================
// VIDEO CALL ACTION HELPERS
// ============================================================================

/**
 * Join video call
 */
export async function joinVideoCall(
  client: ApiClient,
  roomId: string,
  displayName: string,
  options?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }
) {
  const requestBody: JoinVideoCallRequest = {
    displayName,
    audioEnabled: options?.audioEnabled ?? true,
    videoEnabled: options?.videoEnabled ?? true
  };
  
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/video-call/join`, {
    method: 'POST',
    body: requestBody
  });
  const data = response.ok ? await response.json() : null;

  // Log error details for debugging joinVideoCall
  if (!response.ok) {
    const errorData = await response.text().catch(() => null);
    console.log(`joinVideoCall failed with ${response.status}:`, errorData);
  }

  return { response, data: data as VideoCallJoinResponse | null };
}

/**
 * End video call
 */
export async function endVideoCall(client: ApiClient, roomId: string) {
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/video-call/end`, {
    method: 'POST',
    body: {}
  });
  const data = response.ok ? await response.json() : null;
  
  return { response, data: data as VideoCallEndResponse | null };
}

/**
 * Leave video call
 */
export async function leaveVideoCall(client: ApiClient, roomId: string) {
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/video-call/leave`, {
    method: 'POST',
    body: {}
  });
  const data = response.ok ? await response.json() : null;
  
  return { response, data: data as LeaveVideoCallResponse | null };
}

/**
 * Update video call participant status
 */
export async function updateVideoCallParticipant(
  client: ApiClient,
  roomId: string,
  updates: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  }
) {
  const requestBody: UpdateParticipantRequest = updates;
  
  const response = await client.fetch(`/comms/chat-rooms/${roomId}/video-call/participant`, {
    method: 'PATCH',
    body: requestBody
  });
  const data = response.ok ? await response.json() : null;
  
  return { response, data };
}

// ============================================================================
// COMPOSITE TEST HELPERS
// ============================================================================

/**
 * Start a test video call with two participants
 * This is a composite helper that creates a room, starts a video call, and returns all necessary data
 * Useful for tests that need a quick video call setup
 */
export async function startTestVideoCall(
  adminClient: ApiClient,
  participantClient: ApiClient,
  adminUserId: string,
  participantUserId: string,
  adminName: string = 'Admin User',
  participantName: string = 'Participant User'
) {
  // Create chat room with admin as room admin (use upsert to avoid duplicate room errors)
  const { response, data: room } = await createChatRoom(
    adminClient,
    [adminUserId, participantUserId],
    [adminUserId], // Admin is the room admin
    { upsert: true } // Get existing room if it exists
  );

  if (!room) {
    const errorBody = await response.text().catch(() => 'Unable to read error response');
    console.error(`createChatRoom failed with ${response.status}:`, errorBody);
    throw new Error(`Failed to create chat room for test video call. Status: ${response.status}`);
  }

  // Clean up any existing video call in the room to avoid conflicts
  await cleanupActiveVideoCall(adminClient, room.id);

  // Start video call as admin (admin is automatically added as initiator with no joinedAt)
  // Include participant in participants list so they are invited
  const { response: startResponse, data: videoCallMessage } = await startVideoCall(
    adminClient,
    room.id,
    [
      { user: participantUserId, displayName: participantName }
    ]
  );

  if (!videoCallMessage) {
    const errorBody = await startResponse.text().catch(() => 'Unable to read error response');
    console.error(`startVideoCall failed with ${startResponse.status}:`, errorBody);
    throw new Error('Failed to start video call');
  }

  // Admin is already in the call as initiator (no explicit join needed)
  // Admin will join explicitly to get proper joinedAt timestamp
  const { response: adminJoinResp, data: adminJoinResponse } = await joinVideoCall(
    adminClient,
    room.id,
    adminName
  );

  if (!adminJoinResponse) {
    const errorBody = await adminJoinResp.text().catch(() => 'Unable to read error response');
    console.error(`Admin joinVideoCall failed with ${adminJoinResp.status}:`, errorBody);
    throw new Error('Admin failed to join video call');
  }

  // Participant joins the call (this generates notification to admin who is already joined)
  const { response: participantJoinResp, data: participantJoinResponse } = await joinVideoCall(
    participantClient,
    room.id,
    participantName
  );

  if (!participantJoinResponse) {
    const errorBody = await participantJoinResp.text().catch(() => 'Unable to read error response');
    console.error(`Participant joinVideoCall failed with ${participantJoinResp.status}:`, errorBody);
    throw new Error('Participant failed to join video call');
  }

  return {
    room,
    videoCallMessage,
    adminJoinResponse,
    participantJoinResponse
  };
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

/**
 * Generate test text message content
 */
export function generateTestMessageContent(): string {
  const messages = [
    'Hello, how are you doing today?',
    'I have some questions about my booking.',
    'Thank you for your help!',
    'Can we discuss the treatment plan?',
    'I\'m feeling much better now.',
    'What time should I take the medication?',
    'I need to reschedule our next meeting.',
    'The test results look good.',
    'I have some concerns about the side effects.',
    'When should I schedule a follow-up?'
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Generate test video call participants
 * @param patientUserId - The user ID (authentication ID) of the patient
 * @param providerUserId - The user ID (authentication ID) of the provider
 * @param patientName - Display name for patient
 * @param providerName - Display name for provider
 */
export function generateVideoCallParticipants(
  patientUserId: string,
  providerUserId: string,
  patientName: string = 'Test Patient',
  providerName: string = 'Dr. Test Provider'
): Array<{
  user: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}> {
  return [
    {
      user: patientUserId,
      displayName: patientName,
      audioEnabled: true,
      videoEnabled: true
    },
    {
      user: providerUserId,
      displayName: providerName,
      audioEnabled: true,
      videoEnabled: false // Provider starts with video off
    }
  ];
}

// ============================================================================
// CLEANUP HELPERS
// ============================================================================

/**
 * Clean up any active video call in a chat room
 * Used for test cleanup to prevent 409 conflicts
 */
export async function cleanupActiveVideoCall(
  client: ApiClient,
  roomId: string
): Promise<void> {
  try {
    // Try to end any active video call - this will return 404 if no active call
    await endVideoCall(client, roomId);
  } catch (error) {
    // Ignore errors - likely means no active call to clean up
  }
}

// ============================================================================
// VALIDATORS
// ============================================================================

/**
 * Validate chat room response structure (new array-based format)
 */
export function validateChatRoomResponse(room: any, options?: { deep?: boolean }): boolean {
  const basicValidation = !!(
    room &&
    typeof room.id === 'string' &&
    Array.isArray(room.participants) &&
    room.participants.length > 0 &&
    Array.isArray(room.admins) &&
    room.admins.length > 0 &&
    typeof room.status === 'string' &&
    typeof room.messageCount === 'number' &&
    room.createdAt &&
    room.updatedAt
  );

  if (!basicValidation || !options?.deep) {
    return basicValidation;
  }

  // Deep validation for optional fields
  const contextValid = room.context === undefined || room.context === null || typeof room.context === 'string';
  const lastMessageAtValid = room.lastMessageAt === undefined || room.lastMessageAt === null || typeof room.lastMessageAt === 'string';
  const activeVideoCallValid = room.activeVideoCallMessage === undefined || room.activeVideoCallMessage === null || typeof room.activeVideoCallMessage === 'string';

  return contextValid && lastMessageAtValid && activeVideoCallValid;
}

/**
 * Validate chat room response structure (legacy format for backwards compatibility)
 */
export function validateChatRoomResponseLegacy(room: any): boolean {
  return !!(
    room &&
    typeof room.id === 'string' &&
    typeof room.participant1 === 'string' &&
    typeof room.participant2 === 'string' &&
    typeof room.admin === 'string' &&
    typeof room.status === 'string' &&
    typeof room.messageCount === 'number' &&
    room.createdAt &&
    room.updatedAt
  );
}

/**
 * Validate chat message response structure
 */
export function validateChatMessageResponse(message: any): boolean {
  return !!(
    message &&
    typeof message.id === 'string' &&
    typeof message.chatRoom === 'string' &&
    typeof message.sender === 'string' &&
    typeof message.messageType === 'string' &&
    message.timestamp &&
    message.createdAt &&
    message.updatedAt
  );
}

/**
 * Validate video call join response structure
 */
export function validateVideoCallJoinResponse(response: any): boolean {
  return !!(
    response &&
    typeof response.roomUrl === 'string' &&
    typeof response.token === 'string' &&
    typeof response.callStatus === 'string' &&
    Array.isArray(response.participants)
  );
}

/**
 * Validate video call end response structure
 */
export function validateVideoCallEndResponse(response: any): boolean {
  return !!(
    response &&
    typeof response.message === 'string' &&
    (response.callDuration === undefined || typeof response.callDuration === 'number')
  );
}

/**
 * Validate leave video call response structure
 */
export function validateLeaveVideoCallResponse(response: any): boolean {
  return !!(
    response &&
    typeof response.message === 'string' &&
    typeof response.callStillActive === 'boolean' &&
    typeof response.remainingParticipants === 'number'
  );
}

// ============================================================================
// ICE SERVERS HELPERS
// ============================================================================

/**
 * Get ICE servers configuration for WebRTC
 */
export async function getIceServers(client: ApiClient) {
  const response = await client.fetch('/comms/ice-servers', {
    method: 'GET'
  });
  const data = response.ok ? await response.json() : null;

  return { response, data };
}

/**
 * Validate CallParticipant structure
 */
export function validateCallParticipant(participant: any, options?: { requireJoinTimestamp?: boolean }): boolean {
  const basicValidation = !!(
    participant &&
    typeof participant.user === 'string' &&
    typeof participant.displayName === 'string' &&
    typeof participant.audioEnabled === 'boolean' &&
    typeof participant.videoEnabled === 'boolean'
  );

  if (!basicValidation) {
    return false;
  }

  // Validate optional timestamp fields
  const joinedAtValid = participant.joinedAt === undefined || participant.joinedAt === null || typeof participant.joinedAt === 'string';
  const leftAtValid = participant.leftAt === undefined || participant.leftAt === null || typeof participant.leftAt === 'string';

  // If requireJoinTimestamp option is set, joinedAt must be present
  if (options?.requireJoinTimestamp && !participant.joinedAt) {
    return false;
  }

  return joinedAtValid && leftAtValid;
}

/**
 * Validate VideoCallData structure
 */
export function validateVideoCallData(data: any): boolean {
  if (!data) {
    return false;
  }

  // Required fields
  const hasRequiredFields = !!(
    typeof data.status === 'string' &&
    Array.isArray(data.participants)
  );

  if (!hasRequiredFields) {
    return false;
  }

  // Validate all participants
  const participantsValid = data.participants.every((p: any) => validateCallParticipant(p));
  if (!participantsValid) {
    return false;
  }

  // Validate optional fields
  const roomUrlValid = data.roomUrl === undefined || data.roomUrl === null || typeof data.roomUrl === 'string';
  const tokenValid = data.token === undefined || data.token === null || typeof data.token === 'string';
  const startedAtValid = data.startedAt === undefined || data.startedAt === null || typeof data.startedAt === 'string';
  const startedByValid = data.startedBy === undefined || data.startedBy === null || typeof data.startedBy === 'string';
  const endedAtValid = data.endedAt === undefined || data.endedAt === null || typeof data.endedAt === 'string';
  const endedByValid = data.endedBy === undefined || data.endedBy === null || typeof data.endedBy === 'string';
  const durationValid = data.durationMinutes === undefined || data.durationMinutes === null || typeof data.durationMinutes === 'number';

  return roomUrlValid && tokenValid && startedAtValid && startedByValid &&
         endedAtValid && endedByValid && durationValid;
}

/**
 * Validate ICE servers response structure
 */
export function validateIceServersResponse(response: any): boolean {
  if (!response || !Array.isArray(response.iceServers)) {
    return false;
  }

  // Validate each ICE server entry
  return response.iceServers.every((server: any) => {
    // urls is required and can be string or string[]
    const hasValidUrls = typeof server.urls === 'string' ||
      (Array.isArray(server.urls) && server.urls.every((url: any) => typeof url === 'string'));

    // username and credential are optional strings
    const hasValidUsername = server.username === undefined || typeof server.username === 'string';
    const hasValidCredential = server.credential === undefined || typeof server.credential === 'string';

    return hasValidUrls && hasValidUsername && hasValidCredential;
  });
}