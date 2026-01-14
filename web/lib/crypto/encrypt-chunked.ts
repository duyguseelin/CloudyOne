/**
 * Chunked File Encryption for Large Files
 * FAZ 3: AES-256-GCM with 4MB chunks + OCZ1 header format
 * 
 * Header Format:
 * - Magic: "OCZ1" (4 bytes)
 * - Header Length: uint32 LE (4 bytes)
 * - Header JSON: { cryptoVersion, algo, chunkSize, totalChunks, baseIv, aadVersion }
 * - Ciphertext Chunks: concatenated encrypted chunks
 * 
 * IV Strategy:
 * - baseIv: 12 random bytes
 * - chunk IV = baseIv XOR uint32_LE(chunkIndex) in last 4 bytes
 * 
 * AAD (Additional Authenticated Data):
 * - format: `fileId:chunkIndex:headerVersion`
 */

import { randomBytes, u8ToB64, b64ToU8, toUint8Array } from "./webcrypto";

const MAGIC = "OCZ1";
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB
const HEADER_VERSION = 1;
const AAD_VERSION = 1;

export interface ChunkEncMeta {
  cryptoVersion: number;
  algo: string;
  chunkSize: number;
  totalChunks: number;
  baseIv: string; // base64
  aadVersion: number;
  headerVersion: number;
}

export interface ChunkedEncryptResult {
  ciphertextBlob: Blob;
  encMeta: ChunkEncMeta;
}

/**
 * Derive chunk IV from base IV and chunk index
 */
function deriveChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(baseIv);
  
  // XOR last 4 bytes with chunk index (little-endian)
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, chunkIndex, true);
  
  for (let i = 0; i < 4; i++) {
    iv[8 + i] ^= indexBytes[i];
  }
  
  return iv;
}

/**
 * Generate AAD for chunk
 */
function generateAad(fileId: string, chunkIndex: number): Uint8Array {
  const aadString = `${fileId}:${chunkIndex}:${HEADER_VERSION}`;
  return new TextEncoder().encode(aadString);
}

/**
 * Encrypt file in chunks with OCZ1 header
 * 
 * @param file - File to encrypt
 * @param dek - 32-byte Data Encryption Key
 * @param fileId - File ID for AAD
 * @param chunkSize - Chunk size in bytes (default: 4MB)
 * @returns Ciphertext blob + metadata
 */
export async function encryptFileChunked(
  file: File,
  dek: Uint8Array,
  fileId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<ChunkedEncryptResult> {
  // Generate base IV
  const baseIv = randomBytes(12);
  
  // Calculate total chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  // Metadata
  const encMeta: ChunkEncMeta = {
    cryptoVersion: 1,
    algo: "AES-256-GCM",
    chunkSize,
    totalChunks,
    baseIv: u8ToB64(baseIv),
    aadVersion: AAD_VERSION,
    headerVersion: HEADER_VERSION,
  };
  
  // Serialize header
  const headerJson = JSON.stringify(encMeta);
  const headerBytes = new TextEncoder().encode(headerJson);
  const headerLenBytes = new Uint8Array(4);
  new DataView(headerLenBytes.buffer).setUint32(0, headerBytes.length, true);
  
  // Magic + header
  const magicBytes = new TextEncoder().encode(MAGIC);
  const header = new Uint8Array(
    magicBytes.length + headerLenBytes.length + headerBytes.length
  );
  header.set(magicBytes, 0);
  header.set(headerLenBytes, magicBytes.length);
  header.set(headerBytes, magicBytes.length + headerLenBytes.length);
  
  // Import DEK
  const dekClean = toUint8Array(dek);
  const key = await crypto.subtle.importKey(
    "raw",
    dekClean as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  // Encrypt chunks
  const encryptedChunks: Uint8Array[] = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBlob = file.slice(start, end);
    const chunkBuffer = await chunkBlob.arrayBuffer();
    
    // Derive chunk IV
    const chunkIv = deriveChunkIv(baseIv, i);
    const chunkIvClean = toUint8Array(chunkIv);
    
    // Generate AAD
    const aad = generateAad(fileId, i);
    const aadClean = toUint8Array(aad);
    
    // Encrypt chunk
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: chunkIvClean as BufferSource,
        additionalData: aadClean as BufferSource | undefined,
        tagLength: 128,
      },
      key,
      chunkBuffer
    );
    
    encryptedChunks.push(new Uint8Array(ciphertext));
  }
  
  // Combine header + chunks
  const totalSize =
    header.length + encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalSize);
  
  let offset = 0;
  combined.set(header, offset);
  offset += header.length;
  
  for (const chunk of encryptedChunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Create blob with proper ArrayBuffer (not SharedArrayBuffer)
  const buffer = combined.buffer.slice(0);
  const ciphertextBlob = new Blob([buffer], { type: "application/octet-stream" });
  
  return { ciphertextBlob, encMeta };
}

