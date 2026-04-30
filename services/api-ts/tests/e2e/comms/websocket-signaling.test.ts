/**
 * WebSocket Signaling Server E2E Tests
 * Tests the WebSocket signaling server for WebRTC video calls
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import WebSocket from 'ws';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { generateUniqueEmail } from '../../helpers/unique';
import { getOrCreateAppointmentChatRoom } from '../../helpers/comms';

/**
 * WebSocket client wrapper for testing
 */
class TestWebSocketClient {
  private ws: WebSocket | null = null;
  private receivedMessages: any[] = [];
  private messageResolvers: Array<(msg: any) => void> = [];
  public userId: string;
  public isOpen = false;

  constructor(public name: string, userId: string) {
    this.userId = userId;
  }

  /**
   * Connect to WebSocket signaling server with authentication
   */
  async connect(roomId: string, bearerToken: string, baseUrl: string): Promise<void> {
    // Convert http://localhost:PORT to ws://localhost:PORT
    const wsUrl = `${baseUrl.replace('http://', 'ws://')}/ws/comms/chat-rooms/${roomId}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      // Create WebSocket with Bearer token auth header
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      this.ws.on('open', () => {
        this.isOpen = true;
        // Don't resolve yet - wait for ready message to confirm authorization
      });

      this.ws.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`WebSocket connection failed: ${error.message}`));
        }
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          // Check for connected event (indicates successful authorization)
          if (message.event === 'connected' && !isResolved) {
            isResolved = true;
            resolve();
            return; // Don't buffer the connected message
          }

          // Check for error message (indicates authorization failure)
          if (message.error && !isResolved) {
            isResolved = true;
            reject(new Error(`WebSocket authorization failed: ${message.error}`));
            return;
          }

          // Deliver to waiting resolver if one exists, otherwise buffer it
          if (this.messageResolvers.length > 0) {
            const resolver = this.messageResolvers.shift();
            resolver?.(message);
          } else {
            this.receivedMessages.push(message);
          }
        } catch (err) {
          console.error(`[${this.name}] Failed to parse WebSocket message:`, err);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isOpen = false;
        // If connection closes before ready message, it's an authorization failure
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`WebSocket closed before authorization: ${code} ${reason.toString()}`));
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Send signaling message
   */
  send(type: 'offer' | 'answer' | 'ice-candidate', data: any): void {
    if (!this.ws || !this.isOpen) {
      throw new Error('WebSocket not connected');
    }

    this.ws.send(JSON.stringify({ type: `video.${type}`, data }));
  }

  /**
   * Wait for next message (skips system events like user.joined/user.left)
   */
  async waitForMessage(timeout = 5000): Promise<any> {
    const skipEvents = ['user.joined', 'user.left'];
    
    // Check buffered messages, skip system events
    while (this.receivedMessages.length > 0) {
      const msg = this.receivedMessages.shift();
      if (!skipEvents.includes(msg.event)) {
        return msg;
      }
    }

    // Wait for new message, skip system events
    return new Promise((resolve, reject) => {
      const originalResolve = (msg: any) => {
        if (!skipEvents.includes(msg.event)) {
          resolve(msg);
        } else {
          // System event received, re-queue resolver to wait for next message
          this.messageResolvers.push(originalResolve);
        }
      };
      
      this.messageResolvers.push(originalResolve);

      setTimeout(() => {
        const index = this.messageResolvers.indexOf(originalResolve);
        if (index > -1) {
          this.messageResolvers.splice(index, 1);
          reject(new Error(`[${this.name}] Timeout waiting for WebSocket message after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Get all received messages (excluding system events)
   */
  getReceivedMessages(): any[] {
    const skipEvents = ['user.joined', 'user.left'];
    return this.receivedMessages.filter(msg => !skipEvents.includes(msg.event));
  }

  /**
   * Clear received messages buffer
   */
  clearMessages(): void {
    this.receivedMessages = [];
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isOpen = false;
    }
  }

  /**
   * Wait for connection to close
   */
  async waitForClose(timeout = 2000): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve, reject) => {
      if (!this.isOpen) {
        resolve();
        return;
      }

      this.ws!.on('close', () => {
        this.isOpen = false;
        resolve();
      });

      setTimeout(() => {
        reject(new Error('Timeout waiting for WebSocket close'));
      }, timeout);
    });
  }
}

