"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface ShareInfo {
  filename: string;
  originalFilename?: string; // Şifresiz dosyalar için gerçek ad
  sizeBytes: number;
  mimeType: string | null;
  permission: "VIEW" | "DOWNLOAD" | "EDIT";
  expiresAt: string | null;
  isEncrypted: boolean;
  downloadUrl: string;
  cipherIv?: string; // Backend'den gelen IV
}

// AES-GCM Decryption helpers
function b64ToU8(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Uint8Array'i ArrayBuffer'a dönüştür (WebCrypto uyumluluğu için)
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.length);
  const view = new Uint8Array(buffer);
  view.set(data);
  return buffer;
}

async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const keyBuffer = toArrayBuffer(keyBytes);
  const ivBuffer = toArrayBuffer(ivBytes);
  const cipherBuffer = toArrayBuffer(ciphertext);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    cipherBuffer
  );

  return new Uint8Array(plaintext);
}

async function decryptString(
  keyBytes: Uint8Array,
  ivBytes: Uint8Array,
  ciphertextB64: string
): Promise<string> {
  const ciphertext = b64ToU8(ciphertextB64);
  const plaintext = await aesGcmDecrypt(keyBytes, ivBytes, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// Dosya uzantısından mimeType tahmin et
function getMimeTypeFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'text/xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
  };
  return ext ? mimeMap[ext] || null : null;
}

