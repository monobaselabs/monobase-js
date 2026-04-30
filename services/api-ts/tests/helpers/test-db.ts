/**
 * Test Database Helpers
 * Single source of truth for all database operations in tests
 */

import { nanoid } from 'nanoid';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import path from 'path';
import { readdir, readFile } from 'fs/promises';

/**
 * Database schema interface for tests
 */
export interface TestDatabase {
  url: string;
  schemaName: string;
  connection: Sql;
  cleanup: () => Promise<void>;
}

/**
 * Generate connection string with unique schema name
 */
export function getConnectionString(schema = nanoid()): { url: string; schemaName: string } {
  // Use environment variable or default to local PostgreSQL
  const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/monobase';

  // Each test gets a unique schema name for isolation
  const testRunId = Date.now().toString(36);
  const schemaName = `test_${testRunId}_${schema}`;

  return { url: baseUrl, schemaName };
}

/**
 * Create a test database connection
 * Uses environment variables or defaults
 */
export function createTestConnection(databaseUrl?: string): Sql {
  const url = databaseUrl || process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/monobase';

  return postgres(url, {
    max: 10,
    transform: {
      ...postgres.camel,
      undefined: null
    }
  });
}

/**
 * Create a test database with isolated schema
 * This is the main entry point for test database setup
 */
export async function createTestSchema(): Promise<TestDatabase> {
  const { url, schemaName } = getConnectionString();

  // Create connection to database
  const connection = createTestConnection(url);

  try {
    // Create isolated schema (use identifier for proper quoting)
    await connection.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Set search path to use the isolated schema
    await connection.unsafe(`SET search_path TO "${schemaName}", public`);

    // Run migrations in the schema
    await runMigrationsInSchema(connection, schemaName);

    return {
      url,
      schemaName,
      connection,
      cleanup: async () => {
        try {
          // Drop the schema and all its contents
          await connection.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await connection.end();
        } catch (error) {
          console.warn(`Warning: Failed to cleanup schema ${schemaName}:`, error);
        }
      }
    };
  } catch (error) {
    await connection.end();
    throw error;
  }
}

/**
 * Run database migrations in isolated schema
 * Uses Drizzle migrations with schema name substitution
 * Enhanced with enum race condition handling
 */
