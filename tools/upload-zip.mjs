#!/usr/bin/env node
// Built by Foxdusk
// Uploads a sale zip (Foxdusk AIOS or Hookdusk AIOS) to the private "downloads"
// bucket in Supabase. Uploading again replaces the file, so every buyer's link
// gets the new version.
//
//   node tools/upload-zip.mjs                       (../FOXDUSK AIOS/releases/Foxdusk-AIOS.zip)
//   node tools/upload-zip.mjs hookdusk              (../FOXDUSK AIOS/releases/Hookdusk-AIOS.zip)
//   node tools/upload-zip.mjs path/to/Hookdusk-AIOS.zip   (app is read from the file name)
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local. Never prints keys.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = {
  foxdusk: { file: 'Foxdusk-AIOS.zip', env: 'AIOS_DOWNLOAD_FILE' },
  hookdusk: { file: 'Hookdusk-AIOS.zip', env: 'HOOKDUSK_DOWNLOAD_FILE' },
};
const arg = process.argv[2] || 'foxdusk';
const app = APPS[arg.toLowerCase()] ? arg.toLowerCase() : (/hookdusk/i.test(basename(arg)) ? 'hookdusk' : 'foxdusk');
const zip = resolve(APPS[arg.toLowerCase()] ? join(site, '..', 'FOXDUSK AIOS', 'releases', APPS[app].file) : arg);
if (/master/i.test(basename(zip))) { console.error('\n✗ That is your private master copy. Never upload it for buyers.\n'); process.exit(1); }
const BUCKET = 'downloads';

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  const text = readFileSync(file, 'utf8');
  const re = /^\s*([A-Z0-9_]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\n#]*)/gm;
  let m;
  while ((m = re.exec(text))) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const fail = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };
const env = { ...readEnv(join(site, '.env.local')), ...process.env };
const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
const target = env[APPS[app].env] || APPS[app].file;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail('SUPABASE_URL in .env.local is missing or not like https://xxxx.supabase.co');
if (!key) fail('SUPABASE_SERVICE_ROLE_KEY in .env.local is empty.');
if (!existsSync(zip)) fail(`Zip not found: ${zip}\n  Build it first in FOXDUSK AIOS with: npm run release`);

const headers = (extra = {}) => ({ apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...extra });
const size = statSync(zip).size;
console.log(`Uploading ${basename(zip)} (${(size / 1048576).toFixed(1)} MB) to Supabase bucket "${BUCKET}" as ${target} …`);

// 1. Make sure the private bucket exists (schema.sql also creates it).
let r = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers: headers() });
if (r.status === 401 || r.status === 403) fail('Supabase refused the service key. Copy the service_role (secret) key again into .env.local.');
if (!r.ok) {
  r = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800, allowed_mime_types: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'] }),
  });
  if (!r.ok && r.status !== 409) fail(`Could not create the "${BUCKET}" bucket (${r.status}). Run supabase/schema.sql in the SQL Editor, then try again.`);
  console.log(`  Created the private "${BUCKET}" bucket.`);
} else {
  const b = await r.json();
  if (b.public) fail(`The "${BUCKET}" bucket is public. Make it private in Supabase > Storage, then try again.`);
}

// 2. Upload, replacing any older version.
r = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(target)}`, {
  method: 'POST', headers: headers({ 'Content-Type': 'application/zip', 'x-upsert': 'true', 'Cache-Control': 'no-cache' }),
  body: readFileSync(zip),
});
if (!r.ok) fail(`Upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
console.log('  Uploaded.');

// 3. Prove a buyer link would work: sign a short link and fetch the file's size.
r = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(target)}`, {
  method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 60 }),
});
if (!r.ok) fail(`Uploaded, but a download link could not be made (${r.status}).`);
const { signedURL } = await r.json();
const check = await fetch(`${url}/storage/v1${signedURL}`, { method: 'GET', headers: { Range: 'bytes=0-3' } });
const magic = Buffer.from(await check.arrayBuffer());
if (!check.ok || magic.slice(0, 2).toString() !== 'PK') fail(`Uploaded, but the test download did not return a zip (${check.status}).`);
const publicTry = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(target)}`);
console.log(`  Test download works. Public access is ${publicTry.ok ? 'OPEN — make the bucket private!' : 'blocked, as it should be'}.`);
console.log('\n✓ Done. Buyers get this zip from the link in their key email.\n');
