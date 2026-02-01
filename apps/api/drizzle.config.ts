import { defineConfig } from 'drizzle-kit';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '../../data');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(DATA_DIR, 'nonotion.db'),
  },
});
