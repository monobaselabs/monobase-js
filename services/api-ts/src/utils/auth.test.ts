/**
 * Unit tests for Better-Auth configuration and access control
 * Tests admin plugin, role definitions, and permission system
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ac, permissionStatements } from '@/utils/auth';

describe('Better-Auth Access Control', () => {
  describe('Permission Definitions', () => {
    it('should have correct patient permissions', () => {
      const patientPermissions = permissionStatements.patient;
      
      expect(patientPermissions).toContain('patient:read');
      expect(patientPermissions).toContain('patient:update');
      expect(patientPermissions).toContain('patient:consent:manage');
      expect(patientPermissions).toContain('communication:send');
      expect(patientPermissions).toContain('communication:read');
      expect(patientPermissions).toContain('file:upload');
      expect(patientPermissions).toContain('file:read');
    });

    it('should have correct provider permissions', () => {
      const providerPermissions = permissionStatements.provider;
      
      expect(providerPermissions).toContain('provider:read');
      expect(providerPermissions).toContain('provider:update');
      expect(providerPermissions).toContain('patient:read');
      expect(providerPermissions).toContain('patient:search');
      expect(providerPermissions).toContain('communication:send');
      expect(providerPermissions).toContain('communication:read');
      expect(providerPermissions).toContain('file:upload');
      expect(providerPermissions).toContain('file:read');
      expect(providerPermissions).toContain('file:download');
    });

    it('should have correct admin permissions', () => {
      const adminPermissions = permissionStatements.admin;
      
      expect(adminPermissions).toContain('admin:read');
      expect(adminPermissions).toContain('admin:update');
      expect(adminPermissions).toContain('patient:*');
      expect(adminPermissions).toContain('provider:*');
      expect(adminPermissions).toContain('communication:*');
      expect(adminPermissions).toContain('file:*');
      expect(adminPermissions).toContain('audit:read');
      expect(adminPermissions).toContain('system:manage');
      expect(adminPermissions).toContain('user:impersonate');
    });

    // Note: support and user roles are not defined in the access control statements
    // These are system roles checked directly in the middleware
  });

  describe('Permission Checking', () => {
    it('should check if a role has a specific permission', () => {
      // Patient should have file:read permission
      const hasPatientPermission = permissionStatements.patient.includes('file:read');
      expect(hasPatientPermission).toBe(true);

      // Patient should not have file:download permission
      const lacksDownloadPermission = !(permissionStatements.patient as readonly string[]).includes('file:download');
      expect(lacksDownloadPermission).toBe(true);

      // Provider should have file:download permission
      const hasProviderPermission = permissionStatements.provider.includes('file:download');
      expect(hasProviderPermission).toBe(true);
    });

    it('should allow admin to have wildcard permissions', () => {
      const adminPermissions = permissionStatements.admin;
      
      // Admin has wildcard permissions for resources
      expect(adminPermissions).toContain('patient:*');
      expect(adminPermissions).toContain('provider:*');
      
      // Admin also has specific permissions for clarity
      expect(adminPermissions).toContain('system:manage');
    });

    it('should distinguish between similar permissions', () => {
      // Patient can upload files
      expect(permissionStatements.patient).toContain('file:upload');

      // Provider can download files (more than patient)
      expect(permissionStatements.provider).toContain('file:download');

      // Patient cannot download files
      expect(permissionStatements.patient).not.toContain('file:download');
    });
  });

  describe('Role Hierarchy', () => {
    it('should have appropriate permissions for each role', () => {
      const patientPermCount = permissionStatements.patient.length;
      const providerPermCount = permissionStatements.provider.length;
      const adminPermCount = permissionStatements.admin.length;
      
      // Each role has permissions
      expect(patientPermCount).toBeGreaterThan(0);
      expect(providerPermCount).toBeGreaterThan(0);
      expect(adminPermCount).toBeGreaterThan(0);
      
      // Provider has more permissions than patient
      expect(providerPermCount).toBeGreaterThan(patientPermCount);
    });

    it('should have non-overlapping specialized permissions', () => {
      // Patient-specific permissions not in provider
      const patientOnly = (permissionStatements.patient as readonly string[]).filter(
        p => !(permissionStatements.provider as readonly string[]).includes(p)
      );

      // Provider-specific permissions not in patient
      const providerOnly = (permissionStatements.provider as readonly string[]).filter(
        p => !(permissionStatements.patient as readonly string[]).includes(p)
      );
      
      // Each role should have some unique permissions
      expect(patientOnly.length).toBeGreaterThan(0);
      expect(providerOnly.length).toBeGreaterThan(0);
      
      // Check specific unique permissions
      expect(patientOnly).toContain('patient:consent:manage');
      expect(providerOnly).toContain('provider:update');
      expect(providerOnly).toContain('file:download');
    });
  });

  describe('Permission Naming Conventions', () => {
    it('should follow resource:action naming pattern', () => {
      const allPermissions = [
        ...(permissionStatements.patient as readonly string[]),
        ...(permissionStatements.provider as readonly string[]),
        ...(permissionStatements.admin as readonly string[]),
      ].filter(p => p !== '*' && p.includes(':'));
      
      for (const permission of allPermissions) {
        // Should have at least one colon (can have nested like patient:consent:manage)
        const parts = permission.split(':');
        expect(parts.length).toBeGreaterThanOrEqual(2);
        
        // Should have non-empty parts
        parts.forEach(part => {
          expect(part.length).toBeGreaterThan(0);
        });
      }
    });

    it('should use consistent action verbs', () => {
      const commonActions = ['read', 'create', 'update', 'delete', 'manage', 'search', 'cancel', 'complete', 'send', 'upload', 'download', 'impersonate', '*'];
      const allPermissions = [
        ...(permissionStatements.patient as readonly string[]),
        ...(permissionStatements.provider as readonly string[]),
        ...(permissionStatements.admin as readonly string[]),
      ].filter(p => p.includes(':'));
      
      for (const permission of allPermissions) {
        const parts = permission.split(':');
        const action = parts[parts.length - 1]; // Last part is the action

        // Action should be a known verb or wildcard
        if (action) {
          const isKnownAction = commonActions.includes(action);
          expect(isKnownAction).toBe(true);
        }
      }
    });
  });
});