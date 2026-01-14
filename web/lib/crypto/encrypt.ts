/**
 * Zero-Knowledge File Encryption
 * FAZ 3: Client-side encrypt & upload flow
 * 
 * Security Model:
 * 1. User enters password
 * 2. Derive master key from password (Argon2id)
 * 3. Generate random DEK for file
 * 4. Encrypt file with DEK (AES-256-GCM)
 * 5. Encrypt DEK with master key (key wrapping)
 * 6. Encrypt filename with master key
 * 7. Upload ciphertext + artifacts to backend
 * 
 * Backend/Cloudflare never see: plaintext file, filename, or master key
 */

import { deriveKey, type KdfParams } from "./kdf";
import {
  randomBytes,
  aesGcmEncrypt,
  encryptString,
  u8ToB64,
  toUint8Array,
} from "./webcrypto";

export interface EncryptionArtifacts {
  ciphertext: Uint8Array;
  cipherIv: string; // base64
  edek: string; // base64 (encrypted DEK)
  edekIv: string; // base64
  metaNameEnc: string; // base64
  metaNameIv: string; // base64
}

/**
 * Encrypt file for upload
 * 
 * @param file - File object from input
 * @param password - User password
 * @param kdfSalt - Salt from /api/crypto/init
 * @param kdfParams - Params from /api/crypto/init
 * @returns Encryption artifacts for upload
 */
export async function encryptFile(
  file: File,
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams
): Promise<EncryptionArtifacts> {
  // 1. Derive master key from password
  const masterKey = await deriveKey(password, kdfSalt, kdfParams);

  // 2. Generate random DEK (Data Encryption Key) - 32 bytes
  const dek = randomBytes(32);

  // 3. Generate IV for file encryption - 12 bytes
  const cipherIv = randomBytes(12);

  // 4. Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();

  // 5. Encrypt file content with DEK
  const ciphertext = await aesGcmEncrypt(dek, cipherIv, fileBuffer);

  // 6. Encrypt DEK with master key (key wrapping)
  const edekIv = randomBytes(12);
  const edekBytes = await aesGcmEncrypt(masterKey, edekIv, dek);

  // 7. Encrypt filename with master key
  const metaNameIv = randomBytes(12);
  const metaNameEnc = await encryptString(masterKey, metaNameIv, file.name);

  return {
    ciphertext,
    cipherIv: u8ToB64(cipherIv),
    edek: u8ToB64(edekBytes),
    edekIv: u8ToB64(edekIv),
    metaNameEnc,
    metaNameIv: u8ToB64(metaNameIv),
  };
}

/**
 * Encrypt file with existing master key (from memory)
 * Used when user is already logged in
 */
export async function encryptFileWithKey(
  file: File,
  masterKey: Uint8Array
): Promise<EncryptionArtifacts> {
  // 1. Generate random DEK (Data Encryption Key) - 32 bytes
  const dek = randomBytes(32);

  // 2. Generate IV for file encryption - 12 bytes
  const cipherIv = randomBytes(12);

  // 3. Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();

  // 4. Encrypt file content with DEK
  const ciphertext = await aesGcmEncrypt(dek, cipherIv, fileBuffer);

  // 5. Encrypt DEK with master key (key wrapping)
  const edekIv = randomBytes(12);
  const edekBytes = await aesGcmEncrypt(masterKey, edekIv, dek);

  // 6. Encrypt filename with master key
  const metaNameIv = randomBytes(12);
  const metaNameEnc = await encryptString(masterKey, metaNameIv, file.name);

  return {
    ciphertext,
    cipherIv: u8ToB64(cipherIv),
    edek: u8ToB64(edekBytes),
    edekIv: u8ToB64(edekIv),
    metaNameEnc,
    metaNameIv: u8ToB64(metaNameIv),
  };
}

/**
 * Encrypt and upload using master key from memory
 * No password required - uses cached key from login
 */
export async function encryptAndUploadWithKey(
  file: File,
  masterKey: Uint8Array,
  apiToken: string,
  folderId?: string | null,
  isHidden?: boolean
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";

  // 1. Encrypt file with master key
  const artifacts = await encryptFileWithKey(file, masterKey);

  // 2. Get presigned upload URL
  const presignRes = await fetch(`${baseUrl}/api/files/v3/presign-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cipherSizeBytes: artifacts.ciphertext.byteLength,
      folderId: folderId || null,
      originalFilename: file.name,
      isHidden: isHidden || false,
    }),
  });

  if (!presignRes.ok) {
    const error = await presignRes.json();
    throw new Error(error.message || "Upload URL alınamadı");
  }

  const { fileId, uploadUrl } = await presignRes.json();

  // 3. Upload ciphertext to R2 via presigned URL
  const ciphertextU8 = toUint8Array(artifacts.ciphertext);
  const ciphertextBlob = new Blob([ciphertextU8] as BlobPart[], {
    type: "application/octet-stream",
  });
  
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: ciphertextBlob,
  });

  if (!uploadRes.ok) {
    throw new Error("R2'ye yükleme başarısız");
  }

  // 4. Complete upload with encryption artifacts
  const completeRes = await fetch(
    `${baseUrl}/api/files/v3/${fileId}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cipherIv: artifacts.cipherIv,
        edek: artifacts.edek,
        edekIv: artifacts.edekIv,
        metaNameEnc: artifacts.metaNameEnc,
        metaNameIv: artifacts.metaNameIv,
      }),
    }
  );

  if (!completeRes.ok) {
    const error = await completeRes.json();
    throw new Error(error.message || "Upload tamamlanamadı");
  }

  return fileId;
}

/**
 * Complete encryption and upload flow
 * 
 * @param file - File to upload
 * @param password - User password
 * @param apiToken - JWT token for auth
 * @returns File ID on success
 */
export async function encryptAndUpload(
  file: File,
  password: string,
  apiToken: string
): Promise<string> {
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

  // 2. Encrypt file
  const artifacts = await encryptFile(file, password, kdfSalt, kdfParams);

  // 3. Get presigned upload URL
  const presignRes = await fetch(`${baseUrl}/api/files/v3/presign-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cipherSizeBytes: artifacts.ciphertext.byteLength,
    }),
  });

  if (!presignRes.ok) {
    const error = await presignRes.json();
    throw new Error(error.message || "Upload URL alınamadı");
  }

  const { fileId, uploadUrl } = await presignRes.json();

  // 4. Upload ciphertext to R2 via presigned URL
  // Use Blob for maximum compatibility with fetch body
  const ciphertextU8 = toUint8Array(artifacts.ciphertext);
  const ciphertextBlob = new Blob([ciphertextU8] as BlobPart[], {
    type: "application/octet-stream",
  });
  
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: ciphertextBlob,
  });

  if (!uploadRes.ok) {
    throw new Error("R2'ye yükleme başarısız");
  }

  // 5. Complete upload with encryption artifacts
  const completeRes = await fetch(
    `${baseUrl}/api/files/v3/${fileId}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cipherIv: artifacts.cipherIv,
        edek: artifacts.edek,
        edekIv: artifacts.edekIv,
        metaNameEnc: artifacts.metaNameEnc,
        metaNameIv: artifacts.metaNameIv,
      }),
    }
  );

  if (!completeRes.ok) {
    const error = await completeRes.json();
    throw new Error(error.message || "Upload tamamlanamadı");
  }

  return fileId;
}
