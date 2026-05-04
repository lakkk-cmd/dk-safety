import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashWorkerPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(pin, salt, KEY_BYTES).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyWorkerPin(pin: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!salt || !hashHex || salt.length < 8) return false;
  try {
    const derived = scryptSync(pin, salt, KEY_BYTES);
    const expected = Buffer.from(hashHex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
