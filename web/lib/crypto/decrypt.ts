/**
 * Zero-Knowledge File Decryption
 * FAZ 3: Download & decrypt flow
 * 
 * Security Model:
 * 1. User enters password
 * 2. Derive master key from password (Argon2id)
 * 3. Get encrypted file + artifacts from backend
 * 4. Decrypt DEK with master key
 * 5. Decrypt file with DEK
 * 6. Decrypt filename with master key
 * 7. Save decrypted file locally
 * 
 * Backend/Cloudflare never see: plaintext or master key
 */

import { deriveKey, type KdfParams } from "./kdf";
import {
  b64ToU8,
  aesGcmDecrypt,
  decryptString,
  toUint8Array,
} from "./webcrypto";

/**
 * Download and decrypt file
 * Uses backend proxy to avoid CORS issues with R2
 * 
 * @param fileId - File ID from backend
 * @param password - User password
 * @param apiToken - JWT token for auth
 * @returns Decrypted file as Blob with original filename
 */
export async function downloadAndDecrypt(
  fileId: string,
  password: string,
  apiToken: string
): Promise<{ blob: Blob; filename: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";

  // 1. Get KDF parameters
  const initRes = await fetch(`${baseUrl}/api/crypto/init`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!initRes.ok) {
    throw new Error("KDF parameters alınamadı");
  }

  const { kdfSalt, kdfParams } = await initRes.json();

  // 2. Derive master key from password
  const masterKey = await deriveKey(password, kdfSalt, kdfParams);

  // 3. Download ciphertext from backend proxy (avoids CORS)
  const downloadRes = await fetch(
    `${baseUrl}/api/files/v3/${fileId}/download`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (!downloadRes.ok) {
    const error = await downloadRes.json().catch(() => ({ message: "Download failed" }));
    throw new Error(error.message || "Dosya indirilemedi");
  }

  // Get encryption artifacts from response headers
  const cipherIv = downloadRes.headers.get("X-Cipher-Iv") || "";
  const edek = downloadRes.headers.get("X-Edek") || "";
  const edekIv = downloadRes.headers.get("X-Edek-Iv") || "";
  const metaNameEnc = downloadRes.headers.get("X-Meta-Name-Enc") || "";
  const metaNameIv = downloadRes.headers.get("X-Meta-Name-Iv") || "";

  const ciphertext = new Uint8Array(await downloadRes.arrayBuffer());

  // 4. Decrypt DEK with master key (key unwrapping)
  const edekBytes = b64ToU8(edek);
  const edekIvBytes = b64ToU8(edekIv);
  const dek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);

  // 5. Decrypt file content with DEK
  const cipherIvBytes = b64ToU8(cipherIv);
  const plaintext = await aesGcmDecrypt(dek, cipherIvBytes, ciphertext);

  // 6. Decrypt filename with master key
  const metaNameIvBytes = b64ToU8(metaNameIv);
  const filename = await decryptString(
    masterKey,
    metaNameIvBytes,
    metaNameEnc
  );

  // 7. Create Blob from decrypted data
  // Use toUint8Array to ensure proper ArrayBuffer type (not SharedArrayBuffer)
  const plaintextU8 = toUint8Array(plaintext);
  const blob = new Blob([plaintextU8] as BlobPart[], { type: "application/octet-stream" });

  return { blob, filename };
}

/**
 * Download and decrypt file using master key from memory
 * No password required - uses cached key
 * Uses backend proxy to avoid CORS issues with R2
 */
