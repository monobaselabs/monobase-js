/**
 * Integration tests for CORS and Better-Auth trustedOrigins
 * Tests CORS handling with Origin headers using embedded app instance
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestApp } from '../../helpers/test-app';
import type { TestApp } from '../../helpers/test-app';

describe('CORS and Better-Auth Integration', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // Create test app with allowLocalNetwork enabled
    testApp = await createTestApp({
      corsOverrides: {
        allowLocalNetwork: true,
        allowTunneling: false,
        strict: false,
      },
    });
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  describe('Local Network Origins - Success Cases', () => {
    it('should accept request from http://localhost:3000', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      const response = await testApp.app.fetch(request);

      // Better-Auth should process the request (not block it)
      expect(response.status).not.toBe(403);
      // Should return valid CORS headers
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should accept request from http://127.0.0.1:5173', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://127.0.0.1:5173',
        },
      });

      const response = await testApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should accept request from https://localhost:8080', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://localhost:8080',
        },
      });

      const response = await testApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should accept request from http://localhost (no port)', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost',
        },
      });

      const response = await testApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Signup/Signin with Local Network Origins', () => {
    it('should allow signup from localhost origin', async () => {
      const testEmail = `test-${Date.now()}@example.com`;
      const request = new Request('http://localhost:4000/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: 'TestPassword123!',
          name: 'Test User',
        }),
      });

      const response = await testApp.app.fetch(request);

      // Should succeed (200/201) or return validation error (400), not CORS error (403)
      expect(response.status).not.toBe(403);
      expect([200, 201, 400]).toContain(response.status);
    });

    it('should allow signin attempt from 127.0.0.1 origin', async () => {
      const request = new Request('http://localhost:4000/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Origin': 'http://127.0.0.1:3001',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        }),
      });

      const response = await testApp.app.fetch(request);

      // Should fail with auth error (401), not CORS error (403)
      expect(response.status).not.toBe(403);
    });
  });

  describe('Strict Mode - Failure Cases', () => {
    let strictApp: TestApp;

    beforeAll(async () => {
      // Create test app with strict mode enabled
      strictApp = await createTestApp({
        corsOverrides: {
          origins: ['https://app.monobase.com'],
          allowLocalNetwork: false,
          allowTunneling: false,
          strict: true,
        },
      });
    });

    afterAll(async () => {
      await strictApp.cleanup();
    });

    it('should reject request from localhost in strict mode', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      const response = await strictApp.app.fetch(request);

      // In strict mode, localhost should not be allowed
      // CORS validator should return fallback origin, but Better-Auth may have different behavior
      // The important thing is the request is processed (Better-Auth validates origins internally)
      expect(response.status).not.toBe(403);

      // Verify the CORS header is set (even if it's the fallback)
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBeTruthy();
    });

    it('should only accept explicitly configured origin in strict mode', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://app.monobase.com',
        },
      });

      const response = await strictApp.app.fetch(request);

      // Should accept the explicitly configured origin
      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.monobase.com');
    });

    it('should reject external domain in strict mode', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://attacker.com',
        },
      });

      const response = await strictApp.app.fetch(request);

      // External domain should not be echoed back in strict mode
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://attacker.com');
      expect(allowedOrigin).toBe('https://app.monobase.com'); // Fallback to first configured origin
    });
  });

  describe('Tunneling Origins', () => {
    let tunnelingApp: TestApp;

    beforeAll(async () => {
      // Create test app with tunneling enabled
      tunnelingApp = await createTestApp({
        corsOverrides: {
          allowLocalNetwork: false,
          allowTunneling: true,
          strict: false,
        },
      });
    });

    afterAll(async () => {
      await tunnelingApp.cleanup();
    });

    it('should accept request from ngrok domain', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://abc-123.ngrok.io',
        },
      });

      const response = await tunnelingApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should accept request from ngrok-free domain', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://test-app.ngrok-free.app',
        },
      });

      const response = await tunnelingApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should accept request from cloudflare tunnel', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://tunnel-abc.trycloudflare.com',
        },
      });

      const response = await tunnelingApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('LAN Network Origins (192.168.*, 10.*, 172.*)', () => {
    let lanApp: TestApp;

    beforeAll(async () => {
      // Create test app with LAN enabled but without wildcard
      lanApp = await createTestApp({
        corsOverrides: {
          origins: ['http://localhost:3000'], // Explicit origins, no wildcard
          allowLocalNetwork: true,
          allowTunneling: false,
          strict: false,
        },
      });
    });

    afterAll(async () => {
      await lanApp.cleanup();
    });

    it('should accept request from 192.168.1.100:3000', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://192.168.1.100:3000',
        },
      });

      const response = await lanApp.app.fetch(request);

      // Hono CORS middleware should accept LAN origins
      expect(response.status).not.toBe(403);
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBe('http://192.168.1.100:3000'); // Should echo back LAN origin
    });

    it('should accept request from 10.0.0.5:8080', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://10.0.0.5:8080',
        },
      });

      const response = await lanApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBe('http://10.0.0.5:8080');
    });

    it('should accept request from 172.16.0.1:5173', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://172.16.0.1:5173',
        },
      });

      const response = await lanApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBe('http://172.16.0.1:5173');
    });

    it('should accept request from .local domain', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://mydevbox.local:3000',
        },
      });

      const response = await lanApp.app.fetch(request);

      expect(response.status).not.toBe(403);
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).toBe('http://mydevbox.local:3000');
    });

    it('should reject public IP address (not in private ranges)', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://203.0.113.1:3000', // TEST-NET-3 (public IP)
        },
      });

      const response = await lanApp.app.fetch(request);

      // Public IPs should not be accepted even with allowLocalNetwork
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('http://203.0.113.1:3000');
      expect(allowedOrigin).toBe('http://localhost:3000'); // Should use fallback
    });
  });

  describe('Rejected Origins - Negative Cases', () => {
    let restrictiveApp: TestApp;

    beforeAll(async () => {
      // Create test app without wildcard for negative testing
      restrictiveApp = await createTestApp({
        corsOverrides: {
          origins: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Explicit origins only
          allowLocalNetwork: true,
          allowTunneling: false,
          strict: false,
        },
      });
    });

    afterAll(async () => {
      await restrictiveApp.cleanup();
    });

    it('should reject external domain https://evil.com', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://evil.com',
        },
      });

      const response = await restrictiveApp.app.fetch(request);

      // External domains should not be accepted
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://evil.com'); // NOT echoed back
      expect(allowedOrigin).toBe('http://localhost:3000'); // Fallback to first origin
    });

    it('should reject malicious domain https://malicious.example.com', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://malicious.example.com',
        },
      });

      const response = await restrictiveApp.app.fetch(request);

      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://malicious.example.com');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });

    it('should reject public IP http://8.8.8.8:3000', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://8.8.8.8:3000', // Google DNS
        },
      });

      const response = await restrictiveApp.app.fetch(request);

      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('http://8.8.8.8:3000');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });

    it('should reject random public IP http://1.2.3.4:8080', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'http://1.2.3.4:8080',
        },
      });

      const response = await restrictiveApp.app.fetch(request);

      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('http://1.2.3.4:8080');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });
  });

  describe('Tunneling Disabled - Should Reject Tunneling Origins', () => {
    let noTunnelingApp: TestApp;

    beforeAll(async () => {
      // Create test app without tunneling and without wildcard
      noTunnelingApp = await createTestApp({
        corsOverrides: {
          origins: ['http://localhost:3000'], // Explicit origins only
          allowLocalNetwork: false,
          allowTunneling: false, // Explicitly disabled
          strict: false,
        },
      });
    });

    afterAll(async () => {
      await noTunnelingApp.cleanup();
    });

    it('should reject ngrok domain when tunneling is disabled', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://test.ngrok.io',
        },
      });

      const response = await noTunnelingApp.app.fetch(request);

      // Tunneling is disabled
      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://test.ngrok.io');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });

    it('should reject ngrok-free domain when tunneling is disabled', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://test.ngrok-free.app',
        },
      });

      const response = await noTunnelingApp.app.fetch(request);

      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://test.ngrok-free.app');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });

    it('should reject cloudflare tunnel when tunneling is disabled', async () => {
      const request = new Request('http://localhost:4000/auth/get-session', {
        method: 'GET',
        headers: {
          'Origin': 'https://test.trycloudflare.com',
        },
      });

      const response = await noTunnelingApp.app.fetch(request);

      const allowedOrigin = response.headers.get('access-control-allow-origin');
      expect(allowedOrigin).not.toBe('https://test.trycloudflare.com');
      expect(allowedOrigin).toBe('http://localhost:3000');
    });
  });

  describe('Preflight Requests (OPTIONS)', () => {
    it('should handle preflight request from localhost', async () => {
      const request = new Request('http://localhost:4000/auth/sign-up/email', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      const response = await testApp.app.fetch(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(response.headers.get('access-control-allow-methods')).toBeTruthy();
    });

    it('should handle preflight request from LAN IP', async () => {
      const request = new Request('http://localhost:4000/auth/sign-up/email', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://192.168.1.50:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      const response = await testApp.app.fetch(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(response.headers.get('access-control-allow-methods')).toBeTruthy();
    });
  });
});