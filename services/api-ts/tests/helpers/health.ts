/**
 * Health Check E2E Test Helpers
 * Utilities for testing Kubernetes-compliant health check endpoints
 */

import { expect } from 'bun:test';
import type { ApiClient } from './client';
import type { paths } from '@monobase/api-spec';

// Export types from the OpenAPI spec for easy access
export type HealthResponse = paths['/readyz']['get']['responses']['200']['content']['application/json'];

// Custom helper types for test results
export interface LivenessTestResult {
  response: Response;
  data: string | HealthResponse;
}

export interface ReadinessTestResult {
  response: Response;
  data: string | HealthResponse;
}

/**
 * Test liveness endpoint with basic text response
 */
export async function testLiveness(client: ApiClient): Promise<LivenessTestResult> {
  const response = await client.fetch('/livez');
  const contentType = response.headers.get('content-type') || '';
  
  let data: string | HealthResponse;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  
  return { response, data };
}

/**
 * Test liveness endpoint with verbose JSON response
 */
export async function testLivenessVerbose(client: ApiClient): Promise<LivenessTestResult> {
  const response = await client.fetch('/livez', {
    searchParams: { verbose: 'true' }
  });
  const data = await response.json() as HealthResponse;
  
  return { response, data };
}

/**
 * Test readiness endpoint with basic text response
 */
export async function testReadiness(client: ApiClient): Promise<ReadinessTestResult> {
  const response = await client.fetch('/readyz');
  const contentType = response.headers.get('content-type') || '';
  
  let data: string | HealthResponse;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  
  return { response, data };
}

/**
 * Test readiness endpoint with verbose JSON response
 */
export async function testReadinessVerbose(client: ApiClient): Promise<ReadinessTestResult> {
  const response = await client.fetch('/readyz', {
    searchParams: { verbose: 'true' }
  });
  const data = await response.json() as HealthResponse;
  
  return { response, data };
}

/**
 * Wait for all services to become healthy (useful for test setup)
 */
export async function waitForServicesHealthy(
  client: ApiClient,
  maxRetries: number = 30,
  retryInterval: number = 1000
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { response } = await testReadiness(client);
      if (response.ok) {
        return; // All services are healthy
      }
    } catch (error) {
      // Ignore network errors, continue retrying
    }
    
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  
  throw new Error(`Services did not become healthy within ${maxRetries} attempts`);
}

/**
 * Validate basic liveness response format
 */
export function validateLivenessResponse(result: LivenessTestResult): void {
  const { response, data } = result;
  
  expect(response.status).toBe(200);
  
  if (typeof data === 'string') {
    // Basic text response
    expect(data).toBe('ok');
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/); // Allow charset parameter
  } else {
    // Verbose JSON response
    expect(response.headers.get('content-type')).toBe('application/health+json');
    expect(data.status).toBe('pass');
    expect(data.timestamp).toBeDefined();
    expect(data.checks).toBeDefined();
    expect(data.checks.ping).toBe('pass');
  }
}

/**
 * Validate basic readiness response format
 */
export function validateReadinessResponse(result: ReadinessTestResult): void {
  const { response, data } = result;
  
  if (typeof data === 'string') {
    // Basic text response
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/); // Allow charset parameter
    
    if (response.ok) {
      expect(response.status).toBe(200);
      expect(data).toBe('ok');
    } else {
      expect(response.status).toBe(503);
      expect(data).toBe('failed');
    }
  } else {
    // Verbose JSON response
    expect(response.headers.get('content-type')).toBe('application/health+json');
    expect(data.status).toBeOneOf(['pass', 'fail']);
    expect(data.timestamp).toBeDefined();
    expect(data.checks).toBeDefined();
    
    // Validate required service checks
    expect(data.checks.database).toBeOneOf(['pass', 'fail']);
    expect(data.checks.storage).toBeOneOf(['pass', 'fail']);
    expect(data.checks.jobs).toBeOneOf(['pass', 'fail']);
    
    if (response.ok) {
      expect(response.status).toBe(200);
      expect(data.status).toBe('pass');
    } else {
      expect(response.status).toBe(503);
      expect(data.status).toBe('fail');
    }
  }
}

/**
 * Validate RFC-compliant health check JSON response
 */
export function validateHealthCheckRFC(data: HealthResponse): void {
  // RFC health check format validation
  expect(data).toHaveProperty('status');
  expect(data.status).toBeOneOf(['pass', 'fail']);
  
  expect(data).toHaveProperty('timestamp');
  expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  
  expect(data).toHaveProperty('checks');
  expect(typeof data.checks).toBe('object');
  
  // All check values should be 'pass' or 'fail'
  Object.values(data.checks).forEach(status => {
    expect(status).toBeOneOf(['pass', 'fail']);
  });
}

/**
 * Validate that all services are healthy in verbose response
 */
export function validateAllServicesHealthy(data: HealthResponse): void {
  expect(data.status).toBe('pass');
  expect(data.checks.database).toBe('pass');
  expect(data.checks.storage).toBe('pass');
  expect(data.checks.jobs).toBe('pass');
}

/**
 * Validate Kubernetes-compliant response headers
 */
export function validateKubernetesCompliantHeaders(response: Response, isVerbose: boolean = false): void {
  if (isVerbose) {
    expect(response.headers.get('content-type')).toBe('application/health+json');
  } else {
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/); // Allow charset parameter
  }
  
  // Ensure no caching headers that could interfere with health checks
  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    expect(cacheControl).toContain('no-cache');
  }
}

/**
 * Test various verbose parameter formats
 */
export async function testVerboseParameterVariations(
  client: ApiClient, 
  endpoint: '/livez' | '/readyz'
): Promise<void> {
  const variations = [
    'true',
    '1', 
    'yes',
    'on',
    ''  // Just presence of parameter
  ];
  
  for (const value of variations) {
    const response = await client.fetch(endpoint, {
      searchParams: { verbose: value }
    });
    
    // All variations should trigger verbose JSON response
    expect(response.headers.get('content-type')).toBe('application/health+json');
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('checks');
  }
}

/**
 * Generate test data for edge case scenarios
 */
export function generateHealthTestScenarios() {
  return {
    validVerboseParams: ['true', '1', 'yes', 'on', ''],
    invalidVerboseParams: ['false', '0', 'no', 'off'],
    malformedParams: ['<script>', '../../etc/passwd', 'null', 'undefined']
  };
}

/**
 * Measure response time for performance validation
 */
export async function measureHealthCheckPerformance(
  client: ApiClient,
  endpoint: '/livez' | '/readyz',
  iterations: number = 5
): Promise<{ average: number; min: number; max: number }> {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await client.fetch(endpoint);
    const end = performance.now();
    times.push(end - start);
  }
  
  return {
    average: times.reduce((sum, time) => sum + time, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times)
  };
}