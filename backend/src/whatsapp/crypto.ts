import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ENC_KEY_ENV = 'INTEGRATION_ENC_KEY';

function loadOrCreateKey(): string {
  const envValue = process.env[ENC_KEY_ENV];
  if (envValue) return envValue;

  const keyPath = path.join(process.cwd(), '.integration_key');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }

  const key = randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, { encoding: 'utf8' });
  return key;
}

function getKey(): Buffer {
  const raw = loadOrCreateKey();
  if (raw.length !== 64) {
    throw new Error(`${ENC_KEY_ENV} must be 64 hex chars (32 bytes)`);
  }
  return Buffer.from(raw, 'hex');
}

export function encryptPayload(payload: unknown): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join('.');
}

export function decryptPayload(value: string): unknown {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = value.split('.');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(decrypted);
}
