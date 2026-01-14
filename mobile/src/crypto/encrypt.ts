/**
 * Mobile Zero-Knowledge Encryption Module
 * V3 Envelope Encryption - Web ile tam uyumlu
 * 
 * Security Model (Web ile aynı):
 * 1. Master key'den DEK (Data Encryption Key) oluştur
 * 2. DEK ile dosya şifrele (AES-256-GCM)
 * 3. DEK'i master key ile şifrele (EDEK - Encrypted DEK)
 * 4. Dosya adını master key ile şifrele
 * 5. Tüm artifact'ları backend'e gönder
 * 
 * Backend/Cloudflare hiçbir zaman görmez: plaintext, filename, master key
 * 
 * NOT: @noble/ciphers kullanılıyor - Web Crypto API ile tam uyumlu output
 */

import * as FileSystem from 'expo-file-system';
import { Paths, File } from 'expo-file-system';
import * as ExpoCrypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes';
import { bytesToBase64, base64ToBytes } from './kdf';
import { getMasterKey } from './keyManager';
import { storage } from '../utils/storage';
import { API_BASE_URL } from '../constants/config';
import { Buffer } from 'buffer';

// AES-GCM sabitleri (Web ile aynı)
const IV_LENGTH = 12;  // GCM için önerilen IV uzunluğu
const TAG_LENGTH = 16; // Auth tag uzunluğu (128 bit = 16 bytes)
const KEY_LENGTH = 32; // AES-256 için
const DEK_LENGTH = 32; // DEK uzunluğu (256 bit)

/**
 * Rastgele IV oluştur
 */
async function generateIV(): Promise<Uint8Array> {
  try {
    const randomBytes = ExpoCrypto.getRandomBytes(IV_LENGTH);
    return new Uint8Array(randomBytes);
  } catch {
    // Fallback
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const iv = new Uint8Array(IV_LENGTH);
      crypto.getRandomValues(iv);
      return iv;
    }
    throw new Error("Güvenli rastgele sayı üretilemedi");
  }
}

/**
 * Rastgele bytes oluştur (DEK için)
 */
async function generateRandomBytes(length: number): Promise<Uint8Array> {
  try {
    const randomBytes = ExpoCrypto.getRandomBytes(length);
    return new Uint8Array(randomBytes);
  } catch {
    // Fallback
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    }
    throw new Error("Güvenli rastgele sayı üretilemedi");
  }
}

/**
 * AES-256-GCM ile şifrele (@noble/ciphers - Web Crypto API ile uyumlu)
 * Not: @noble/ciphers GCM çıktısı = ciphertext + 16 byte tag (Web Crypto ile aynı)
 */
async function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  try {
    const cipher = gcm(key, iv);
    // encrypt: plaintext -> ciphertext + tag (birleşik)
    const ciphertext = cipher.encrypt(plaintext);
    return ciphertext;
  } catch (error) {
    console.error("AES-GCM şifreleme hatası:", error);
    throw error;
  }
}

/**
 * AES-256-GCM ile şifre çöz (@noble/ciphers - Web Crypto API ile uyumlu)
 */
async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  try {
    const cipher = gcm(key, iv);
    // decrypt: ciphertext + tag -> plaintext
    const plaintext = cipher.decrypt(ciphertext);
    return plaintext;
  } catch (error) {
    console.error("AES-GCM şifre çözme hatası:", error);
    throw new Error("Şifre çözme başarısız: Yanlış şifre veya bozuk veri");
  }
}

/**
 * String'i şifrele (filename için)
 */
async function encryptString(
  masterKey: Uint8Array,
  iv: Uint8Array,
  plaintext: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const encrypted = await aesGcmEncrypt(masterKey, iv, plaintextBytes);
  return bytesToBase64(encrypted);
}

/**
 * String'i çöz (filename için) - Export edilmiş versiyon
 */
export async function decryptFilename(
  masterKey: Uint8Array,
  iv: Uint8Array,
  ciphertextBase64: string
): Promise<string> {
  return await decryptString(masterKey, iv, ciphertextBase64);
}

