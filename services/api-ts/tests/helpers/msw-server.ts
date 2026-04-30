import { setupServer } from 'msw/node';
import { handlers, mswTestData } from './msw-handlers';

// Create MSW server instance
export const mswServer = setupServer(...handlers);

// Server lifecycle management
export function startMswServer() {
  mswServer.listen({
    onUnhandledRequest: 'bypass', // Allow unmocked requests to pass through
  });
}

export function stopMswServer() {
  mswServer.close();
}

export function resetMswServer() {
  mswServer.resetHandlers();
}

// Re-export test data for access in tests
export { mswTestData };