import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';
import path from 'path';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

console.log('Running migrations from:', migrationsFolder);
migrate(db, { migrationsFolder });
console.log('Migrations complete!');