/**
 * String'i çöz (filename için) - Internal
 */
async function decryptString(
  masterKey: Uint8Array,
  iv: Uint8Array,
  ciphertextBase64: string
): Promise<string> {
  const ciphertextBytes = base64ToBytes(ciphertextBase64);
  const decrypted = await aesGcmDecrypt(masterKey, iv, ciphertextBytes);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Dosyayı şifrele ve base64 olarak döndür
 */
export async function encryptFile(
  fileUri: string,
  masterKey: Uint8Array
): Promise<{ encryptedBase64: string; iv: string; originalName: string; originalSize: number }> {
  // Dosyayı binary olarak oku
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const originalSize = fileBytes.length;
  
  // Dosya adını al
  const originalName = fileUri.split('/').pop() || 'file';
  
  // IV oluştur
  const iv = await generateIV();
  
  // AES-256-GCM ile şifrele
  const encrypted = await aesGcmEncrypt(masterKey, iv, fileBytes);
  
  return {
    encryptedBase64: bytesToBase64(encrypted),
    iv: bytesToBase64(iv),
    originalName,
    originalSize
  };
}

/**
 * Şifreli veriyi çöz
 */
export async function decryptData(
  encryptedBase64: string,
  iv: string,
  masterKey: Uint8Array
): Promise<Uint8Array> {
  const encryptedBytes = base64ToBytes(encryptedBase64);
  const ivBytes = base64ToBytes(iv);
  
  // AES-256-GCM ile şifre çöz
  return await aesGcmDecrypt(masterKey, ivBytes, encryptedBytes);
}

/**
 * V3 Envelope Encryption ile dosya yükle
 * Web ile uyumlu format
 */
export async function encryptAndUploadFileV3(
  fileUri: string,
  fileName: string,
  mimeType: string,
  masterKey: Uint8Array,
  token: string,
  apiBaseUrl: string,
  folderId?: string,
  isHidden?: boolean
): Promise<{ fileId: string; isNewVersion?: boolean; message?: string; previousVersion?: number }> {
  console.log("🔐 [Mobile V3] Envelope encryption başlatılıyor...");
  
  // 1. Dosyayı binary olarak oku
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const originalSize = fileBytes.length;
  
  console.log("📄 [Mobile V3] Dosya okundu, boyut:", originalSize, "bytes");
  
  // 2. DEK (Data Encryption Key) oluştur - 32 bytes (Web ile aynı)
  const dek = await generateRandomBytes(DEK_LENGTH);
  
  // 3. Dosya için IV oluştur
  const cipherIv = await generateIV();
  
  // 4. Dosyayı DEK ile şifrele
  const ciphertext = await aesGcmEncrypt(dek, cipherIv, fileBytes);
  
  // 5. DEK'i master key ile şifrele (EDEK - Encrypted DEK)
  const edekIv = await generateIV();
  const edek = await aesGcmEncrypt(masterKey, edekIv, dek);
  
  // 6. Dosya adını master key ile şifrele
  const metaNameIv = await generateIV();
  const metaNameEnc = await encryptString(masterKey, metaNameIv, fileName);
  
  console.log("✅ [Mobile V3] Şifreleme tamamlandı");
  console.log("- Ciphertext size:", ciphertext.length);
  console.log("- EDEK size:", edek.length);
  console.log("- isHidden:", isHidden);
  
  // 7. Presign URL al
  const presignBody = {
    filename: 'encrypted.bin', // Backend gerçek adı bilmeyecek
    mimeType: 'application/octet-stream',
    cipherSizeBytes: ciphertext.length,
    folderId: folderId || null,
    isEncrypted: true,
    isHidden: isHidden === true, // Explicitly boolean
    cipherIv: bytesToBase64(cipherIv),
    edek: bytesToBase64(edek),
    edekIv: bytesToBase64(edekIv),
    metaNameEnc,
    metaNameIv: bytesToBase64(metaNameIv)
  };
  
  console.log("📤 [Mobile V3] Presign isteği gönderiliyor, isHidden:", presignBody.isHidden);
  
  const presignResponse = await fetch(`${apiBaseUrl}/api/files/v3/presign-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(presignBody)
  });
  
  if (!presignResponse.ok) {
    const errorText = await presignResponse.text();
    console.error("Presign hatası:", errorText);
    throw new Error("Upload presign hatası");
  }
  
  const { fileId, uploadUrl } = await presignResponse.json();
  console.log("✅ [Mobile V3] Presign URL alındı, fileId:", fileId);
  
  // 8. Şifreli veriyi R2'ye yükle (Uint8Array'i Buffer'a çevir)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream'
    },
    body: Buffer.from(ciphertext)
  });
  
  if (!uploadResponse.ok) {
    throw new Error("R2 upload hatası");
  }
  
  console.log("✅ [Mobile V3] R2'ye yükleme tamamlandı");
  
  // 9. Upload'ı onayla
  console.log("📤 [Mobile V3] Upload onayı gönderiliyor...");
  const confirmResponse = await fetch(`${apiBaseUrl}/api/files/v3/${fileId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      success: true,
      cipherIv: bytesToBase64(cipherIv),
      edek: bytesToBase64(edek),
      edekIv: bytesToBase64(edekIv),
      metaNameEnc,
      metaNameIv: bytesToBase64(metaNameIv)
    })
  });
  
  console.log("📡 [Mobile V3] Complete response status:", confirmResponse.status);
  
  if (!confirmResponse.ok) {
    const errorText = await confirmResponse.text();
    console.error("❌ Upload onay hatası:", errorText);
    throw new Error(`Upload onay hatası: ${errorText}`);
  }
  
  const confirmData = await confirmResponse.json();
  console.log("✅ [Mobile V3] Şifreli upload tamamlandı, fileId:", fileId);
  
  // Backend'den dönen response'u geri döndür (sürüm bilgisi içerebilir)
  return {
    fileId,
    isNewVersion: confirmData.isNewVersion,
    message: confirmData.message,
    previousVersion: confirmData.previousVersion
  };
}

