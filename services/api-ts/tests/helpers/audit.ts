/**
 * Test helper functions for audit module
 * Provides utilities for querying audit logs in tests
 */

import type { ApiClient } from './client';

/**
 * List audit logs with filtering and pagination
 */
export async function listAuditLogs(
  apiClient: ApiClient,
  filters?: {
    resourceType?: string;
    resource?: string;
    user?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
) {
  const response = await apiClient.fetch('/audit/logs', {
    searchParams: filters as any
  });

  const data = response.ok ? await response.json() : null;

  return {
    response,
    data
  };
}

/**
 * Wait for an audit log to appear (useful for testing async audit logging)
 */
export async function waitForAuditLog(
  apiClient: ApiClient,
  predicate: (log: any) => boolean,
  options: {
    maxAttempts?: number;
    delayMs?: number;
  } = {}
): Promise<any | null> {
  const maxAttempts = options.maxAttempts || 10;
  const delayMs = options.delayMs || 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await listAuditLogs(apiClient);

    if (data?.data) {
      const log = data.data.find(predicate);
      if (log) {
        return log;
      }
    }

    // Wait before next attempt
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return null;
}
