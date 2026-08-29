import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
