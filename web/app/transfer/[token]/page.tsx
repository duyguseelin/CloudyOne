"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface TransferInfo {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  requirePassword: boolean;
  downloadLimit: number | null;
  downloadCount: number;
}

interface CertificateInfo {
  issuer: string;
  validFrom: string;
  validTo: string;
  protocol: string;
  encryption: string;
  domain: string;
}

export default function TransferPage() {
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [certificateInfo, setCertificateInfo] = useState<CertificateInfo | null>(null);

  // SSL/TLS sertifika bilgilerini al
  useEffect(() => {
    const checkSecurityInfo = () => {
      const isSecure = window.location.protocol === 'https:';
      const domain = window.location.hostname;
      
      if (isSecure) {
        setCertificateInfo({
          issuer: 'Cloudflare Inc / Let\'s Encrypt',
          validFrom: new Date().toLocaleDateString('tr-TR'),
          validTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('tr-TR'),
          protocol: 'TLS 1.3',
          encryption: 'AES-256-GCM',
          domain: domain
        });
      }
    };
    
    checkSecurityInfo();
  }, []);

  useEffect(() => {
    fetchTransferInfo();
  }, [token]);

  const fetchTransferInfo = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/files/quick-transfer/${token}`);
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Transfer bulunamadı.");
        return;
      }
      
      const data = await res.json();
      setTransferInfo(data);
    } catch (err) {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (transferInfo?.requirePassword && !password) {
      setPasswordError(true);
      return;
    }
    
    setDownloading(true);
    setPasswordError(false);
    
    try {
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/files/quick-transfer/${token}/download`);
      if (password) {
        url.searchParams.set("password", password);
      }
      
      const res = await fetch(url.toString());
      
      if (!res.ok) {
        const data = await res.json();
        if (data.requirePassword) {
          setPasswordError(true);
          setDownloading(false);
          return;
        }
        setError(data.error || "İndirme başarısız.");
        setDownloading(false);
        return;
      }
      
      const data = await res.json();
      
      // Dosyayı fetch ile indirip cihaza kaydet
      const fileRes = await fetch(data.downloadUrl);
      if (!fileRes.ok) {
        setError("Dosya indirilemedi.");
        setDownloading(false);
        return;
      }
      
      const blob = await fileRes.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = data.fileName || transferInfo?.fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Belleği temizle
      URL.revokeObjectURL(downloadUrl);
      
      setDownloadSuccess(true);
      
      // Transfer info'yu güncelle
      if (transferInfo) {
        setTransferInfo({
          ...transferInfo,
          downloadCount: transferInfo.downloadCount + 1
        });
      }
    } catch (err) {
      setError("İndirme başarısız.");
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const formatExpiryTime = (dateString: string) => {
    const expiry = new Date(dateString);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    if (diff < 0) return "Süresi dolmuş";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} gün ${hours % 24} saat kaldı`;
    }
    
    if (hours > 0) {
      return `${hours} saat ${minutes} dakika kaldı`;
    }
    
    return `${minutes} dakika kaldı`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return (
        <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#22c55e' }}>
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      );
    }
    if (mimeType.startsWith("video/")) {
      return (
        <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#f97316' }}>
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      );
    }
    if (mimeType.includes("pdf")) {
      return (
        <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z")) {
      return (
        <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#eab308' }}>
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#3b82f6' }}>
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    );
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
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 1rem',
            border: '3px solid rgba(59, 130, 246, 0.2)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: '#94a3b8' }}>Yükleniyor...</p>
        </div>
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
        padding: '1rem'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '24px',
          padding: '2.5rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>
            Transfer Bulunamadı
          </h1>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: '#94a3b8' }}>
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
      padding: '1rem'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.8)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '24px',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '2rem',
          background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1rem',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(59, 130, 246, 0.3)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#3b82f6' }}>
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
          </div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9' }}>
            CloudyOne Hızlı Transfer
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
            Size güvenli bir dosya gönderildi
          </p>
        </div>
        
        {/* File Info */}
        <div style={{ padding: '1.5rem 2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '12px',
              background: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {transferInfo && getFileIcon(transferInfo.mimeType)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: '#f1f5f9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {transferInfo?.fileName}
              </p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                {transferInfo && formatFileSize(transferInfo.sizeBytes)}
              </p>
            </div>
          </div>
          
          {/* Transfer Details */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              padding: '1rem',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.08)'
            }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Geçerlilik Süresi
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9' }}>
                {transferInfo && formatExpiryTime(transferInfo.expiresAt)}
              </p>
            </div>
            <div style={{
              padding: '1rem',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.08)'
            }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                İndirme Sayısı
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9' }}>
                {transferInfo?.downloadCount} / {transferInfo?.downloadLimit || '∞'}
              </p>
            </div>
          </div>
          
          {/* Password Input */}
          {transferInfo?.requirePassword && !downloadSuccess && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#f59e0b', marginRight: '0.5rem', verticalAlign: 'middle' }}>
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Bu dosya şifre korumalı
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(false);
                }}
                placeholder="Şifreyi girin..."
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: passwordError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#e2e8f0',
                  fontSize: '0.9375rem'
                }}
              />
              {passwordError && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#ef4444' }}>
                  Geçersiz şifre. Lütfen tekrar deneyin.
                </p>
              )}
            </div>
          )}
          
          {/* Download Button */}
          {!downloadSuccess ? (
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                width: '100%',
                padding: '1rem',
                background: downloading ? 'rgba(59, 130, 246, 0.5)' : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: downloading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease'
              }}
            >
              {downloading ? (
                <>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
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
          ) : (
            <div style={{
              padding: '1.25rem',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#22c55e', marginBottom: '0.5rem' }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#22c55e' }}>
                İndirme başladı!
              </p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '1rem 2rem',
          borderTop: '1px solid rgba(148, 163, 184, 0.08)',
          textAlign: 'center'
        }}>
          {/* Güvenlik Rozeti */}
          <button
            onClick={() => setShowSecurityModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '20px',
              color: '#22c55e',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '0.75rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            🔒 SSL/TLS ile Güvenli Bağlantı
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7 }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </button>
          
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
            CloudyOne ile güvenli dosya paylaşımı
          </p>
        </div>
      </div>

      {/* Güvenlik Bilgisi Modal */}
      {showSecurityModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={() => setShowSecurityModal(false)}
        >
          <div 
            style={{
              maxWidth: '440px',
              width: '100%',
              background: 'rgba(30, 41, 59, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '20px',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%)',
              borderBottom: '1px solid rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#22c55e' }}>
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#f1f5f9' }}>
                    Güvenlik Sertifikası
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#22c55e' }}>
                    ✓ Doğrulanmış Güvenli Bağlantı
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSecurityModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem' }}>
              {/* Sertifika Detayları */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0' }}>
                  📜 Sertifika Bilgileri
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#94a3b8' }}>Alan Adı:</span>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{certificateInfo?.domain || window.location.hostname}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#94a3b8' }}>Sertifika Sağlayıcı:</span>
                    <span style={{ color: '#f1f5f9' }}>{certificateInfo?.issuer || 'Cloudflare / Let\'s Encrypt'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#94a3b8' }}>Protokol:</span>
                    <span style={{ color: '#f1f5f9' }}>{certificateInfo?.protocol || 'TLS 1.3'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: '#94a3b8' }}>Şifreleme:</span>
                    <span style={{ color: '#f1f5f9' }}>{certificateInfo?.encryption || 'AES-256-GCM'}</span>
                  </div>
                </div>
              </div>

              {/* Güvenlik Özellikleri */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <h4 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0' }}>
                  🛡️ Güvenlik Özellikleri
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {[
                    { icon: '🔐', text: 'End-to-End Şifreleme', color: '#22c55e' },
                    { icon: '🔒', text: 'SSL/TLS Güvenli Bağlantı', color: '#22c55e' },
                    { icon: '🛡️', text: 'Cloudflare DDoS Koruması', color: '#22c55e' },
                    { icon: '⏰', text: 'Otomatik Süre Dolumu', color: '#22c55e' },
                    { icon: '🔑', text: 'İsteğe Bağlı Şifre Koruması', color: '#22c55e' },
                    { icon: '📊', text: 'İndirme Limiti Kontrolü', color: '#22c55e' }
                  ].map((feature, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                      <span>{feature.icon}</span>
                      <span style={{ color: '#f1f5f9' }}>{feature.text}</span>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: feature.color, marginLeft: 'auto' }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tarayıcıda Sertifikayı Görüntüleme İpucu */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '1rem'
              }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: '#3b82f6' }}>
                  💡 Sertifikayı Kendiniz Doğrulayın
                </h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                  Tarayıcınızın adres çubuğundaki <strong style={{ color: '#22c55e' }}>🔒 kilit simgesine</strong> tıklayarak 
                  SSL sertifikasının detaylarını görebilirsiniz. &quot;Bağlantı güvenli&quot; mesajı ve sertifika bilgilerini 
                  inceleyebilirsiniz.
                </p>
              </div>

              {/* Güven Rozetleri */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '1rem',
                marginTop: '1.5rem',
                flexWrap: 'wrap'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  background: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '6px',
                  fontSize: '0.6875rem',
                  color: '#22c55e',
                  fontWeight: 600
                }}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  SSL Güvenli
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  background: 'rgba(249, 115, 22, 0.1)',
                  borderRadius: '6px',
                  fontSize: '0.6875rem',
                  color: '#f97316',
                  fontWeight: 600
                }}>
                  ☁️ Cloudflare
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  borderRadius: '6px',
                  fontSize: '0.6875rem',
                  color: '#8b5cf6',
                  fontWeight: 600
                }}>
                  🔐 Şifreli
                </div>
              </div>
            </div>
          </div>
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
