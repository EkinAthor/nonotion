import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/pg-schema.ts',
  out: './drizzle-pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://nonotion:nonotion@localhost:5432/nonotion',
  },
});
