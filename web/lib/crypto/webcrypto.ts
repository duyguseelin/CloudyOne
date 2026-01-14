/**
 * WebCrypto Helper Functions
 * FAZ 3: AES-256-GCM encryption/decryption utilities
 * 
 * Security Notes:
 * - All operations use WebCrypto API (browser native)
 * - Keys and IVs never logged to console
 * - Base64 encoding for transport
 */

/**
 * Type guard: Ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
 */
function toArrayBuffer(data: ArrayBuffer | ArrayBufferLike): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  // Convert SharedArrayBuffer or other ArrayBufferLike to ArrayBuffer
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data));
  return copy.buffer;
}

/**
 * Type guard: Ensure we have a Uint8Array with proper ArrayBuffer
 * Returns a Uint8Array backed by a real ArrayBuffer (not SharedArrayBuffer)
 * Exported for use in other crypto modules
 */
export function toUint8Array(data: Uint8Array | ArrayBuffer | ArrayBufferLike): Uint8Array {
  // If already Uint8Array and buffer is ArrayBuffer, return copy to ensure type
  if (data instanceof Uint8Array && data.buffer instanceof ArrayBuffer) {
    // Create fresh copy to guarantee type
    const result = new Uint8Array(data.length);
    result.set(data);
    return result;
  }
  
  // Convert ArrayBuffer or ArrayBufferLike
  let sourceArray: Uint8Array;
  
  if (data instanceof ArrayBuffer) {
    sourceArray = new Uint8Array(data);
  } else if (data instanceof Uint8Array) {
    sourceArray = data;
  } else {
    // ArrayBufferLike (SharedArrayBuffer etc.) - convert to ArrayBuffer
    const tempArray = new Uint8Array(data.byteLength);
    tempArray.set(new Uint8Array(data));
    sourceArray = tempArray;
  }
  
  // Create new ArrayBuffer and copy data
  const buffer = new ArrayBuffer(sourceArray.byteLength);
  const result = new Uint8Array(buffer);
  result.set(sourceArray);
  return result;
}

/**
 * Convert Base64 string to Uint8Array
 */
export function b64ToU8(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to Base64 string
 */
export function u8ToB64(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * AES-256-GCM Encryption
 * 
 * @param keyBytes - 32-byte encryption key
 * @param ivBytes - 12-byte initialization vector
 * @param plaintext - Data to encrypt (Uint8Array or ArrayBuffer)
 * @returns Ciphertext as Uint8Array
 */
export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  plaintext: Uint8Array | ArrayBuffer
): Promise<Uint8Array> {
  // Convert to proper Uint8Array with ArrayBuffer (not SharedArrayBuffer)
  const key32 = toUint8Array(keyBytes);
  const iv12 = toUint8Array(ivBytes);
  const plaintextBuffer = toUint8Array(plaintext);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    key32 as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv12 as BufferSource,
      tagLength: 128, // 128-bit authentication tag
    },
    key,
    plaintextBuffer as BufferSource
  );

  return new Uint8Array(ciphertext);
}

/**
 * AES-256-GCM Decryption
 * 
 * @param keyBytes - 32-byte decryption key
 * @param ivBytes - 12-byte initialization vector
 * @param ciphertext - Encrypted data
 * @returns Plaintext as Uint8Array
 * @throws Error if decryption fails (wrong key/corrupted data)
 */
export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  ciphertext: Uint8Array | ArrayBuffer
): Promise<Uint8Array> {
  // Convert to proper Uint8Array with ArrayBuffer (not SharedArrayBuffer)
  const key32 = toUint8Array(keyBytes);
  const iv12 = toUint8Array(ivBytes);
  const ciphertextBuffer = toUint8Array(ciphertext);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    key32 as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  try {
    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv12 as BufferSource,
        tagLength: 128,
      },
      key,
      ciphertextBuffer as BufferSource
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    throw new Error("Decrypt failed: Wrong password or corrupted data");
  }
}

/**
 * Encrypt string to base64
 */
export async function encryptString(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  plaintext: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const ciphertext = await aesGcmEncrypt(keyBytes, ivBytes, plaintextBytes);
  return u8ToB64(ciphertext);
}

/**
 * Decrypt base64 to string
 */
export async function decryptString(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  ciphertextB64: string
): Promise<string> {
  const ciphertext = b64ToU8(ciphertextB64);
  const plaintext = await aesGcmDecrypt(keyBytes, ivBytes, ciphertext);
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}
