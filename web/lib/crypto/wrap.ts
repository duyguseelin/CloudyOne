/**
 * DEK Wrap/Unwrap using AES-GCM
 * FAZ 3: Encrypt DEK with KEK
 * 
 * Security: Each wrap operation uses unique random IV
 */

import { randomBytes, u8ToB64, b64ToU8, toUint8Array } from "./webcrypto";

export interface WrappedDek {
  wrappedDek: string; // base64
  wrapIv: string; // base64 (12 bytes)
}

/**
 * Wrap (encrypt) DEK with KEK using AES-256-GCM
 * 
 * @param dek - 32-byte Data Encryption Key (plaintext)
 * @param kek - 32-byte Key Encryption Key
 * @returns Wrapped DEK + IV (both base64)
 */
export async function wrapDek(
  dek: Uint8Array,
  kek: Uint8Array
): Promise<WrappedDek> {
  // Generate random IV (12 bytes for GCM)
  const iv = randomBytes(12);
  
  // Convert to proper types
  const dekClean = toUint8Array(dek);
  const kekClean = toUint8Array(kek);
  const ivClean = toUint8Array(iv);

  // Import KEK
  const key = await crypto.subtle.importKey(
    "raw",
    kekClean as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt DEK
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivClean as BufferSource,
      tagLength: 128, // 16-byte auth tag
    },
    key,
    dekClean as BufferSource
  );

  return {
    wrappedDek: u8ToB64(new Uint8Array(ciphertext)),
    wrapIv: u8ToB64(iv),
  };
}

/**
 * Unwrap (decrypt) DEK with KEK
 * 
 * @param wrappedDekB64 - Base64 wrapped DEK
 * @param wrapIvB64 - Base64 IV used for wrapping
 * @param kek - 32-byte Key Encryption Key
 * @returns 32-byte DEK (plaintext)
 * @throws Error if decryption fails (wrong password)
 */
export async function unwrapDek(
  wrappedDekB64: string,
  wrapIvB64: string,
  kek: Uint8Array
): Promise<Uint8Array> {
  const wrappedDek = b64ToU8(wrappedDekB64);
  const iv = b64ToU8(wrapIvB64);
  
  // Convert to proper types
  const wrappedDekClean = toUint8Array(wrappedDek);
  const kekClean = toUint8Array(kek);
  const ivClean = toUint8Array(iv);

  // Import KEK
  const key = await crypto.subtle.importKey(
    "raw",
    kekClean as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    // Decrypt DEK
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivClean as BufferSource,
        tagLength: 128,
      },
      key,
      wrappedDekClean as BufferSource
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    throw new Error("Failed to unwrap DEK: Wrong password or corrupted data");
  }
}
