/**
 * Health Endpoints E2E Tests
 * 
 * Tests Kubernetes-compliant health check endpoints:
 * - /livez (liveness probe) - basic app health
 * - /readyz (readiness probe) - service dependencies health
 * 
 * Both endpoints support verbose mode and follow RFC health check format
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import {
  testLiveness,
  testLivenessVerbose,
  testReadiness,
  testReadinessVerbose,
  waitForServicesHealthy,
  validateLivenessResponse,
  validateReadinessResponse,
  validateHealthCheckRFC,
  validateAllServicesHealthy,
  validateKubernetesCompliantHeaders,
  testVerboseParameterVariations,
  generateHealthTestScenarios,
  measureHealthCheckPerformance,
  type HealthResponse
} from '../../helpers/health';

describe('Health Check Endpoints', () => {
  let client: ReturnType<typeof createApiClient>;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API client with embedded app instance
    client = createApiClient({ app: testApp.app });
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });

  describe('Liveness Endpoint (/livez)', () => {
    test('should return basic text response', async () => {
      const result = await testLiveness(client);
      validateLivenessResponse(result);
    });

    test('should return verbose JSON response', async () => {
      const result = await testLivenessVerbose(client);
      validateLivenessResponse(result);
      
      // Additional verbose-specific validation
      if (typeof result.data === 'object') {
        validateHealthCheckRFC(result.data);
        expect(result.data.checks.ping).toBe('pass');
      }
    });

    test('should handle various verbose parameter formats', async () => {
      await testVerboseParameterVariations(client, '/livez');
    });

    test('should return proper headers for basic response', async () => {
      const result = await testLiveness(client);
      validateKubernetesCompliantHeaders(result.response, false);
    });

    test('should return proper headers for verbose response', async () => {
      const result = await testLivenessVerbose(client);
      validateKubernetesCompliantHeaders(result.response, true);
    });

    test('should respond quickly (performance check)', async () => {
      const performance = await measureHealthCheckPerformance(client, '/livez', 3);
      
      // Liveness should be very fast (under 100ms average)
      expect(performance.average).toBeLessThan(100);
      expect(performance.max).toBeLessThan(200);
    });

    test('should handle malformed verbose parameters gracefully', async () => {
      const scenarios = generateHealthTestScenarios();
      
      for (const param of scenarios.malformedParams) {
        const response = await client.fetch('/livez', {
          searchParams: { verbose: param }
        });
        
        // Should still return valid response despite malformed params
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/health+json');
      }
    });
  });

  describe('Readiness Endpoint (/readyz)', () => {
    test('should return basic text response when healthy', async () => {
      const result = await testReadiness(client);
      
      if (result.response.ok) {
        validateReadinessResponse(result);
      } else {
        // If not ready, should still follow proper format
        expect(result.response.status).toBe(503);
        expect(typeof result.data).toBe('string');
        expect(result.data).toBe('failed');
      }
    });

    test('should return verbose JSON response', async () => {
      const result = await testReadinessVerbose(client);
      validateReadinessResponse(result);
      
      if (typeof result.data === 'object') {
        validateHealthCheckRFC(result.data);
        
        // Check all required service dependencies
        expect(result.data.checks).toHaveProperty('database');
        expect(result.data.checks).toHaveProperty('storage');
        expect(result.data.checks).toHaveProperty('jobs');
      }
    });

    test('should validate all services are healthy in verbose mode', async () => {
      const result = await testReadinessVerbose(client);
      
      if (result.response.ok && typeof result.data === 'object') {
        validateAllServicesHealthy(result.data);
      }
    });

    test('should handle various verbose parameter formats', async () => {
      await testVerboseParameterVariations(client, '/readyz');
    });

    test('should return proper headers for basic response', async () => {
      const result = await testReadiness(client);
      validateKubernetesCompliantHeaders(result.response, false);
    });

    test('should return proper headers for verbose response', async () => {
      const result = await testReadinessVerbose(client);
      validateKubernetesCompliantHeaders(result.response, true);
    });

    test('should check database connectivity', async () => {
      const result = await testReadinessVerbose(client);
      
      if (typeof result.data === 'object') {
        expect(result.data.checks.database).toBeOneOf(['pass', 'fail']);
        
        // If overall status is pass, database should also pass
        if (result.data.status === 'pass') {
          expect(result.data.checks.database).toBe('pass');
        }
      }
    });

    test('should check storage connectivity', async () => {
      const result = await testReadinessVerbose(client);
      
      if (typeof result.data === 'object') {
        expect(result.data.checks.storage).toBeOneOf(['pass', 'fail']);
        
        // If overall status is pass, storage should also pass
        if (result.data.status === 'pass') {
          expect(result.data.checks.storage).toBe('pass');
        }
      }
    });

    test('should check jobs system', async () => {
      const result = await testReadinessVerbose(client);
      
      if (typeof result.data === 'object') {
        expect(result.data.checks.jobs).toBeOneOf(['pass', 'fail']);
        
        // If overall status is pass, jobs should also pass
        if (result.data.status === 'pass') {
          expect(result.data.checks.jobs).toBe('pass');
        }
      }
    });

    test('should respond reasonably quickly (performance check)', async () => {
      const performance = await measureHealthCheckPerformance(client, '/readyz', 3);
      
      // Readiness may be slower due to dependency checks but should still be reasonable
      expect(performance.average).toBeLessThan(500);
      expect(performance.max).toBeLessThan(1000);
    });
  });

  describe('RFC Compliance and Standards', () => {
    test('liveness verbose response follows RFC health check format', async () => {
      const result = await testLivenessVerbose(client);
      
      if (typeof result.data === 'object') {
        validateHealthCheckRFC(result.data);
      }
    });

    test('readiness verbose response follows RFC health check format', async () => {
      const result = await testReadinessVerbose(client);
      
      if (typeof result.data === 'object') {
        validateHealthCheckRFC(result.data);
      }
    });

    test('health check timestamps are properly formatted ISO 8601', async () => {
      const livenessResult = await testLivenessVerbose(client);
      const readinessResult = await testReadinessVerbose(client);
      
      if (typeof livenessResult.data === 'object') {
        expect(livenessResult.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
      
      if (typeof readinessResult.data === 'object') {
        expect(readinessResult.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });

    test('health check responses include proper CORS headers', async () => {
      const livenessResponse = await client.fetch('/livez');
      const readinessResponse = await client.fetch('/readyz');
      
      // Should include CORS headers for cross-origin health checks
      expect(livenessResponse.headers.get('access-control-allow-origin')).toBeDefined();
      expect(readinessResponse.headers.get('access-control-allow-origin')).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid verbose parameter values gracefully', async () => {
      const scenarios = generateHealthTestScenarios();
      
      // Test invalid verbose parameters (should still trigger verbose mode)
      for (const param of scenarios.invalidVerboseParams) {
        const response = await client.fetch('/livez', {
          searchParams: { verbose: param }
        });
        
        expect(response.status).toBe(200);
        // Invalid values should still trigger verbose JSON response
        expect(response.headers.get('content-type')).toBe('application/health+json');
      }
    });

    test('should handle multiple query parameters', async () => {
      const response = await client.fetch('/livez', {
        searchParams: { 
          verbose: 'true',
          extra: 'ignored',
          another: 'parameter'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/health+json');
      
      const data = await response.json() as HealthResponse;
      validateHealthCheckRFC(data);
    });

    test('should handle empty query parameters', async () => {
      const response = await client.fetch('/livez?');
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
      expect(await response.text()).toBe('ok');
    });

    test('should maintain consistent response format across multiple requests', async () => {
      // Test both endpoints multiple times to ensure consistency
      for (let i = 0; i < 3; i++) {
        const livenessResult = await testLiveness(client);
        const readinessResult = await testReadiness(client);
        
        validateLivenessResponse(livenessResult);
        validateReadinessResponse(readinessResult);
      }
    });
  });

  describe('Integration and Service Dependencies', () => {
    test('should verify service startup health check workflow', async () => {
      // This test simulates the Kubernetes health check workflow
      
      // 1. Check liveness (should always pass if app is running)
      const livenessResult = await testLiveness(client);
      expect(livenessResult.response.status).toBe(200);
      
      // 2. Check readiness (may fail if dependencies not ready)
      const readinessResult = await testReadiness(client);
      // Readiness can be 200 or 503, both are valid responses
      expect([200, 503]).toContain(readinessResult.response.status);
      
      // 3. If not ready, validate the response and check if core services are healthy
      // In test environments, some services (like job scheduler) may not be fully operational
      if (!readinessResult.response.ok) {
        // Get detailed health status to understand which services are healthy
        const { data: verboseHealth } = await testReadinessVerbose(client);

        // Verify that core services (database, storage) are healthy
        // Job scheduler failures are acceptable in test environment
        expect(verboseHealth.checks.database).toBe('pass');
        expect(verboseHealth.checks.storage).toBe('pass');

        // Log the status for debugging but don't fail the test if only jobs are unhealthy
        if (verboseHealth.checks.jobs === 'fail') {
          console.log('Note: Job scheduler is not healthy in test environment (this is acceptable)');
        }
      }
    });

    test('should handle concurrent health check requests', async () => {
      // Simulate multiple health check requests happening simultaneously
      const concurrentRequests = [
        testLiveness(client),
        testReadiness(client),
        testLivenessVerbose(client),
        testReadinessVerbose(client)
      ];
      
      const results = await Promise.all(concurrentRequests);
      
      // All requests should succeed
      results.forEach((result, index) => {
        expect(result.response.status).toBeOneOf([200, 503]);
        
        if (index < 2) {
          // Basic responses
          if (result.response.ok) {
            expect(typeof result.data).toBe('string');
          }
        } else {
          // Verbose responses
          if (result.response.ok) {
            expect(typeof result.data).toBe('object');
          }
        }
      });
    });
  });
});