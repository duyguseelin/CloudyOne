/**
 * Mobile Crypto Module - Main Export
 */

export {
  setMasterKey,
  getMasterKey,
  hasMasterKey,
  clearMasterKey,
  touchActivity,
  getRemainingTime
} from './keyManager';

export {
  deriveKeyFromPassword,
  generateSalt,
  bytesToHex,
  bytesToBase64,
  base64ToBytes
} from './kdf';

export {
  encryptFile,
  decryptData,
  encryptAndUploadFileV3,
  downloadAndDecryptFileV3,
  downloadAndDecryptFileV3 as downloadAndDecryptFile // Backward compatibility
} from './encrypt';

/**
 * Login sonrası master key'i başlat
 */
export async function initializeMasterKey(
  password: string,
  saltBase64: string,
  kdfParams?: { iterations?: number }
): Promise<void> {
  const { deriveKeyFromPassword, base64ToBytes, bytesToHex } = await import('./kdf');
  const { setMasterKey } = await import('./keyManager');
  
  const salt = base64ToBytes(saltBase64);
  const iterations = kdfParams?.iterations || 600000;
  
  console.log("🔐 [Mobile] Master key türetiliyor...");
  console.log("🔐 [Mobile] Salt (base64):", saltBase64.substring(0, 20) + "...");
  console.log("🔐 [Mobile] Iterations:", iterations);
  
  const masterKey = await deriveKeyFromPassword(password, salt, iterations);
  
  // Debug: Key'in ilk 4 byte'ını göster (güvenlik için tamamı değil)
  const keyPrefix = bytesToHex(masterKey.slice(0, 4));
  console.log("🔐 [Mobile] Key prefix (ilk 4 byte):", keyPrefix);
  console.log("🔐 [Mobile] Key uzunluğu:", masterKey.length, "bytes");
  
  setMasterKey(masterKey);
  console.log("✅ [Mobile] Master key hazır");
}
