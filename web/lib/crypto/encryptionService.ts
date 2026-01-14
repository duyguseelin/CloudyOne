/**
 * Secure Encryption Service with KeyManager Integration
 * 
 * Security:
 * - Master key never stored in localStorage/sessionStorage
 * - Auto-expires after 30 minutes of inactivity
 * - Requires re-derivation after expiry
 */

import keyManager from "./keyManager";
import { deriveKey, type KdfParams } from "./kdf";
import { encryptFile, type EncryptionArtifacts } from "./encrypt";

/**
 * Get or derive master key (with caching in memory only)
 */
async function getMasterKey(
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams
): Promise<Uint8Array> {
  // Check if we have a valid cached key
  try {
    const cachedKey = keyManager.getMasterKey();
    if (cachedKey) {
      return cachedKey;
    }
  } catch (error) {
    // Key not initialized or expired, derive new one
  }

  // Derive new key and cache it
  await keyManager.setMasterKey(password, kdfSalt, kdfParams);
  return keyManager.getMasterKey();
}

/**
 * Encrypt file with secure key management
 */
export async function encryptFileSecure(
  file: File,
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams
): Promise<EncryptionArtifacts> {
  const masterKey = await getMasterKey(password, kdfSalt, kdfParams);
  
  // Use existing encryption logic
  return encryptFile(file, password, kdfSalt, kdfParams);
}

/**
 * Clear master key from memory (on logout)
 */
export function clearMasterKey() {
  keyManager.clearKey();
}

/**
 * Check if master key is available
 */
export function hasMasterKey(): boolean {
  return keyManager.hasKey();
}
