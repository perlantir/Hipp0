/**
 * API Key generation utilities.
 *
 * Key format: dg_live_<40 hex chars>
 * Storage: SHA-256 hash only. Full key returned once at creation.
 */
import crypto from 'node:crypto';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const random = crypto.randomBytes(20).toString('hex');
  const key = `dg_live_${random}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 16);
  return { key, hash, prefix };
}
