// Vercel serverless function entry point
// Vercel auto-detects files in api/ as serverless functions.
// The actual server is built by tsc into dist/; this re-exports the handler.
export { default } from '../dist/index.js';
