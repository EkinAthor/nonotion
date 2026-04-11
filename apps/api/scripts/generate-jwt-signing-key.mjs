#!/usr/bin/env node
/**
 * Generate an ES256 JWT signing key for Supabase Realtime.
 *
 * Supabase's new JWT Signing Keys system replaces the legacy HS256 shared secret.
 * This script generates an ES256 (P-256 elliptic curve) key pair and formats the
 * private key as a JWK (JSON Web Key), which is what Supabase expects when you
 * "Import existing private key" in the dashboard.
 *
 * Usage:
 *   # Print to stdout with walkthrough (default)
 *   node apps/api/scripts/generate-jwt-signing-key.mjs
 *
 *   # Also save the JWK JSON to a file
 *   node apps/api/scripts/generate-jwt-signing-key.mjs --out ./supabase-jwt-private.jwk.json
 *
 * Cross-platform: works on Windows, macOS, Linux. No openssl required.
 * Uses only Node.js built-ins and `jose` (already a dependency of apps/api).
 */

import { generateKeyPair, exportJWK } from 'jose';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

// ─── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let outPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outPath = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node apps/api/scripts/generate-jwt-signing-key.mjs [--out <path>]');
    process.exit(0);
  }
}

// ─── Generate key pair ───────────────────────────────────────────────────────
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Supabase JWT Signing Key Generator (ES256)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(' Generating a new P-256 elliptic curve key pair...');

const { privateKey } = await generateKeyPair('ES256', { extractable: true });

// Export as JWK (JSON Web Key) — this is what Supabase expects for import.
const jwk = await exportJWK(privateKey);
// Add algorithm hints (recommended by RFC 7517, harmless if Supabase ignores them)
jwk.alg = 'ES256';
jwk.use = 'sig';

const jwkPretty = JSON.stringify(jwk, null, 2);
const jwkCompact = JSON.stringify(jwk);

console.log(' ✓ Key pair generated');
console.log('');

// ─── Pretty JWK for Supabase dashboard ───────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' PRIVATE KEY (JWK JSON)');
console.log(' Paste this into Supabase Dashboard → Import existing private key');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(jwkPretty);
console.log('');

// ─── Compact JWK for .env ────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' COMPACT JWK for .env');
console.log(' Paste this as the value of SUPABASE_JWT_PRIVATE_KEY in .env');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
// The JSON uses double quotes internally, so wrap in single quotes for .env
console.log(`SUPABASE_JWT_PRIVATE_KEY='${jwkCompact}'`);
console.log('');

// ─── Optional: save to file ──────────────────────────────────────────────────
if (outPath) {
  const absolutePath = resolve(process.cwd(), outPath);
  if (existsSync(absolutePath)) {
    console.log('');
    console.log(` ✗ Refusing to overwrite existing file: ${absolutePath}`);
    console.log(`   Remove it first or choose a different --out path.`);
    console.log('');
    process.exit(1);
  }
  writeFileSync(absolutePath, jwkPretty + '\n', { mode: 0o600 });
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` FILE SAVED`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('');
  console.log(` ✓ Private key saved to: ${absolutePath}`);
  console.log('');
  console.log(` ⚠  NEVER commit this file to git.`);
  console.log(`    Add "${basename(absolutePath)}" to your .gitignore.`);
  console.log('');

  // Best-effort git check
  if (isInsideGitRepo(dirname(absolutePath))) {
    console.log(` ⚠  Warning: the output file is inside a git repository.`);
    console.log(`    Make sure it's gitignored before committing anything.`);
    console.log('');
  }
}

// ─── Walkthrough ─────────────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' NEXT STEPS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(' [1/5] Copy the JWK JSON block above (the pretty-printed one).');
console.log('');
console.log(' [2/5] Open your Supabase project dashboard:');
console.log('       Settings → Auth → JWT Signing Keys');
console.log('');
console.log(' [3/5] Click "Import existing private key", select algorithm ES256,');
console.log('       paste the JSON, and save.');
console.log('');
console.log(' [4/5] Copy the "kid" (Key ID) that Supabase displays for the');
console.log('       new standby key. Paste it into your .env file:');
console.log('       SUPABASE_JWT_KID=<the kid from Supabase>');
console.log('');
console.log(' [5/5] Click "Rotate keys" to make this the current signing key.');
console.log('       The old HS256 legacy key becomes "previously used".');
console.log('');
console.log(' Then add the compact SUPABASE_JWT_PRIVATE_KEY line above to');
console.log(' your .env file, restart the API, and test.');
console.log('');
console.log(' After all tokens issued with the old key have expired (1h+),');
console.log(' you can revoke the legacy HS256 key in the Supabase dashboard.');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isInsideGitRepo(startDir) {
  let dir = resolve(startDir);
  const root = resolve('/');
  while (dir !== root) {
    if (existsSync(resolve(dir, '.git'))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}