export async function runMigrationsInSchema(connection: Sql, schemaName: string): Promise<void> {
  // Set search path to schema (use unsafe for proper quoting)
  await connection.unsafe(`SET search_path TO "${schemaName}", public`);

  // Get migrations directory path - relative to services/api
  const migrationsDir = path.join(__dirname, '..', '..', 'src', 'generated', 'migrations');

  try {
    // Read all SQL migration files
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    // Create a tracking table for migrations if it doesn't exist
    await connection`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash VARCHAR(256) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Check which migrations have already been applied
    const appliedMigrations = await connection`
      SELECT hash FROM __drizzle_migrations
    `;
    const appliedHashes = new Set(appliedMigrations.map(m => m.hash));

    // Apply each migration with retry logic for enum conflicts
    for (const file of sqlFiles) {
      const migrationName = file.replace('.sql', '');

      // Skip if already applied
      if (appliedHashes.has(migrationName)) {
        continue;
      }

      // Read migration SQL
      const sqlPath = path.join(migrationsDir, file);
      let sql = await readFile(sqlPath, 'utf-8');

      // Replace "public" schema references with our test schema
      // This handles CREATE TYPE "public".xxx and other schema-qualified objects
      sql = sql.replace(/"public"\./g, `"${schemaName}".`);

      // Split by statement breakpoint and execute each statement
      const statements = sql.split('--> statement-breakpoint').filter(s => s.trim());

      await executeMigrationStatementsWithRetry(connection, statements, schemaName);

      // Record that this migration has been applied
      await connection`
        INSERT INTO __drizzle_migrations (hash) VALUES (${migrationName})
      `;
    }

    // Ensure search path is set for the session
    await connection.unsafe(`SET search_path TO "${schemaName}", public`);

  } catch (error) {
    console.error(`Failed to run migrations in schema ${schemaName}:`, error);
    throw error;
  }
}

/**
 * Execute migration statements with retry logic for enum race conditions
 */
async function executeMigrationStatementsWithRetry(
  connection: Sql,
  statements: string[],
  schemaName: string,
  maxRetries = 3
): Promise<void> {
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;

    let lastError: any;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        // Use unsafe to execute raw SQL with schema replacements
        await connection.unsafe(trimmed);
        break; // Success, move to next statement
      } catch (error: any) {
        lastError = error;
        attempts++;

        // Check if this is an enum-related race condition error
        const isEnumConflict = error.message?.includes('already exists') &&
                              (trimmed.includes('CREATE TYPE') || trimmed.includes('CREATE ENUM'));

        if (isEnumConflict && attempts < maxRetries) {
          // Add exponential backoff for enum conflicts
          const delay = Math.pow(2, attempts) * 100 + Math.random() * 100;
          console.warn(`Enum conflict detected in schema ${schemaName}, retrying in ${delay}ms (attempt ${attempts}/${maxRetries}):`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Check if this is a "does not exist" error that can be ignored
        const isSafeToIgnore = error.message?.includes('does not exist') &&
                              (trimmed.includes('DROP TYPE') || trimmed.includes('DROP ENUM'));

        if (isSafeToIgnore) {
          console.warn(`Ignoring safe error in schema ${schemaName}:`, error.message);
          break; // Ignore and continue
        }

        // For other errors, retry once more then throw
        if (attempts >= maxRetries) {
          console.error(`Failed to execute statement in schema ${schemaName} after ${maxRetries} attempts:`, {
            statement: trimmed.substring(0, 200) + (trimmed.length > 200 ? '...' : ''),
            error: error.message,
            schemaName,
            attempts
          });
          throw error;
        }

        // General retry with smaller delay
        const delay = 50 + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

/**
 * Clear all data from a schema (for test cleanup)
 */
export async function clearSchema(connection: Sql, schemaName: string): Promise<void> {
  // Get all tables in the schema
  const tables = await connection`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = ${schemaName}
  `;

  // Disable foreign key checks and truncate all tables
  if (tables.length > 0) {
    await connection`SET search_path TO ${connection(schemaName)}`;

    for (const table of tables) {
      await connection`TRUNCATE TABLE ${connection(table.tablename)} CASCADE`;
    }
  }
}

/**
 * Drop a test schema completely
 */
export async function dropSchema(connection: Sql, schemaName: string): Promise<void> {
  await connection`DROP SCHEMA IF EXISTS ${connection(schemaName)} CASCADE`;
}

/**
 * Check if a schema exists
 */
export async function schemaExists(connection: Sql, schemaName: string): Promise<boolean> {
  const result = await connection`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = ${schemaName}
    ) as exists
  `;

  return result[0].exists;
}

/**
 * Wait for database to be ready
 */
export async function waitForDatabase(
  databaseUrl?: string,
  maxRetries = 30,
  delayMs = 1000
): Promise<void> {
  const url = databaseUrl || process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/monobase';

  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = postgres(url, {
        max: 1,
        timeout: 5
      });

      await connection`SELECT 1`;
      await connection.end();
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw new Error(`Database not ready after ${maxRetries} attempts: ${error}`);
      }
    }
  }
}

/**
 * Create test data helpers
 */
export const testData = {
  /**
   * Create a test user
   */
  async createUser(connection: Sql, data: {
    email: string;
    name?: string;
    passwordHash?: string;
  }) {
    const result = await connection`
      INSERT INTO users (email, name, password_hash)
      VALUES (${data.email}, ${data.name || null}, ${data.passwordHash || 'hashed_password'})
      RETURNING *
    `;
    return result[0];
  },

  /**
   * Create a test patient
   */
  async createPatient(connection: Sql, data: {
    userId?: number;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date;
    medicalRecordNumber?: string;
  }) {
    const result = await connection`
      INSERT INTO patients (
        user_id,
        first_name,
        last_name,
        date_of_birth,
        medical_record_number
      )
      VALUES (
        ${data.userId || null},
        ${data.firstName},
        ${data.lastName},
        ${data.dateOfBirth || null},
        ${data.medicalRecordNumber || `MRN-${Date.now()}`}
      )
      RETURNING *
    `;
    return result[0];
  },

  /**
   * Create a test provider
   */
  async createProvider(connection: Sql, data: {
    userId?: number;
    firstName: string;
    lastName: string;
    specialty?: string;
    licenseNumber?: string;
  }) {
    const result = await connection`
      INSERT INTO providers (
        user_id,
        first_name,
        last_name,
        specialty,
        license_number
      )
      VALUES (
        ${data.userId || null},
        ${data.firstName},
        ${data.lastName},
        ${data.specialty || 'General Practice'},
        ${data.licenseNumber || `LIC-${Date.now()}`}
      )
      RETURNING *
    `;
    return result[0];
  }
};

/**
 * Transaction helper for tests
 */
export async function withTransaction<T>(
  connection: Sql,
  callback: (tx: Sql) => Promise<T>
): Promise<T> {
  return connection.begin(async (tx) => {
    return callback(tx);
  });
}

/**
 * Helper to run raw SQL file (for migrations)
 */
export async function runSqlFile(connection: Sql, filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  const sql = await fs.readFile(filePath, 'utf-8');

  // Split by semicolons and execute each statement
  const statements = sql.split(';').filter(s => s.trim());

  for (const statement of statements) {
    await connection.unsafe(statement);
  }
}