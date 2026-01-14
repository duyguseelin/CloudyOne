/**
 * PBKDF2 Key Derivation Function
 * Web Crypto API kullanarak tarayıcı uyumlu KDF
 * 
 * Argon2 yerine PBKDF2-SHA256 kullanılıyor çünkü:
 * - Turbopack ile argon2-browser WASM uyumlu değil
 * - Web Crypto API native ve tüm tarayıcılarda çalışır
 * - OWASP tarafından önerilen iteration sayısı kullanılıyor
 */

import { b64ToU8, u8ToB64 } from "./webcrypto";

export interface KdfParams {
  memory?: number;
  iterations: number;
  parallelism?: number;
  hashLength: number;
  algorithm: string;
}

// PBKDF2 için önerilen iteration sayısı (OWASP 2024)
const PBKDF2_ITERATIONS = 600000;

/**
 * Derive 32-byte master key from password using PBKDF2-SHA256
 * 
 * @param password - User password
 * @param saltB64 - Base64-encoded salt from backend
 * @param params - KDF parameters from backend
 * @returns 32-byte master key
 */
export async function deriveKey(
  password: string,
  saltB64: string,
  params: KdfParams
): Promise<Uint8Array> {
  const saltBytes = b64ToU8(saltB64);
  const encoder = new TextEncoder();
  
  // Use provided iterations or default
  const iterations = params.iterations > 0 ? params.iterations : PBKDF2_ITERATIONS;
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive key bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    params.hashLength * 8 // bits
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Derive key with progress callback (for UI feedback)
 */
export async function deriveKeyWithProgress(
  password: string,
  saltB64: string,
  params: KdfParams,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  if (onProgress) onProgress(0);

  const startTime = Date.now();
  
  const key = await deriveKey(password, saltB64, params);
  
  if (onProgress) onProgress(100);
  
  const duration = Date.now() - startTime;
  console.log(`✅ Key derived with PBKDF2 in ${duration}ms`);
  
  return key;
}