/**
 * V3 Envelope Encryption ile şifreli dosyayı indir ve çöz
 * Web ile uyumlu format
 */
export async function downloadAndDecryptFileV3(
  fileId: string,
  fileName: string
): Promise<string> {
  console.log("🔓 [Mobile V3] Envelope decryption başlatılıyor...");
  console.log("📁 File ID:", fileId);
  console.log("📄 File name:", fileName);
  
  // Master key ve token'ı local storage'dan al
  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new Error("Master key bulunamadı");
  }
  
  const token = await storage.getAccessToken();
  if (!token) {
    throw new Error("Token bulunamadı");
  }
  
  const apiBaseUrl = API_BASE_URL;
  console.log("🌐 API URL:", `${apiBaseUrl}/api/files/v3/${fileId}/download`);
  
  // 1. Dosya metadata ve ciphertext'i indir
  const downloadResponse = await fetch(`${apiBaseUrl}/api/files/v3/${fileId}/download`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  console.log("📡 Download response status:", downloadResponse.status);
  
  if (!downloadResponse.ok) {
    const errorText = await downloadResponse.text();
    console.error("❌ Download hatası:", errorText);
    throw new Error("Dosya indirilemedi");
  }
  
  // 2. Encryption artifact'larını header'dan al
  const cipherIv = downloadResponse.headers.get("X-Cipher-Iv") || "";
  const edek = downloadResponse.headers.get("X-Edek") || "";
  const edekIv = downloadResponse.headers.get("X-Edek-Iv") || "";
  const metaNameEnc = downloadResponse.headers.get("X-Meta-Name-Enc") || "";
  const metaNameIv = downloadResponse.headers.get("X-Meta-Name-Iv") || "";
  
  if (!cipherIv || !edek || !edekIv || !metaNameEnc || !metaNameIv) {
    console.error("Eksik encryption artifacts:", { cipherIv, edek, edekIv, metaNameEnc, metaNameIv });
    throw new Error("Şifreleme bilgileri eksik");
  }
  
  // 3. Ciphertext'i al
  const ciphertextArrayBuffer = await downloadResponse.arrayBuffer();
  const ciphertext = new Uint8Array(ciphertextArrayBuffer);
  
  console.log("✅ [Mobile V3] Ciphertext indirildi, size:", ciphertext.length);
  console.log("🔍 [Debug] İlk 32 byte:", Array.from(ciphertext.slice(0, 32)));
  console.log("🔍 [Debug] Son 32 byte:", Array.from(ciphertext.slice(-32)));
  
  // 4. EDEK'i master key ile çöz (DEK'i elde et)
  const edekBytes = base64ToBytes(edek);
  const edekIvBytes = base64ToBytes(edekIv);
  console.log("🔍 [Debug] Master key length:", masterKey.length);
  console.log("🔍 [Debug] Master key first 8 bytes:", Array.from(masterKey.slice(0, 8)));
  console.log("🔍 [Debug] EDEK length:", edekBytes.length, "(should be 32 + 16 = 48 for AES-GCM)");
  console.log("🔍 [Debug] EDEK IV length:", edekIvBytes.length, "(should be 12)");
  console.log("🔍 [Debug] EDEK first 16 bytes:", Array.from(edekBytes.slice(0, 16)));
  console.log("🔍 [Debug] EDEK last 16 bytes (auth tag):", Array.from(edekBytes.slice(-16)));
  
  let dek: Uint8Array;
  try {
    dek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);
  } catch (error) {
    console.error("❌ EDEK deşifre hatası - Master key yanlış!");
    console.error("   Dosya farklı bir hesap veya şifre ile yüklenmiş.");
    console.error("   Çözüm: Dosyayı yükleyen hesap ve şifreyle giriş yapın.");
    throw new Error("Bu dosyayı açma yetkiniz yok. Dosya farklı bir hesap veya şifre ile şifrelenmiş.");
  }
  
  console.log("✅ [Mobile V3] DEK çözüldü, length:", dek.length);
  
  // 5. Dosyayı DEK ile çöz
  const cipherIvBytes = base64ToBytes(cipherIv);
  console.log("🔍 [Debug] DEK length:", dek.length, "(should be 32)");
  console.log("🔍 [Debug] Cipher IV length:", cipherIvBytes.length, "(should be 12)");
  console.log("🔍 [Debug] Ciphertext length:", ciphertext.length, "(should be original + 16)");
  
  const plaintext = await aesGcmDecrypt(dek, cipherIvBytes, ciphertext);
  
  console.log("✅ [Mobile V3] Dosya içeriği çözüldü, size:", plaintext.length);
  
  // 6. Dosya adını master key ile çöz
  const metaNameIvBytes = base64ToBytes(metaNameIv);
  const filename = await decryptString(masterKey, metaNameIvBytes, metaNameEnc);
  
  console.log("✅ [Mobile V3] Dosya adı çözüldü:", filename);
  
  // 7. Geçici dosyaya yaz (Yeni File API)
  const tempFile = new File(Paths.cache, filename);
  
  // Eğer dosya varsa sil
  try {
    const fileExists = await tempFile.exists;
    if (fileExists) {
      await tempFile.delete();
      console.log("🗑️ Eski dosya silindi:", filename);
    }
  } catch (e) {
    // Dosya yoksa devam et
  }
  
  // Plaintext'i binary olarak kaydet (create() kullanmadan direkt write)
  await tempFile.write(plaintext);
  
  console.log("✅ [Mobile V3] Dosya kaydedildi:", tempFile.uri);
  console.log("🔍 [Debug] Kaydedilen dosya boyutu:", plaintext.length, "bytes");
  
  return tempFile.uri;
}
