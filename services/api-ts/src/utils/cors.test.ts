/**
 * Tests for CORS configuration utilities
 * Validates dynamic origin validation and config-driven behavior
 */

import { describe, it, expect } from 'bun:test';
import { createOriginValidator, createTrustedOriginsList, determineCookieConfig } from '@/utils/cors';
import type { Config } from '@/core/config';

describe('CORS Configuration', () => {
  const mockContext = {} as any; // Mock Hono context

  describe('createOriginValidator', () => {
    it('should allow explicit origins', () => {
      const config: Config['cors'] = {
        origins: ['https://app.example.com', 'https://admin.example.com'],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: false,
        strict: false,
      };

      const validator = createOriginValidator(config);

      expect(validator('https://app.example.com', mockContext)).toBe('https://app.example.com');
      expect(validator('https://admin.example.com', mockContext)).toBe('https://admin.example.com');
      expect(validator('https://malicious.com', mockContext)).toBe('https://app.example.com');
    });

    it('should allow localhost when allowLocalNetwork is enabled', () => {
      const config: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: true,
        allowTunneling: false,
        strict: false,
      };

      const validator = createOriginValidator(config);

      expect(validator('http://localhost:3000', mockContext)).toBe('http://localhost:3000');
      expect(validator('http://127.0.0.1:5173', mockContext)).toBe('http://127.0.0.1:5173');
      expect(validator('http://192.168.1.100:3000', mockContext)).toBe('http://192.168.1.100:3000');
      expect(validator('http://app.local:8080', mockContext)).toBe('http://app.local:8080');
    });

    it('should allow tunneling services when allowTunneling is enabled', () => {
      const config: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: true,
        strict: false,
      };

      const validator = createOriginValidator(config);

      expect(validator('https://abc123.ngrok.io', mockContext)).toBe('https://abc123.ngrok.io');
      expect(validator('https://test.ngrok-free.app', mockContext)).toBe('https://test.ngrok-free.app');
      expect(validator('https://demo.loca.lt', mockContext)).toBe('https://demo.loca.lt');
      expect(validator('https://app.trycloudflare.com', mockContext)).toBe('https://app.trycloudflare.com');
    });

    it('should work in strict mode with only explicit origins', () => {
      const config: Config['cors'] = {
        origins: ['https://app.example.com'],
        credentials: true,
        allowLocalNetwork: true,
        allowTunneling: true,
        strict: true,
      };

      const validator = createOriginValidator(config);

      expect(validator('https://app.example.com', mockContext)).toBe('https://app.example.com');
      expect(validator('http://localhost:3000', mockContext)).toBe('https://app.example.com');
      expect(validator('https://test.ngrok.io', mockContext)).toBe('https://app.example.com');
    });

    it('should handle wildcard origins', () => {
      const config: Config['cors'] = {
        origins: ['*'],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: false,
        strict: false,
      };

      const validator = createOriginValidator(config);

      expect(validator('https://any-domain.com', mockContext)).toBe('https://any-domain.com');
      expect(validator('http://localhost:3000', mockContext)).toBe('http://localhost:3000');
    });
  });

  describe('createTrustedOriginsList', () => {
    it('should include explicit origins', () => {
      const config: Config['cors'] = {
        origins: ['https://app.example.com'],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: false,
        strict: false,
      };

      const list = createTrustedOriginsList(config);

      expect(list).toContain('https://app.example.com');
    });

    it('should add localhost patterns when allowLocalNetwork is enabled', () => {
      const config: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: true,
        allowTunneling: false,
        strict: false,
      };

      const list = createTrustedOriginsList(config);

      expect(list).toContain('http://localhost');
      expect(list).toContain('http://localhost:3000');
      expect(list).toContain('https://localhost:5173');
    });

    it('should add wildcard patterns for tunneling when allowTunneling is enabled', () => {
      const config: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: true,
        strict: false,
      };

      const list = createTrustedOriginsList(config);

      // Should contain wildcard patterns for tunneling services (not RegExp)
      expect(list).toContain('https://*.ngrok.io');
      expect(list).toContain('https://*.ngrok-free.app');
      expect(list).toContain('https://*.loca.lt');
      expect(list).toContain('https://*.trycloudflare.com');
      expect(list).toContain('https://*.localhost.run');
    });

    it('should return only explicit origins in strict mode', () => {
      const config: Config['cors'] = {
        origins: ['https://app.example.com'],
        credentials: true,
        allowLocalNetwork: true,
        allowTunneling: true,
        strict: true,
      };

      const list = createTrustedOriginsList(config);

      expect(list).toEqual(['https://app.example.com']);
    });
  });

  describe('determineCookieConfig', () => {
    it('should use explicit auth config when provided', () => {
      const corsConfig: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: false,
        strict: true,
      };
      const authConfig: Config['auth'] = {
        cookieSameSite: 'none',
        secureCookies: true,
      } as any;

      const cookieConfig = determineCookieConfig(corsConfig, authConfig);

      expect(cookieConfig.sameSite).toBe('none');
      expect(cookieConfig.secure).toBe(true);
    });

    it('should use lax settings for strict mode', () => {
      const corsConfig: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: false,
        strict: true,
      };
      const authConfig: Config['auth'] = {} as any;

      const cookieConfig = determineCookieConfig(corsConfig, authConfig);

      expect(cookieConfig.sameSite).toBe('lax');
    });

    it('should use permissive settings for cross-origin scenarios', () => {
      const corsConfig: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: true,
        allowTunneling: false,
        strict: false,
      };
      const authConfig: Config['auth'] = {} as any;

      const cookieConfig = determineCookieConfig(corsConfig, authConfig);

      expect(cookieConfig.sameSite).toBe('none');
      expect(cookieConfig.secure).toBe(false);
    });

    it('should require secure cookies for tunneling (HTTPS)', () => {
      const corsConfig: Config['cors'] = {
        origins: [],
        credentials: true,
        allowLocalNetwork: false,
        allowTunneling: true,
        strict: false,
      };
      const authConfig: Config['auth'] = {} as any;

      const cookieConfig = determineCookieConfig(corsConfig, authConfig);

      expect(cookieConfig.sameSite).toBe('none');
      expect(cookieConfig.secure).toBe(true);
    });
  });
});