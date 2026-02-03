import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'path';

const connectionString = process.env.DATABASE_URL || 'postgresql://nonotion:nonotion@localhost:5432/nonotion';
const migrationsFolder = path.resolve(process.cwd(), 'drizzle-pg');

async function runMigrations() {
  console.log('Connecting to PostgreSQL...');
  console.log('Connection URL:', connectionString.replace(/:[^:@]+@/, ':****@'));
  console.log('Migrations folder:', migrationsFolder);

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    console.log('Running migrations...');
    await migrate(db, { migrationsFolder });
    console.log('PostgreSQL migrations complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
