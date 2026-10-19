import path from 'node:path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load the repo-root .env no matter which directory the process was started from,
// then allow a closer .env (e.g. apps/backend/.env) to override individual keys.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});