// Önizlenebilir dosya türlerini kontrol et
function isPreviewable(mimeType: string | null, filename?: string): boolean {
  // mimeType application/octet-stream ise dosya adından tahmin et
  let effectiveMime = mimeType;
  if ((!mimeType || mimeType === 'application/octet-stream') && filename) {
    effectiveMime = getMimeTypeFromFilename(filename);
  }
  
  if (!effectiveMime) return false;
  return effectiveMime.startsWith('image/') || 
         effectiveMime === 'application/pdf' ||
         effectiveMime.startsWith('video/') ||
         effectiveMime.startsWith('audio/') ||
         effectiveMime.startsWith('text/');
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [decryptedFilename, setDecryptedFilename] = useState<string | null>(null);
  const [decryptProgress, setDecryptProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // URL fragment'tan şifreleme bilgilerini al (plain DEK)
  const [dekData, setDekData] = useState<{
    dek: string;        // Plain DEK (Base64)
    cipherIv: string;   // Dosya içeriği için IV
    metaNameEnc: string; // Şifreli dosya adı
    metaNameIv: string;  // Dosya adı için IV
  } | null>(null);
  
  useEffect(() => {
    // Fragment'tan şifreleme bilgilerini parse et
    const hash = window.location.hash;
    if (hash.startsWith('#dek=')) {
      try {
        const dekFragment = hash.slice(5); // #dek= kısmını çıkar
        const parts = dekFragment.split('.').map(p => decodeURIComponent(p));
        if (parts.length === 4) {
          setDekData({
            dek: parts[0],
            cipherIv: parts[1],
            metaNameEnc: parts[2],
            metaNameIv: parts[3]
          });
        }
      } catch (e) {
        console.error("Fragment parse error:", e);
      }
    }
    
    fetchShareInfo();
  }, [token]);
  
  // Şifreli dosya adını çöz
  useEffect(() => {
    if (dekData && shareInfo?.isEncrypted) {
      decryptFilenameFromDek();
    }
  }, [dekData, shareInfo]);
  
  const fetchShareInfo = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/share/${token}/info`);
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Paylaşım bulunamadı");
        return;
      }
      
      const data = await res.json();
      setShareInfo(data);
    } catch (err) {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };
  
  const decryptFilenameFromDek = async () => {
    if (!dekData || !dekData.metaNameEnc || !dekData.metaNameIv) return;
    
    try {
      // Plain DEK ile dosya adını çöz
      // NOT: Dosya adı master key ile şifrelenmiş, DEK ile değil
      // Bu nedenle şifreli dosya adını çözmek için farklı bir yaklaşım gerekli
      // Şimdilik "Şifreli Dosya" gösterelim
      // İleride backend'den çözülmüş filename dönülebilir veya
      // metaNameEnc DEK ile şifrelenebilir
    } catch (err) {
      console.error("Filename decrypt error:", err);
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };
  
  // Efektif mimeType hesapla (dosya adından tahmin et)
  const getEffectiveMimeType = (): string => {
    if (shareInfo?.mimeType && shareInfo.mimeType !== 'application/octet-stream') {
      return shareInfo.mimeType;
    }
    // Dosya adından tahmin et
    const filename = shareInfo?.originalFilename || shareInfo?.filename || '';
    return getMimeTypeFromFilename(filename) || 'application/octet-stream';
  };
  
  // Dosyayı indir ve opsiyonel olarak decrypt et
  const fetchAndDecrypt = async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!shareInfo) return null;
    
    try {
      if (shareInfo.isEncrypted) {
        // DEK kontrolü - URL'den veya başka yerden
        const effectiveDek = dekData?.dek;
        if (!effectiveDek) {
          throw new Error("Şifre çözme anahtarı bulunamadı. Lütfen tam paylaşım linkini kullanın.");
        }
        
        // Şifreli dosya - client-side decrypt
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/share/${token}/download-encrypted`);
        if (!res.ok) {
          const errText = await res.text();
          console.error("Download failed:", res.status, errText);
          throw new Error(`Dosya indirilemedi (${res.status})`);
        }
        
        // IV: önce header, sonra dekData, sonra shareInfo
        const cipherIv = res.headers.get("X-Cipher-Iv") || dekData?.cipherIv || shareInfo.cipherIv;
        if (!cipherIv) {
          throw new Error("Şifreleme IV bilgisi bulunamadı.");
        }
        
        const ciphertext = new Uint8Array(await res.arrayBuffer());
        
        const dekBytes = b64ToU8(effectiveDek);
        const cipherIvBytes = b64ToU8(cipherIv);
        
        const plaintext = await aesGcmDecrypt(dekBytes, cipherIvBytes, ciphertext);
        
        // Dosya adı ve mimeType
        const effectiveMime = getEffectiveMimeType();
        let filename = shareInfo.originalFilename || "indirilen_dosya";
        if (!shareInfo.originalFilename && effectiveMime !== 'application/octet-stream') {
          const ext = getExtensionFromMime(effectiveMime);
          if (ext) filename = "indirilen_dosya" + ext;
        }
        
        const plaintextBuffer = toArrayBuffer(plaintext);
        const blob = new Blob([plaintextBuffer], { type: effectiveMime });
        
        return { blob, filename };
      } else {
        // Şifresiz dosya
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/share/${token}`);
        if (!res.ok) throw new Error("Dosya indirilemedi");
        
        const blob = await res.blob();
        const filename = shareInfo.filename || "dosya";
        return { blob, filename };
      }
    } catch (err) {
      console.error("Fetch/decrypt error:", err);
      throw err;
    }
  };
  
  const handleDownload = async () => {
    if (!shareInfo) return;
    
    console.log("📥 handleDownload çağrıldı", { 
      isEncrypted: shareInfo.isEncrypted, 
      hasDekData: !!dekData,
      dekData: dekData ? { dek: dekData.dek?.slice(0, 20) + '...', cipherIv: dekData.cipherIv?.slice(0, 20) + '...' } : null,
      hash: window.location.hash?.slice(0, 50) + '...'
    });
    
    // Şifreli dosya için DEK zorunlu
    if (shareInfo.isEncrypted && !dekData) {
      setError("Şifre çözme anahtarı eksik. Lütfen tam paylaşım linkini kullanın.");
      return;
    }
    
    setDownloading(true);
    setDecryptProgress(0);
    
    try {
      if (shareInfo.isEncrypted && dekData) {
        // Şifreli dosya - client-side decrypt
        setDecryptProgress(10);
        
        // 1. Şifreli içeriği indir
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/share/${token}/download-encrypted`);
        if (!res.ok) {
          const errText = await res.text();
          console.error("Download failed:", res.status, errText);
          throw new Error(`Dosya indirilemedi (${res.status})`);
        }
        
        setDecryptProgress(30);
        
        // Header'dan veya fragment'tan cipher IV al
        const cipherIv = res.headers.get("X-Cipher-Iv") || dekData.cipherIv;
        
        const ciphertext = new Uint8Array(await res.arrayBuffer());
        setDecryptProgress(50);
        
        // 2. Plain DEK ile dosyayı çöz
        const dekBytes = b64ToU8(dekData.dek);
        const cipherIvBytes = b64ToU8(cipherIv);
        
        console.log("🔐 Şifre çözülüyor...", { 
          dekLength: dekBytes.length, 
          ivLength: cipherIvBytes.length,
          ciphertextLength: ciphertext.length 
        });
        
        const plaintext = await aesGcmDecrypt(dekBytes, cipherIvBytes, ciphertext);
        setDecryptProgress(80);
        
        console.log("✅ Şifre çözüldü, boyut:", plaintext.length);
        
        // 3. Dosya adını belirle (öncelik: decryptedFilename > originalFilename > mimeType'dan tahmin)
        let filename = decryptedFilename || shareInfo.originalFilename || "indirilen_dosya";
        // Eğer uzantı yoksa mimeType'dan ekle
        if (!filename.includes('.') && shareInfo.mimeType) {
          const ext = getExtensionFromMime(shareInfo.mimeType);
          if (ext) filename += ext;
        }
        
        // 4. Blob oluştur ve indir
        const effectiveMime = getEffectiveMimeType();
        const plaintextBuffer = toArrayBuffer(plaintext);
        const blob = new Blob([plaintextBuffer], { 
          type: effectiveMime || 'application/octet-stream' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setDecryptProgress(100);
        
      } else {
        // Şifresiz dosya - direkt indir
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/share/${token}`;
      }
    } catch (err: any) {
      console.error("Download error:", err);
      setError(err.message || "İndirme hatası");
    } finally {
      setDownloading(false);
    }
  };
  
  // Önizleme fonksiyonu
  const handlePreview = async () => {
    const effectiveMime = getEffectiveMimeType();
    const filename = shareInfo?.originalFilename || shareInfo?.filename;
    if (!shareInfo || !isPreviewable(effectiveMime, filename)) return;
    
    // Önceki önizleme URL'ini temizle
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    setPreviewLoading(true);
    setShowPreview(true);
    
    try {
      const result = await fetchAndDecrypt();
      if (result) {
        const url = URL.createObjectURL(result.blob);
        setPreviewUrl(url);
      }
    } catch (err: any) {
      console.error("Preview error:", err);
      setError(err.message || "Önizleme hatası");
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  };
  
  // Önizlemeyi kapat
  const closePreview = () => {
    setShowPreview(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);
  
  const getExtensionFromMime = (mimeType: string): string => {
    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/json': '.json',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    return mimeMap[mimeType] || '';
  };
  
  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return '📁';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    return '📁';
  };
  
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: 48,
          height: 48,
          border: '3px solid rgba(139, 92, 246, 0.3)',
          borderTopColor: '#8b5cf6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 24,
          padding: 40,
          textAlign: 'center',
          maxWidth: 400
        }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <svg width="32" height="32" viewBox="0 0 20 20" fill="#ef4444">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 style={{ color: '#f1f5f9', fontSize: 20, marginBottom: 10 }}>
            Paylaşım Bulunamadı
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: 'rgba(30, 41, 59, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: 24,
        padding: 40,
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 24px',
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 999,
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="url(#shareGrad)" />
              <defs>
                <linearGradient id="shareGrad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="#8b5cf6" />
                  <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18 }}>
              CloudyOne
            </span>
          </div>
        </div>
        
        {/* Dosya Bilgisi */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56,
              height: 56,
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28
            }}>
              {shareInfo?.isEncrypted ? '🔐' : getFileIcon(shareInfo?.mimeType || null)}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{
                color: '#f1f5f9',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 4,
                wordBreak: 'break-word'
              }}>
                {decryptedFilename || shareInfo?.filename || 'Dosya'}
              </h2>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>
                {formatFileSize(shareInfo?.sizeBytes || 0)}
                {shareInfo?.isEncrypted && (
                  <span style={{
                    marginLeft: 8,
                    padding: '2px 8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    🔐 Şifreli
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        
        {/* Şifreleme Uyarısı */}
        {shareInfo?.isEncrypted && dekData && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#34d399" style={{ flexShrink: 0, marginTop: 2 }}>
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <div>
                <p style={{ color: '#34d399', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Uçtan Uca Şifrelenmiş
                </p>
                <p style={{ color: '#94a3b8', fontSize: 12 }}>
                  Bu dosya güvenli bir şekilde şifrelenmiştir. İndirme işlemi başladığında tarayıcınızda şifresi çözülecektir.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* DEK Uyarısı - Şifreli dosya için anahtar yoksa */}
        {shareInfo?.isEncrypted && !dekData && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#ef4444" style={{ flexShrink: 0, marginTop: 2 }}>
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Şifre Çözme Anahtarı Eksik
                </p>
                <p style={{ color: '#94a3b8', fontSize: 12 }}>
                  Bu dosyayı görüntülemek için tam paylaşım linkine ihtiyacınız var. Lütfen size gönderilen orijinal linki kullanın.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Progress Bar */}
        {(downloading || previewLoading) && decryptProgress > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              height: 6,
              background: 'rgba(148, 163, 184, 0.2)',
              borderRadius: 999,
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${decryptProgress}%`,
                background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                borderRadius: 999,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
              {decryptProgress < 40 ? 'İndiriliyor...' : decryptProgress < 80 ? 'Şifre çözülüyor...' : 'Tamamlanıyor...'}
            </p>
          </div>
        )}
        
        {/* Butonlar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Önizleme Butonu - Görüntülenebilir dosyalar için (dosya adından mimeType tahmin et) */}
          {isPreviewable(shareInfo?.mimeType || null, shareInfo?.originalFilename || shareInfo?.filename) && (
            <button
              onClick={handlePreview}
              disabled={downloading || previewLoading || (shareInfo?.isEncrypted && !dekData)}
              style={{
                width: '100%',
                padding: '16px 24px',
                background: (shareInfo?.isEncrypted && !dekData) ? 'rgba(148, 163, 184, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 12,
                color: (shareInfo?.isEncrypted && !dekData) ? '#64748b' : '#34d399',
                fontSize: 15,
                fontWeight: 700,
                cursor: (downloading || previewLoading || (shareInfo?.isEncrypted && !dekData)) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 0.2s'
              }}
            >
              {previewLoading ? (
                <>
                  <div style={{
                    width: 18,
                    height: 18,
                    border: '2px solid rgba(52, 211, 153, 0.3)',
                    borderTopColor: '#34d399',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Yükleniyor...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  {shareInfo?.permission === 'VIEW' ? 'Dosyayı Görüntüle' : 'Önizle'}
                </>
              )}
            </button>
          )}
          
          {/* İndir Butonu - DOWNLOAD veya EDIT izninde göster */}
          {(shareInfo?.permission === 'DOWNLOAD' || shareInfo?.permission === 'EDIT') && (
            <button
              onClick={handleDownload}
              disabled={downloading || (shareInfo?.isEncrypted && !dekData)}
              style={{
                width: '100%',
                padding: '16px 24px',
                background: (downloading || (shareInfo?.isEncrypted && !dekData))
                  ? 'rgba(139, 92, 246, 0.3)' 
                  : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                fontSize: 15,
                fontWeight: 700,
                cursor: (downloading || (shareInfo?.isEncrypted && !dekData)) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 0.2s',
                boxShadow: (downloading || (shareInfo?.isEncrypted && !dekData)) ? 'none' : '0 4px 20px rgba(139, 92, 246, 0.4)'
              }}
            >
              {downloading ? (
                <>
                  <div style={{
                    width: 18,
                    height: 18,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  İndiriliyor...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Dosyayı İndir
                </>
              )}
            </button>
          )}
          
          {/* İzin bilgisi */}
          <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>
            {shareInfo?.permission === 'VIEW' && '👁️ Bu dosya sadece görüntüleme izniyle paylaşılmıştır.'}
            {shareInfo?.permission === 'DOWNLOAD' && '📥 Bu dosyayı görüntüleyebilir ve indirebilirsiniz.'}
            {shareInfo?.permission === 'EDIT' && '✏️ Bu dosyayı görüntüleyebilir, indirebilir ve düzenleyebilirsiniz.'}
          </p>
        </div>
        
        {/* Süre Bilgisi */}
        {shareInfo?.expiresAt && (
          <p style={{
            color: '#64748b',
            fontSize: 12,
            textAlign: 'center',
            marginTop: 16
          }}>
            Bu link <strong style={{ color: '#94a3b8' }}>
              {new Date(shareInfo.expiresAt).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </strong> tarihine kadar geçerlidir.
          </p>
        )}
      </div>
      
      {/* Önizleme Modal */}
      {showPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          {/* Kapat butonu */}
          <button
            onClick={closePreview}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 44,
              height: 44,
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              transition: 'background 0.2s'
            }}
          >
            ✕
          </button>
          
          {/* Yükleniyor */}
          {previewLoading && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 48,
                height: 48,
                border: '3px solid rgba(139, 92, 246, 0.3)',
                borderTopColor: '#8b5cf6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
              }} />
              <p style={{ color: '#94a3b8' }}>Şifre çözülüyor ve yükleniyor...</p>
            </div>
          )}
          
          {/* Önizleme İçeriği */}
          {!previewLoading && previewUrl && (() => {
            const effectiveMime = getEffectiveMimeType();
            return (
            <div style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              overflow: 'auto',
              borderRadius: 12,
              background: '#1e293b'
            }}>
              {effectiveMime.startsWith('image/') && (
                <img 
                  src={previewUrl} 
                  alt="Önizleme"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '85vh',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />
              )}
              
              {effectiveMime === 'application/pdf' && (
                <iframe
                  src={previewUrl}
                  style={{
                    width: '90vw',
                    height: '85vh',
                    border: 'none'
                  }}
                  title="PDF Önizleme"
                />
              )}
              
              {effectiveMime.startsWith('video/') && (
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '85vh'
                  }}
                />
              )}
              
              {effectiveMime.startsWith('audio/') && (
                <div style={{ padding: 40 }}>
                  <div style={{
                    width: 120,
                    height: 120,
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 48,
                    margin: '0 auto 24px'
                  }}>
                    🎵
                  </div>
                  <audio
                    src={previewUrl}
                    controls
                    autoPlay
                    style={{ width: '100%', minWidth: 300 }}
                  />
                </div>
              )}
              
              {effectiveMime.startsWith('text/') && (
                <iframe
                  src={previewUrl}
                  style={{
                    width: '80vw',
                    height: '80vh',
                    border: 'none',
                    background: '#0f172a'
                  }}
                  title="Metin Önizleme"
                />
              )}
            </div>
            );
          })()}
          
          {/* Alt buton - Kapat */}
          {!previewLoading && previewUrl && (
            <div style={{
              marginTop: 20,
              display: 'flex',
              gap: 12
            }}>
              <button
                onClick={closePreview}
                style={{
                  padding: '12px 24px',
                  background: 'rgba(148, 163, 184, 0.2)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#94a3b8',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Kapat
              </button>
            </div>
          )}
        </div>
      )}
      
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
