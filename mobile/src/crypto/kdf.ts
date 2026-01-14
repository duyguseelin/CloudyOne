/**
 * Mobile KDF (Key Derivation Function) Module
 * Expo için PBKDF2 tabanlı anahtar türetme
 * 
 * Web ile tam uyumlu - aynı password + salt = aynı key
 * @noble/hashes kullanarak cross-platform PBKDF2
 */

import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import * as ExpoCrypto from 'expo-crypto';
import { Buffer } from 'buffer';

// PBKDF2 parametreleri (güvenli değerler - OWASP önerisi)
const PBKDF2_ITERATIONS = 600000;
const KEY_LENGTH = 32; // 256 bit

/**
 * Paroladan master key türet (PBKDF2-SHA256)
 * Web ile tam uyumlu - aynı girdiler = aynı çıktı
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  console.log("🔐 [Mobile KDF] @noble/hashes PBKDF2 kullanılıyor");
  
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  console.log("🔐 [Mobile KDF] PBKDF2 başlatılıyor...", { iterations, saltLen: salt.length });
  const startTime = Date.now();
  
  // İşlemi async yaparak UI thread'i serbest bırak
  return new Promise((resolve, reject) => {
    // setTimeout ile UI'a nefes aldır
    setTimeout(() => {
      try {
        // @noble/hashes ile PBKDF2-SHA256
        const derivedKey = pbkdf2(sha256, passwordBytes, salt, {
          c: iterations,
          dkLen: KEY_LENGTH
        });
        
        const duration = Date.now() - startTime;
        console.log(`✅ [Mobile KDF] Key türetildi: ${iterations} iterations, ${derivedKey.length} bytes, ${duration}ms`);
        resolve(derivedKey);
      } catch (error: any) {
        console.error("❌ [Mobile KDF] PBKDF2 hatası:", error?.message || error);
        reject(error);
      }
    }, 100); // 100ms bekle, UI güncellensin
  });
}

/**
 * Rastgele salt oluştur
 */
export async function generateSalt(length: number = 16): Promise<Uint8Array> {
  try {
    // expo-crypto ile rastgele byte oluştur
    const randomBytes = ExpoCrypto.getRandomBytes(length);
    return new Uint8Array(randomBytes);
  } catch {
    // Fallback: Web Crypto API
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    }
    
    // Son çare: Math.random (güvenli değil ama çalışır)
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }
}

/**
 * Hex string'i Uint8Array'e çevir
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Uint8Array'i hex string'e çevir
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Base64 encode
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // React Native'de btoa kullan
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 decode
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
