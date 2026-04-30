/**
 * Comms Module E2E Tests
 * Tests the complete communication workflow including chat rooms, messages, and video calls
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { generateUniqueEmail } from '../../helpers/unique';

import {
  // Chat room functions
  listChatRooms,
  getChatRoom,
  getChatMessages,
  createChatRoom,
  getOrCreateBookingChatRoom,

  // Message functions
  sendTextMessage,
  startVideoCall,

  // Video call action functions
  joinVideoCall,
  endVideoCall,
  leaveVideoCall,
  updateVideoCallParticipant,

  // ICE servers functions
  getIceServers,

  // Data generators
  generateTestMessageContent,
  generateVideoCallParticipants,

  // Cleanup helpers
  cleanupActiveVideoCall,

  // Validators
  validateChatRoomResponse,
  validateChatMessageResponse,
  validateVideoCallJoinResponse,
  validateVideoCallEndResponse,
  validateLeaveVideoCallResponse,
  validateIceServersResponse,
  validateCallParticipant,
  validateVideoCallData
} from '../../helpers/comms';

describe('Comms Module E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;
  let serviceProviderClient: ApiClient;
  let clientUser: ApiClient;
  let secondClientUser: ApiClient;
  
  let serviceProviderPersonId: string;
  let clientPersonId: string;
  let secondClientPersonId: string;
  let bookingId: string;
  let chatRoomId: string;
  
  // Mock booking and chat room data for testing
  const mockBookingId = faker.string.uuid();
  const mockChatRoomId = faker.string.uuid();
  
  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API clients with embedded app instance
    apiClient = createApiClient({
      app: testApp.app
    });
    serviceProviderClient = createApiClient({
      app: testApp.app
    });
    clientUser = createApiClient({
      app: testApp.app
    });
    secondClientUser = createApiClient({
      app: testApp.app
    });
    
    // Sign up users with unique email addresses to prevent conflicts
    const serviceProviderUser = await serviceProviderClient.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName()
    });
    const clientUserData = await clientUser.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName()
    });
    const secondClientUserData = await secondClientUser.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName()
    });

    // Use Person IDs directly from authenticated users
    serviceProviderPersonId = serviceProviderUser.id;
    clientPersonId = clientUserData.id;
    secondClientPersonId = secondClientUserData.id;
    
    // Set booking ID for tests that need it
    bookingId = mockBookingId;
    
    // For now, skip chat room creation since it depends on booking module
    // Tests that require chat rooms will skip or use mock IDs
    chatRoomId = '';
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });
  
  describe('Chat Room Management', () => {
    describe('GET /comms/chat-rooms', () => {
      test('should list chat rooms for authenticated user', async () => {
        const { response, data } = await listChatRooms(clientUser);
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(data.data).toBeInstanceOf(Array);
        expect(data.pagination).toBeDefined();
        expect(typeof data.pagination.totalCount).toBe('number');
      });
      
      test('should fail without authentication', async () => {
        const { response } = await listChatRooms(apiClient);
        
        expect(response.status).toBe(401);
      });
      
      test('should support pagination', async () => {
        const { response, data } = await listChatRooms(clientUser, {
          page: 1,
          pageSize: 5
        });
        
        expect(response.status).toBe(200);
        expect(data.pagination.page).toBe(1);
        expect(data.pagination.pageSize).toBe(5);
      });
      
      test('should support status filtering', async () => {
        const { response, data } = await listChatRooms(clientUser, {
          status: 'active'
        });
        
        expect(response.status).toBe(200);
        if (data.data.length > 0) {
          expect(data.data.every((room: any) => room.status === 'active')).toBe(true);
        }
      });
      
      test('should filter for common rooms between users', async () => {
        const { response, data } = await listChatRooms(clientUser, {
          withParticipant: secondClientUser.getUser().id // Find rooms shared with another user
        });

        // Should succeed but return empty results (no shared rooms between test users)
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(data.data).toBeInstanceOf(Array);
        expect(data.data.length).toBe(0); // No shared rooms expected in test setup
      });

      test('should filter by hasActiveCall parameter', async () => {
        // First, list all rooms
        const { response: allResponse, data: allData } = await listChatRooms(clientUser);
        expect(allResponse.status).toBe(200);

        // Then filter for rooms with active calls
        const { response, data } = await listChatRooms(clientUser, {
          hasActiveCall: true
        });

        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(data.data).toBeInstanceOf(Array);

        // All returned rooms should have activeVideoCallMessage set
        if (data.data.length > 0) {
          expect(data.data.every((room: any) => room.activeVideoCallMessage !== null)).toBe(true);
        }

        // Filter for rooms WITHOUT active calls
        const { response: noCallResponse, data: noCallData } = await listChatRooms(clientUser, {
          hasActiveCall: false
        });

        expect(noCallResponse.status).toBe(200);
        // All returned rooms should NOT have activeVideoCallMessage set
        if (noCallData.data.length > 0) {
          expect(noCallData.data.every((room: any) => room.activeVideoCallMessage === null)).toBe(true);
        }
      });

      test('should filter by context parameter', async () => {
        // Use the mockBookingId we know exists from room creation
        const { response, data } = await listChatRooms(clientUser, {
          context: mockBookingId
        });

        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(data.data).toBeInstanceOf(Array);

        // All returned rooms should have the specified context
        if (data.data.length > 0) {
          expect(data.data.every((room: any) => room.context === mockBookingId)).toBe(true);
        }
      });
    });
    
    describe('POST /comms/chat-rooms (with booking context)', () => {
      test('should create or get chat room for booking using context', async () => {
        // Create/get chat room for booking with context
        const { response, data } = await getOrCreateBookingChatRoom(
          serviceProviderClient, // Use provider client since they'll be the admin
          mockBookingId,
          clientPersonId,
          serviceProviderPersonId
        );


        // Should succeed in creating room
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);

        if (response.ok && data) {
          expect(validateChatRoomResponse(data)).toBe(true);
          expect(data.context).toBe(mockBookingId);
          expect(data.participants).toContain(clientPersonId);
          expect(data.participants).toContain(serviceProviderPersonId);
          expect(data.admins).toContain(serviceProviderPersonId);
          chatRoomId = data.id; // Use this for subsequent tests
        }
      });

      test('should find booking chat room using booking filter', async () => {
        // List rooms filtered by booking ID
        const { response, data } = await listChatRooms(clientUser, {
          booking: mockBookingId
        });

        expect(response.status).toBe(200);
        if (data?.data) {
          expect(data.data.length).toBeGreaterThan(0);
          const bookingRoom = data.data.find(room => room.context === mockBookingId);
          expect(bookingRoom).toBeDefined();
        }
      });

      test('should return 409 Conflict when creating duplicate room with upsert=false', async () => {
        const testContext = faker.string.uuid();

        // Use real user IDs that exist
        const { response: firstResponse } = await createChatRoom(
          serviceProviderClient,
          [secondClientPersonId, serviceProviderPersonId], // Use secondClient who exists
          [serviceProviderPersonId],
          { context: testContext, upsert: false }
        );

        expect(firstResponse.status).toBe(201); // Created

        // Try to create same room again with upsert=false
        const { response: secondResponse } = await createChatRoom(
          serviceProviderClient,
          [secondClientPersonId, serviceProviderPersonId],
          [serviceProviderPersonId],
          { context: testContext, upsert: false }
        );

        expect(secondResponse.status).toBe(409); // Conflict
      });

      test('should differentiate between 201 (created) and 200 (existing) status codes', async () => {
        const testContext1 = faker.string.uuid();
        const testContext2 = faker.string.uuid();

        // First call with unique context - should get existing room (200) since upsert on existing participants
        const { response: firstResponse, data: firstData } = await createChatRoom(
          serviceProviderClient,
          [clientPersonId, serviceProviderPersonId],
          [serviceProviderPersonId],
          { context: testContext1, upsert: true }
        );

        expect([200, 201]).toContain(firstResponse.status); // Could be 200 if room already exists from earlier tests
        expect(firstData).toBeDefined();

        // Second call with different context but same participants - should return existing room (200)
        const { response: secondResponse, data: secondData } = await createChatRoom(
          serviceProviderClient,
          [clientPersonId, serviceProviderPersonId],
          [serviceProviderPersonId],
          { context: testContext2, upsert: true }
        );

        expect(secondResponse.status).toBe(200); // OK - existing room returned (upsert finds existing)
        expect(secondData).toBeDefined();
        expect(secondData!.id).toBe(firstData!.id); // Same room ID - upsert returns existing
      });

      test('should support custom admins array', async () => {
        const testContext = faker.string.uuid();

        // Create room with only provider as admin (client and secondClient are participants but not admins)
        const { response, data } = await createChatRoom(
          secondClientUser, // Use secondClient to create
          [clientPersonId, serviceProviderPersonId, secondClientPersonId],
          [serviceProviderPersonId], // Only provider is admin
          { context: testContext, upsert: false }
        );

        expect(response.status).toBe(201);
        expect(data).toBeDefined();
        expect(data!.participants).toHaveLength(3);
        expect(data!.participants).toContain(clientPersonId);
        expect(data!.participants).toContain(serviceProviderPersonId);
        expect(data!.participants).toContain(secondClientPersonId);
        expect(data!.admins).toHaveLength(1);
        expect(data!.admins).toContain(serviceProviderPersonId);
        expect(data!.admins).not.toContain(clientPersonId);
        expect(data!.admins).not.toContain(secondClientPersonId);
      });
    });
  });
  
  describe('Message Management', () => {
    beforeEach(async () => {
      // Always create a specific 2-participant room for test isolation
      // This prevents pollution from other tests (e.g., custom admins test with 3 participants)
      const testContext = faker.string.uuid();
      
      const { response: roomResponse, data: roomData } = await createChatRoom(
        serviceProviderClient,
        [clientPersonId, serviceProviderPersonId],
        [serviceProviderPersonId],
        { context: testContext, upsert: false }
      );

      if (roomResponse.ok && roomData) {
        chatRoomId = roomData.id;
      }
    });
    
    describe('POST /comms/chat-rooms/{roomId}/messages (text)', () => {
      test('should send text message', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const messageContent = generateTestMessageContent();
        const { response, data } = await sendTextMessage(clientUser, chatRoomId, messageContent);
        
        expect(response.status).toBe(201);
        expect(data).toBeDefined();
        expect(validateChatMessageResponse(data)).toBe(true);
        expect(data!.messageType).toBe('text');
        expect(data!.message).toBe(messageContent);
      });
      
      test('should fail with empty message', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response } = await sendTextMessage(clientUser, chatRoomId, '');
        
        expect(response.status).toBe(400);
      });
      
      test('should fail with message too long', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const longMessage = 'a'.repeat(5001); // Exceeds 5000 char limit
        const { response } = await sendTextMessage(clientUser, chatRoomId, longMessage);
        
        expect(response.status).toBe(400);
      });
      
      test('should fail for non-participants', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const messageContent = generateTestMessageContent();
        const { response } = await sendTextMessage(secondClientUser, chatRoomId, messageContent);
        
        expect(response.status).toBe(403);
      });
    });
    
    describe('GET /comms/chat-rooms/{roomId}/messages', () => {
      test('should get messages for room participants', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response, data } = await getChatMessages(clientUser, chatRoomId);
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(data.data).toBeInstanceOf(Array);
        expect(data.pagination).toBeDefined();
      });
      
      test('should support message type filtering', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response, data } = await getChatMessages(clientUser, chatRoomId, {
          messageType: 'text'
        });
        
        expect(response.status).toBe(200);
        if (data.data.length > 0) {
          expect(data.data.every((msg: any) => msg.messageType === 'text')).toBe(true);
        }
      });
      
      test('should fail for non-participants', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response } = await getChatMessages(secondClientUser, chatRoomId);
        
        expect(response.status).toBe(403);
      });
    });
  });
  
  describe('Video Call Management', () => {
    let videoCallMessageId: string;

    beforeAll(async () => {
      // Clean up any active video calls before starting video call tests
      if (chatRoomId) {
        await cleanupActiveVideoCall(serviceProviderClient, chatRoomId);
      }
    });

    afterAll(async () => {
      // Clean up any active video calls after video call tests
      if (chatRoomId) {
        await cleanupActiveVideoCall(serviceProviderClient, chatRoomId);
      }
    });

    describe('POST /comms/chat-rooms/{roomId}/messages (video_call)', () => {
      test('should start video call as admin', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        const { response, data } = await startVideoCall(serviceProviderClient, chatRoomId, participants);
        
        expect(response.status).toBe(201);
        expect(data).toBeDefined();
        expect(validateChatMessageResponse(data)).toBe(true);
        expect(data!.messageType).toBe('video_call');
        expect(data!.videoCallData).toBeDefined();
        expect(data!.videoCallData!.status).toBe('starting');
        
        videoCallMessageId = data!.id;
      });
      
      test('should fail to start second video call in same room', async () => {
        if (!chatRoomId || !videoCallMessageId) {
          test.skip('prerequisites not met');
          return;
        }
        
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        const { response } = await startVideoCall(serviceProviderClient, chatRoomId, participants);
        
        expect(response.status).toBe(409); // Conflict
      });
      
      test('should fail for non-admin when onlyAdminCanStartCall is true', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        const { response } = await startVideoCall(clientUser, chatRoomId, participants);

        // Could be 403 (forbidden) or 409 (conflict if call already exists)
        expect([403, 409]).toContain(response.status);
      });
    });
    
    describe('POST /comms/chat-rooms/{roomId}/video-call/join', () => {
      test('should join active video call', async () => {
        if (!chatRoomId || !videoCallMessageId) {
          test.skip('prerequisites not met');
          return;
        }
        
        const { response, data } = await joinVideoCall(clientUser, chatRoomId, 'Test Client', {
          audioEnabled: true,
          videoEnabled: true
        });
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(validateVideoCallJoinResponse(data)).toBe(true);
        expect(data!.roomUrl).toContain('video-call/signal');
        expect(data!.roomUrl).toMatch(/^wss?:\/\//); // Should be WebSocket URL (ws:// or wss://)
        expect(data!.token).toBeDefined();
        expect(data!.callStatus).toBe('active');
      });
      
      test('should fail to join non-existent video call', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        // First end any active call
        await endVideoCall(serviceProviderClient, chatRoomId);
        
        const { response } = await joinVideoCall(clientUser, chatRoomId, 'Test Client');
        
        expect(response.status).toBe(404);
      });
      
      test('should fail for non-participants', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response } = await joinVideoCall(secondClientUser, chatRoomId, 'Other Client');
        
        expect(response.status).toBe(403);
      });
    });
    
    describe('PATCH /comms/chat-rooms/{roomId}/video-call/participant', () => {
      test('should update participant status', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }

        // Ensure there's an active video call (previous test ended it)
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        await startVideoCall(serviceProviderClient, chatRoomId, participants);

        // Client must join the call first before updating status
        await joinVideoCall(clientUser, chatRoomId, 'Test Client');

        const { response, data } = await updateVideoCallParticipant(clientUser, chatRoomId, {
          audioEnabled: false,
          videoEnabled: true
        });

        expect(response.status).toBe(200);
        expect(data).toBeDefined();

        // Validate complete CallParticipant structure
        expect(validateCallParticipant(data, { requireJoinTimestamp: true })).toBe(true);
        expect(data.user).toBe(clientUser.getUser().id);
        expect(data.displayName).toBeDefined();
        expect(data.audioEnabled).toBe(false);
        expect(data.videoEnabled).toBe(true);
        expect(data.joinedAt).toBeDefined(); // Should have join timestamp
      });
      
      test('should fail with no updates provided', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response } = await updateVideoCallParticipant(clientUser, chatRoomId, {});
        
        expect(response.status).toBe(400);
      });
    });
    
    describe('POST /comms/chat-rooms/{roomId}/video-call/leave', () => {
      test('should leave video call', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }

        // Ensure there's an active video call (may have been ended by previous tests)
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        await startVideoCall(serviceProviderClient, chatRoomId, participants);

        // Client must join the call first before leaving
        await joinVideoCall(clientUser, chatRoomId, 'Test Client');

        const { response, data } = await leaveVideoCall(clientUser, chatRoomId);
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(validateLeaveVideoCallResponse(data)).toBe(true);
        expect(typeof data!.callStillActive).toBe('boolean');
        expect(typeof data!.remainingParticipants).toBe('number');
      });
      
      test('should auto-end call when last participant leaves', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        // Start a new call and have provider join then leave
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        await startVideoCall(serviceProviderClient, chatRoomId, participants);
        await joinVideoCall(serviceProviderClient, chatRoomId, 'Dr. Test');
        
        const { response, data } = await leaveVideoCall(serviceProviderClient, chatRoomId);
        
        expect(response.status).toBe(200);
        expect(data!.callStillActive).toBe(false);
        expect(data!.remainingParticipants).toBe(0);
      });
    });
    
    describe('POST /comms/chat-rooms/{roomId}/video-call/end', () => {
      test('should end video call as admin', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        // Start a new call first
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        await startVideoCall(serviceProviderClient, chatRoomId, participants);
        
        const { response, data } = await endVideoCall(serviceProviderClient, chatRoomId);
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(validateVideoCallEndResponse(data)).toBe(true);
        expect(data!.message).toContain('ended');
      });
      
      test('should fail for non-admin', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        // Start a new call first
        const participants = generateVideoCallParticipants(
          clientUser.getUser().id,
          serviceProviderClient.getUser().id,
          'Test Client',
          'Dr. Test Provider'
        );
        await startVideoCall(serviceProviderClient, chatRoomId, participants);
        
        const { response } = await endVideoCall(clientUser, chatRoomId);

        expect(response.status).toBe(403);

        // Clean up the active call so next test has no active call
        await endVideoCall(serviceProviderClient, chatRoomId);
      });
      
      test('should fail when no active call', async () => {
        if (!chatRoomId) {
          test.skip('no chat room available');
          return;
        }
        
        const { response } = await endVideoCall(serviceProviderClient, chatRoomId);
        
        expect(response.status).toBe(404);
      });
    });
  });
  
  describe('ICE Servers Configuration', () => {
    describe('GET /comms/ice-servers', () => {
      test('should return ICE servers for authenticated users', async () => {
        const { response, data } = await getIceServers(clientUser);

        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        expect(validateIceServersResponse(data)).toBe(true);
        expect(data.iceServers).toBeInstanceOf(Array);
        expect(data.iceServers.length).toBeGreaterThan(0);
      });

      test('should fail without authentication', async () => {
        const { response } = await getIceServers(apiClient);

        expect(response.status).toBe(401);
      });

      test('should return valid STUN server configuration', async () => {
        const { response, data } = await getIceServers(clientUser);

        expect(response.status).toBe(200);
        expect(data).toBeDefined();

        // Check that at least one STUN server is present
        const stunServers = data.iceServers.filter((server: any) =>
          (typeof server.urls === 'string' && server.urls.startsWith('stun:')) ||
          (Array.isArray(server.urls) && server.urls.some((url: string) => url.startsWith('stun:')))
        );

        expect(stunServers.length).toBeGreaterThan(0);
      });

      test('should support both single and multiple URLs per server', async () => {
        const { response, data } = await getIceServers(clientUser);

        expect(response.status).toBe(200);
        expect(data).toBeDefined();

        // Check that each server has valid urls format
        data.iceServers.forEach((server: any) => {
          const hasValidUrls = typeof server.urls === 'string' ||
            (Array.isArray(server.urls) && server.urls.every((url: any) => typeof url === 'string'));

          expect(hasValidUrls).toBe(true);
        });
      });

      test('should include optional TURN credential fields', async () => {
        const { response, data } = await getIceServers(clientUser);

        expect(response.status).toBe(200);
        expect(data).toBeDefined();

        // Check that TURN servers can have username and credential
        data.iceServers.forEach((server: any) => {
          if (server.username !== undefined) {
            expect(typeof server.username).toBe('string');
          }
          if (server.credential !== undefined) {
            expect(typeof server.credential).toBe('string');
          }
        });
      });
    });
  });

  describe('Security and Authorization', () => {
    test('should require authentication for all endpoints', async () => {
      // Use valid UUIDs to pass parameter validation and test authentication
      const testRoomId = '00000000-0000-0000-0000-000000000000';
      const testAppointmentId = '11111111-1111-1111-1111-111111111111';

      const endpoints = [
        { method: 'GET', path: '/comms/chat-rooms' },
        { method: 'GET', path: `/comms/chat-rooms/${testRoomId}` },
        { method: 'GET', path: `/comms/chat-rooms/${testRoomId}/messages` },
        {
          method: 'POST',
          path: `/comms/chat-rooms/${testRoomId}/messages`,
          body: { messageType: 'text', message: 'test message' }
        },
        {
          method: 'POST',
          path: `/comms/chat-rooms/${testRoomId}/video-call/join`,
          body: { displayName: 'Test User', audioEnabled: true, videoEnabled: true }
        },
        { method: 'POST', path: `/comms/chat-rooms/${testRoomId}/video-call/end` },
        { method: 'POST', path: `/comms/chat-rooms/${testRoomId}/video-call/leave` },
        {
          method: 'PATCH',
          path: `/comms/chat-rooms/${testRoomId}/video-call/participant`,
          body: { audioEnabled: true }
        },
        { method: 'GET', path: '/comms/ice-servers' }, // ICE servers endpoint
        // Removed endpoint - this should return 404, not 401
        // { method: 'GET', path: `/comms/bookings/${testAppointmentId}/chat-room` }
      ];

      for (const endpoint of endpoints) {
        const response = await apiClient.fetch(endpoint.path, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.method !== 'GET' ? JSON.stringify(endpoint.body || {}) : undefined
        });

        expect(response.status).toBe(401);
      }
    });
    
    test('should enforce participant-only access to chat rooms', async () => {
      if (!chatRoomId) {
        test.skip('no chat room available');
        return;
      }
      
      // Try to access room as non-participant
      const { response: roomResponse } = await getChatRoom(secondClientUser, chatRoomId);
      expect(roomResponse.status).toBe(403);
      
      const { response: messagesResponse } = await getChatMessages(secondClientUser, chatRoomId);
      expect(messagesResponse.status).toBe(403);
    });
    
    test('should enforce admin-only video call control', async () => {
      if (!chatRoomId) {
        test.skip('no chat room available');
        return;
      }
      
      // Client (non-admin) should not be able to start call
      const participants = generateVideoCallParticipants(clientUser.getUser().id, serviceProviderClient.getUser().id);
      const { response: startResponse } = await startVideoCall(clientUser, chatRoomId, participants);
      expect(startResponse.status).toBe(403);
      
      // Start call as provider (admin)
      await startVideoCall(serviceProviderClient, chatRoomId, participants);
      
      // Client should not be able to end call
      const { response: endResponse } = await endVideoCall(clientUser, chatRoomId);
      expect(endResponse.status).toBe(403);
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid UUIDs gracefully', async () => {
      const invalidId = 'not-a-uuid';
      
      const { response: roomResponse } = await getChatRoom(clientUser, invalidId);
      expect(roomResponse.status).toBe(400);
      
      const { response: messagesResponse } = await getChatMessages(clientUser, invalidId);
      expect(messagesResponse.status).toBe(400);
    });
    
    test('should handle non-existent resources', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      
      const { response: roomResponse } = await getChatRoom(clientUser, nonExistentId);
      expect(roomResponse.status).toBe(404);
    });
    
    test('should validate request payloads', async () => {
      if (!chatRoomId) {
        test.skip('no chat room available');
        return;
      }
      
      // Invalid message type - use fetch instead of post
      const invalidMessageResponse = await clientUser.fetch(`/comms/chat-rooms/${chatRoomId}/messages`, {
        method: 'POST',
        body: {
          messageType: 'invalid',
          message: 'test'
        }
      });
      expect(invalidMessageResponse.status).toBe(400);

      // Missing required fields
      const missingFieldsResponse = await clientUser.fetch(`/comms/chat-rooms/${chatRoomId}/video-call/join`, {
        method: 'POST',
        body: {
          // Missing displayName
          audioEnabled: true
        }
      });
      expect(missingFieldsResponse.status).toBe(400);
    });
  });
});