/**
 * Decrypt chunked file
 * 
 * @param ciphertextBlob - Encrypted blob with OCZ1 header
 * @param dek - 32-byte Data Encryption Key
 * @param fileId - File ID for AAD verification
 * @returns Decrypted file as Blob
 */
export async function decryptFileChunked(
  ciphertextBlob: Blob,
  dek: Uint8Array,
  fileId: string
): Promise<Blob> {
  const buffer = await ciphertextBlob.arrayBuffer();
  const data = new Uint8Array(buffer);
  
  // Parse header
  const magicBytes = data.slice(0, 4);
  const magic = new TextDecoder().decode(magicBytes);
  
  if (magic !== MAGIC) {
    throw new Error("Invalid file format: Missing OCZ1 magic header");
  }
  
  const headerLen = new DataView(data.buffer, 4, 4).getUint32(0, true);
  const headerBytes = data.slice(8, 8 + headerLen);
  const headerJson = new TextDecoder().decode(headerBytes);
  const encMeta: ChunkEncMeta = JSON.parse(headerJson);
  
  // Validate
  if (encMeta.cryptoVersion !== 1) {
    throw new Error(`Unsupported crypto version: ${encMeta.cryptoVersion}`);
  }
  
  // Parse base IV
  const baseIv = b64ToU8(encMeta.baseIv);
  
  // Import DEK
  const dekClean = toUint8Array(dek);
  const key = await crypto.subtle.importKey(
    "raw",
    dekClean as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  
  // Decrypt chunks
  const decryptedChunks: Uint8Array[] = [];
  let offset = 8 + headerLen;
  
  for (let i = 0; i < encMeta.totalChunks; i++) {
    // Calculate chunk size (GCM adds 16-byte tag)
    const plaintextChunkSize = encMeta.chunkSize;
    const ciphertextChunkSize = plaintextChunkSize + 16;
    
    // Handle last chunk (may be smaller)
    const isLastChunk = i === encMeta.totalChunks - 1;
    const chunkEnd = isLastChunk ? data.length : offset + ciphertextChunkSize;
    const chunkCiphertext = data.slice(offset, chunkEnd);
    
    // Derive chunk IV
    const chunkIv = deriveChunkIv(baseIv, i);
    const chunkIvClean = toUint8Array(chunkIv);
    
    // Generate AAD
    const aad = generateAad(fileId, i);
    const aadClean = toUint8Array(aad);
    
    try {
      // Decrypt chunk
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: chunkIvClean as BufferSource,
          additionalData: aadClean as BufferSource | undefined,
          tagLength: 128,
        },
        key,
        chunkCiphertext
      );
      
      decryptedChunks.push(new Uint8Array(plaintext));
    } catch (error) {
      throw new Error(`Failed to decrypt chunk ${i}: Wrong password or corrupted data`);
    }
    
    offset = chunkEnd;
  }
  
  // Combine chunks
  const totalPlaintextSize = decryptedChunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0
  );
  const combined = new Uint8Array(totalPlaintextSize);
  
  let writeOffset = 0;
  for (const chunk of decryptedChunks) {
    combined.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  
  // Return as blob
  const plaintextBuffer = combined.buffer.slice(0);
  return new Blob([plaintextBuffer]);
}
