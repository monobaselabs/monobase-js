/**
 * Logger type definition
 * Centralized type for logger instances across the codebase
 */

import type { Logger as PinoLogger } from 'pino';

/**
 * Re-export pino's Logger type for use across the codebase
 * This provides a single source of truth and abstraction layer
 */
export type Logger = PinoLogger;