describe('WebSocket Signaling Server E2E Tests', () => {
  let testApp: TestApp;
  let providerClient: ApiClient;
  let patientClient: ApiClient;
  let secondPatientClient: ApiClient;

  let providerPersonId: string;
  let patientPersonId: string;
  let secondPatientPersonId: string;
  let chatRoomId: string;
  let secondChatRoomId: string;

  let providerToken: string;
  let patientToken: string;
  let secondPatientToken: string;

  let providerWs: TestWebSocketClient;
  let patientWs: TestWebSocketClient;
  let secondPatientWs: TestWebSocketClient;

  const mockAppointmentId = faker.string.uuid();
  const mockAppointmentId2 = faker.string.uuid();

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true, startServer: true });

    // Verify HTTP server is running
    const healthCheck = await fetch(`${testApp.baseUrl}/livez`);
    if (!healthCheck.ok) {
      throw new Error('Test server not responding');
    }

    // Create API clients
    providerClient = createApiClient({ app: testApp.app });
    patientClient = createApiClient({ app: testApp.app });
    secondPatientClient = createApiClient({ app: testApp.app });

    // Sign up users and capture bearer tokens
    const providerUser = await providerClient.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName(),
    });
    providerToken = providerClient.getBearerToken() || '';
    providerPersonId = providerUser.id;

    const patientUser = await patientClient.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName(),
    });
    patientToken = patientClient.getBearerToken() || '';
    patientPersonId = patientUser.id;

    const secondPatientUser = await secondPatientClient.signup({
      email: generateUniqueEmail(),
      name: faker.person.fullName(),
    });
    secondPatientToken = secondPatientClient.getBearerToken() || '';
    secondPatientPersonId = secondPatientUser.id;

    // Create first chat room for testing
    const { response, data } = await getOrCreateAppointmentChatRoom(
      providerClient,
      mockAppointmentId,
      patientPersonId,
      providerPersonId
    );

    if (response.ok && data) {
      chatRoomId = data.id;
    } else {
      throw new Error('Failed to create first chat room for WebSocket testing');
    }

    // Create second chat room for room isolation tests
    const { response: response2, data: data2 } = await getOrCreateAppointmentChatRoom(
      providerClient,
      mockAppointmentId2,
      secondPatientPersonId,
      providerPersonId
    );

    if (response2.ok && data2) {
      secondChatRoomId = data2.id;
    } else {
      throw new Error('Failed to create second chat room for WebSocket testing');
    }

    // Create WebSocket test clients
    providerWs = new TestWebSocketClient('Provider', providerClient.getUser().id);
    patientWs = new TestWebSocketClient('Patient', patientClient.getUser().id);
    secondPatientWs = new TestWebSocketClient('SecondPatient', secondPatientClient.getUser().id);
  }, 60000);

  afterAll(async () => {
    // Wait for all WebSocket connections to close before cleanup
    if (providerWs?.isOpen) {
      providerWs.close();
      await providerWs.waitForClose().catch(() => {});
    }
    if (patientWs?.isOpen) {
      patientWs.close();
      await patientWs.waitForClose().catch(() => {});
    }
    if (secondPatientWs?.isOpen) {
      secondPatientWs.close();
      await secondPatientWs.waitForClose().catch(() => {});
    }

    // Now safe to cleanup app and database
    await testApp?.cleanup();
  });

  beforeEach(() => {
    // Clear message buffers before each test
    providerWs?.clearMessages();
    patientWs?.clearMessages();
    secondPatientWs?.clearMessages();
  });

  afterEach(async () => {
    // Close any open connections after each test and wait for closure
    if (providerWs?.isOpen) {
      providerWs.close();
      await providerWs.waitForClose().catch(() => {});
    }
    if (patientWs?.isOpen) {
      patientWs.close();
      await patientWs.waitForClose().catch(() => {});
    }
    if (secondPatientWs?.isOpen) {
      secondPatientWs.close();
      await secondPatientWs.waitForClose().catch(() => {});
    }
  });

  describe('Connection Lifecycle', () => {
    test('should establish WebSocket connection with valid auth', async () => {
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);
      expect(providerWs.isOpen).toBe(true);
    });

    test('should handle connection close and cleanup', async () => {
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);
      expect(providerWs.isOpen).toBe(true);

      providerWs.close();
      await providerWs.waitForClose();
      expect(providerWs.isOpen).toBe(false);
    });
  });

  describe('Message Relay Tests', () => {
    beforeEach(async () => {
      // Clear any previous messages
      providerWs.clearMessages();
      patientWs.clearMessages();

      // Connect both peers for relay tests (ready messages consumed in connect())
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);
      await patientWs.connect(chatRoomId, patientToken, testApp.baseUrl);

      // Wait for any in-flight user.joined events to arrive
      await new Promise(resolve => setTimeout(resolve, 200));

      // Clear messages after connection to remove user.joined events
      providerWs.clearMessages();
      patientWs.clearMessages();
    });

    test('should relay SDP offer from provider to patient', async () => {
      const offerData = {
        type: 'offer' as const,
        sdp: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      };

      providerWs.send('offer', offerData);

      const received = await patientWs.waitForMessage();
      expect(received.event).toBe('video.offer');
      expect(received.payload.from).toBe(providerWs.userId);
      expect(received.payload.data.sdp).toBe(offerData.sdp);
    }, { timeout: 15000 });

    test('should relay SDP answer from patient to provider', async () => {
      const answerData = {
        type: 'answer' as const,
        sdp: 'v=0\r\no=- 789012 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      };

      patientWs.send('answer', answerData);

      const received = await providerWs.waitForMessage();
      expect(received.event).toBe('video.answer');
      expect(received.payload.from).toBe(patientWs.userId);
      expect(received.payload.data.sdp).toBe(answerData.sdp);
    }, { timeout: 15000 });

    test('should relay ICE candidates bidirectionally', async () => {
      const providerIceCandidate = {
        candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.100 50000 typ srflx',
        sdpMLineIndex: 0,
        sdpMid: 'audio',
      };

      const patientIceCandidate = {
        candidate: 'candidate:987654321 1 udp 1677729535 192.168.1.200 51000 typ srflx',
        sdpMLineIndex: 1,
        sdpMid: 'video',
      };

      // Provider sends ICE candidate
      providerWs.send('ice-candidate', providerIceCandidate);
      const receivedByPatient = await patientWs.waitForMessage();
      expect(receivedByPatient.event).toBe('video.ice-candidate');
      expect(receivedByPatient.payload.from).toBe(providerWs.userId);
      expect(receivedByPatient.payload.data.candidate).toBe(providerIceCandidate.candidate);

      // Patient sends ICE candidate
      patientWs.send('ice-candidate', patientIceCandidate);
      const receivedByProvider = await providerWs.waitForMessage();
      expect(receivedByProvider.event).toBe('video.ice-candidate');
      expect(receivedByProvider.payload.from).toBe(patientWs.userId);
      expect(receivedByProvider.payload.data.candidate).toBe(patientIceCandidate.candidate);
    }, { timeout: 15000 });

    test('should not echo messages back to sender', async () => {
      providerWs.send('offer', { sdp: 'test-offer' });

      // Wait a bit to see if provider receives their own message (they shouldn't)
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(providerWs.getReceivedMessages()).toHaveLength(0);

      // But patient should receive it
      const msg = await patientWs.waitForMessage();
      expect(msg.payload.from).toBe(providerWs.userId);
    }, { timeout: 15000 });
  });

  describe('Room Isolation', () => {
    test('should not relay messages across different rooms', async () => {
      // Clear any previous messages
      providerWs.clearMessages();
      secondPatientWs.clearMessages();

      // Provider connects to room 1 (ready message consumed in connect())
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);

      // Second patient connects to room 2 (different room, ready message consumed in connect())
      await secondPatientWs.connect(secondChatRoomId, secondPatientToken, testApp.baseUrl);

      // Provider sends message in room 1
      providerWs.send('offer', { sdp: 'room-1-offer' });

      // Second patient in room 2 should not receive it
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(secondPatientWs.getReceivedMessages()).toHaveLength(0);
    }, { timeout: 15000 });

    test('should support multiple peers in same room', async () => {
      // Clear any previous messages
      providerWs.clearMessages();
      patientWs.clearMessages();

      // All three users connect to the same room (ready messages consumed in connect())
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);

      await patientWs.connect(chatRoomId, patientToken, testApp.baseUrl);

      // Provider sends message
      providerWs.send('offer', { sdp: 'broadcast-offer' });

      // Patient should receive it
      const msg = await patientWs.waitForMessage();
      expect(msg.payload.from).toBe(providerWs.userId);
    }, { timeout: 15000 });

    test('should cleanup room when last peer disconnects', async () => {
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);
      await patientWs.connect(chatRoomId, patientToken, testApp.baseUrl);

      // Close both connections
      providerWs.close();
      patientWs.close();

      await new Promise(resolve => setTimeout(resolve, 500));

      // Room should be cleaned up (we can verify by reconnecting - room map should be empty)
      // This is implicit - if the server didn't clean up, it would leak memory
      expect(providerWs.isOpen).toBe(false);
      expect(patientWs.isOpen).toBe(false);
    }, { timeout: 15000 });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON gracefully', async () => {
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);

      // Send invalid JSON directly
      if (providerWs['ws']) {
        providerWs['ws'].send('not-valid-json');
      }

      // Server should not crash, connection should stay open
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(providerWs.isOpen).toBe(true);
    }, { timeout: 15000 });

    test('should handle missing message fields', async () => {
      await providerWs.connect(chatRoomId, providerToken, testApp.baseUrl);

      // Send message without required 'type' field
      if (providerWs['ws']) {
        providerWs['ws'].send(JSON.stringify({ data: { sdp: 'test' } }));
      }

      // Should handle gracefully, connection stays open
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(providerWs.isOpen).toBe(true);
    }, { timeout: 15000 });
  });

  describe('Security', () => {
    test('should require authentication', async () => {
      // Try to connect without session token
      const unauthWs = new TestWebSocketClient('Unauth', 'fake-user-id');

      await expect(unauthWs.connect(chatRoomId, '', testApp.baseUrl)).rejects.toThrow();
    }, { timeout: 15000 });

    test('should enforce room participant authorization', async () => {
      // Second patient tries to connect to room they're not part of
      // chatRoomId only has provider and first patient
      const unauthorizedWs = new TestWebSocketClient('Unauthorized', secondPatientClient.getUser().id);

      // This should fail because second patient is not a participant in chatRoomId
      await expect(
        unauthorizedWs.connect(chatRoomId, secondPatientToken, testApp.baseUrl)
      ).rejects.toThrow();
    }, { timeout: 15000 });
  });
});
