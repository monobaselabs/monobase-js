import { defineConfig } from 'drizzle-kit';
import { parseConfig } from './src/core/config';

const config = parseConfig();

export default defineConfig({
  schema: './src/**/*schema.ts',
  out: './src/generated/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.database.url,
  },
  verbose: true,
  strict: true,
});
