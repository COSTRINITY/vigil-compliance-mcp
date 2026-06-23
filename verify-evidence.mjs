#!/usr/bin/env node
/**
 * Offline, independent verifier for a VIGIL evidence package.
 *
 *   node verify-evidence.mjs path/to/evidence.json     (or pipe the JSON via stdin)
 *
 * Uses ONLY Node's built-in crypto and VIGIL's published Ed25519 public key
 * (below). No VIGIL account, no VIGIL secret, no network. Cross-check the
 * embedded key against the published one at:
 *   https://vigil.costrinity.xyz/api/evidence/pubkey   (key_id must match)
 *
 * A VALID result proves: this package was issued by VIGIL (holder of the
 * evidence private key) and has not been altered since export. It does NOT
 * prove the underlying records are factually true.
 */
import { readFileSync } from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';

const PUBLIC_KEY_B64 = 'MCowBQYDK2VwAyEAsEBWg2cdc3sb0HAozBmtuk9q9hEdyG2bcLq4gpfudWg=';
const KEY_ID = '01833acd46d06ab4';

// MUST byte-for-byte match lib/evidenceSign.ts canonicalize().
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

const src = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync(0, 'utf8');
const doc = JSON.parse(src);
const pkg = doc.evidence_package ?? doc;
const sig = doc.package_signature?.signature ?? doc.signature;
if (!pkg || typeof pkg !== 'object' || typeof sig !== 'string') {
  console.error('ERROR: could not find evidence_package + package_signature.signature in the input.');
  process.exit(2);
}

const pub = createPublicKey({ key: Buffer.from(PUBLIC_KEY_B64, 'base64'), format: 'der', type: 'spki' });
const ok = verify(null, Buffer.from(canonicalize(pkg), 'utf8'), pub, Buffer.from(sig, 'base64'));
const inPkgKeyId = doc.package_signature?.public_key_id ?? '(none)';

console.log('VIGIL evidence verification (offline, Ed25519)');
console.log('  expected key_id   :', KEY_ID);
console.log('  package key_id     :', inPkgKeyId, inPkgKeyId === KEY_ID ? '(match)' : '(MISMATCH)');
console.log('  signature valid    :', ok);
console.log('');
if (ok) {
  console.log('VALID — issued by VIGIL, not altered since export.');
  console.log('        (Does NOT prove the underlying records are factually true.)');
  process.exit(0);
}
console.log('INVALID — altered after signing, not signed by VIGIL, or key mismatch.');
process.exit(1);