export async function downloadAndDecryptWithKey(
  fileId: string,
  masterKey: Uint8Array,
  apiToken: string
): Promise<{ blob: Blob; filename: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";

  console.log("📥 downloadAndDecryptWithKey başlatıldı, fileId:", fileId);
  console.log("📥 API URL:", `${baseUrl}/api/files/v3/${fileId}/download`);

  // 1. Download ciphertext from backend proxy (avoids CORS)
  const downloadRes = await fetch(
    `${baseUrl}/api/files/v3/${fileId}/download`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  console.log("📥 Download response status:", downloadRes.status);

  if (!downloadRes.ok) {
    const error = await downloadRes.json().catch(() => ({ message: "Download failed" }));
    throw new Error(error.message || "Dosya indirilemedi");
  }

  // Get encryption artifacts from response headers
  const cipherIv = downloadRes.headers.get("X-Cipher-Iv") || "";
  const edek = downloadRes.headers.get("X-Edek") || "";
  const edekIv = downloadRes.headers.get("X-Edek-Iv") || "";
  const metaNameEnc = downloadRes.headers.get("X-Meta-Name-Enc") || "";
  const metaNameIv = downloadRes.headers.get("X-Meta-Name-Iv") || "";

  console.log("📥 Headers:", { cipherIv: cipherIv?.slice(0,20), edek: edek?.slice(0,20), edekIv: edekIv?.slice(0,20) });
  console.log("📥 Master key length:", masterKey.length, "bytes");

  const ciphertext = new Uint8Array(await downloadRes.arrayBuffer());
  console.log("📥 Ciphertext length:", ciphertext.length);

  // 2. Decrypt DEK with master key (key unwrapping)
  const edekBytes = b64ToU8(edek);
  const edekIvBytes = b64ToU8(edekIv);
  console.log("📥 Unwrapping DEK... edekBytes:", edekBytes.length, "edekIvBytes:", edekIvBytes.length);
  const dek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);
  console.log("📥 DEK unwrapped, length:", dek.length);

  // 3. Decrypt file content with DEK
  const cipherIvBytes = b64ToU8(cipherIv);
  console.log("📥 Decrypting content...");
  const plaintext = await aesGcmDecrypt(dek, cipherIvBytes, ciphertext);
  console.log("📥 Content decrypted, length:", plaintext.length);

  // 4. Decrypt filename with master key
  const metaNameIvBytes = b64ToU8(metaNameIv);
  const filename = await decryptString(
    masterKey,
    metaNameIvBytes,
    metaNameEnc
  );
  console.log("📥 Filename decrypted:", filename);

  // 5. Create Blob from decrypted data
  const plaintextU8 = toUint8Array(plaintext);
  const blob = new Blob([plaintextU8] as BlobPart[], { type: "application/octet-stream" });

  return { blob, filename };
}

/**
 * Download and decrypt file, then trigger browser download
 * 
 * @param fileId - File ID
 * @param password - User password
 * @param apiToken - JWT token
 */
export async function downloadAndSave(
  fileId: string,
  password: string,
  apiToken: string
): Promise<void> {
  const { blob, filename } = await downloadAndDecrypt(
    fileId,
    password,
    apiToken
  );

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Decrypt only filename (for file list display)
 * 
 * @param metaNameEnc - Encrypted filename (base64)
 * @param metaNameIv - IV for filename encryption (base64)
 * @param password - User password
 * @param kdfSalt - Salt from backend
 * @param kdfParams - KDF params from backend
 * @returns Decrypted filename
 */
export async function decryptFilename(
  metaNameEnc: string,
  metaNameIv: string,
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams
): Promise<string> {
  const masterKey = await deriveKey(password, kdfSalt, kdfParams);
  const ivBytes = b64ToU8(metaNameIv);
  return decryptString(masterKey, ivBytes, metaNameEnc);
}

/**
 * Decrypt filename using master key from memory
 * No password required - uses cached key
 * 
 * @param metaNameEnc - Encrypted filename (base64)
 * @param metaNameIv - IV for filename encryption (base64)
 * @param masterKey - Master key from memory
 * @returns Decrypted filename
 */
export async function decryptFilenameWithKey(
  metaNameEnc: string,
  metaNameIv: string,
  masterKey: Uint8Array
): Promise<string> {
  const ivBytes = b64ToU8(metaNameIv);
  return decryptString(masterKey, ivBytes, metaNameEnc);
}
