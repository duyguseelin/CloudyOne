/**
 * Zero-Knowledge Encryption Library
 * FAZ 3: Main export file
 * 
 * Usage:
 * 
 * ```typescript
 * import { encryptAndUpload, downloadAndDecrypt } from '@/lib/crypto';
 * 
 * // Upload
 * const fileId = await encryptAndUpload(file, password, token);
 * 
 * // Download
 * const { blob, filename } = await downloadAndDecrypt(fileId, password, token);
 * ```
 */

// Simple encryption (single-chunk, for small files)
export { encryptFile, encryptAndUpload, encryptFileWithKey, encryptAndUploadWithKey } from "./encrypt";

// Chunked encryption (for large files with OCZ1 header)
export {
  encryptFileChunked,
  decryptFileChunked,
  type ChunkEncMeta,
  type ChunkedEncryptResult,
} from "./encrypt-chunked";

export {
  downloadAndDecrypt,
  downloadAndDecryptWithKey,
  downloadAndSave,
  decryptFilename,
  decryptFilenameWithKey,
} from "./decrypt";
export { deriveKey, deriveKeyWithProgress, type KdfParams } from "./kdf";
export { deriveKek, deriveKekFromPassword } from "./hkdf";
export { wrapDek, unwrapDek, type WrappedDek } from "./wrap";
export {
  b64ToU8,
  u8ToB64,
  randomBytes,
  aesGcmEncrypt,
  aesGcmDecrypt,
  encryptString,
  decryptString,
  toUint8Array,
} from "./webcrypto";

// Key Manager
export { 
  initializeMasterKey, 
  getMasterKey, 
  hasMasterKey, 
  clearMasterKey,
  updateActivity,
  getRemainingTime,
  extendSession
} from "./keyManager";
