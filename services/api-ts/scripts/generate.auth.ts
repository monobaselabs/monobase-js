import { parseConfig } from '@/core/config';
import { createDatabase } from '@/core/database';
import { createAuth } from '@/core/auth';

const config = parseConfig();
const database = createDatabase(config.database);
export const auth = createAuth(database, config, undefined, {} as any);
