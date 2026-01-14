/**
 * HKDF (HMAC-based Key Derivation Function)
 * FAZ 3: Derive KEK from UMK using HKDF-SHA-256
 * 
 * Spec: RFC 5869
 */

import { toUint8Array } from "./webcrypto";

/**
 * Derive KEK (Key Encryption Key) from UMK (User Master Key)
 * 
 * @param umk - 32-byte User Master Key from Argon2id
 * @param info - Context/purpose string (e.g., "onecloud-kek-v1")
 * @param length - Output length in bytes (default: 32)
 * @returns KEK bytes
 */
export async function deriveKek(
  umk: Uint8Array,
  info: string = "onecloud-kek-v1",
  length: number = 32
): Promise<Uint8Array> {
  // Convert to proper Uint8Array
  const umkClean = toUint8Array(umk);
  
  // Import UMK as HKDF base key
  const baseKey = await crypto.subtle.importKey(
    "raw",
    umkClean as BufferSource,
    "HKDF",
    false,
    ["deriveBits"]
  );

  // Derive KEK using HKDF-SHA-256
  const encoder = new TextEncoder();
  const infoBytes = encoder.encode(info);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32), // Empty salt (UMK already salted via Argon2)
      info: infoBytes as BufferSource,
    },
    baseKey,
    length * 8 // bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * Convenience: Derive KEK directly from password
 * 
 * @param password - User password
 * @param saltB64 - Base64 salt from backend
 * @param params - KDF params from backend
 * @param info - HKDF info string
 * @returns KEK bytes
 */
export async function deriveKekFromPassword(
  password: string,
  saltB64: string,
  params: any,
  info: string = "onecloud-kek-v1"
): Promise<Uint8Array> {
  const { deriveKey } = await import("./kdf");
  const umk = await deriveKey(password, saltB64, params);
  return deriveKek(umk, info);
}
