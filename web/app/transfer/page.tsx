"use client";

import React, { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearAuth } from "../../lib/api";
import Sidebar from "../../components/Sidebar";
import "../globals.css";

// Token'ı doğru storage'dan al
function getStoredToken() {
  if (typeof window === "undefined") return null;
  const authStorage = localStorage.getItem("authStorage");
  const storage = authStorage === "session" ? sessionStorage : localStorage;
  const keys = ["cloudyone_token", "token"];
  for (const key of keys) {
    const v = storage.getItem(key);
    if (v) return v;
  }
  // Fallback
  for (const key of keys) {
    const v = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (v) return v;
  }
  return null;
}

interface FileItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface TransferResult {
  link: string;
  expiresAt: string;
  downloadLimit: number | null;
}

interface TransferHistoryItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  link: string;
  shareToken: string;
  expiresAt: string;
  isExpired: boolean;
  downloadLimit: number | null;
  downloadCount: number;
  hasPassword: boolean;
  sendMethod: 'link' | 'email';
  recipientEmail: string | null;
  message: string | null;
  createdAt: string;
}

export default function TransferPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Transfer settings
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sendMethod, setSendMethod] = useState<'link' | 'email'>('link');
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [message, setMessage] = useState('');
  const [expiryOption, setExpiryOption] = useState<string | null>(null);
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [downloadLimit, setDownloadLimit] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [notifyOnDownload, setNotifyOnDownload] = useState(true);
  const [customFileName, setCustomFileName] = useState('');
  
  // E-posta detay modalı
  const [emailDetailModal, setEmailDetailModal] = useState<{ emails: string[], fileName: string } | null>(null);
  
  // UI state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Transfer History
  const [transferHistory, setTransferHistory] = useState<TransferHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  
  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; fileName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingExpired, setDeletingExpired] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  React.useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setLoading(false);
    loadTransferHistory();
  }, [router]);

  const loadTransferHistory = async () => {
    try {
      setHistoryLoading(true);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/files/quick-transfer/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransferHistory(data.transfers || []);
      }
    } catch (err) {
      console.error('Transfer geçmişi yüklenemedi:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const showDeleteConfirm = (id: string, fileName: string) => {
    setDeleteConfirm({ id, fileName });
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const deleteExpiredTransfers = async () => {
    const expiredCount = transferHistory.filter(t => t.isExpired).length;
    if (expiredCount === 0) {
      return;
    }
    
    if (!confirm(`${expiredCount} süresi dolmuş transfer silinecek. Devam etmek istiyor musunuz?`)) {
      return;
    }
    
    setDeletingExpired(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/files/quick-transfer/expired`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Süresi dolmuşları listeden kaldır
        setTransferHistory(prev => prev.filter(t => !t.isExpired));
      }
    } catch (err) {
      console.error('Süresi dolmuş transferler silinemedi:', err);
    } finally {
      setDeletingExpired(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    
    setDeleting(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/files/quick-transfer/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setTransferHistory(prev => prev.filter(t => t.id !== deleteConfirm.id));
      }
    } catch (err) {
      console.error('Transfer silinemedi:', err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const copyHistoryLink = (link: string, id: string) => {
    // Linki doğrudan kopyala (TLS ile güvenli)
    try {
      navigator.clipboard.writeText(link);
    } catch (e) {
      console.error('Link kopyalama hatası:', e);
      navigator.clipboard.writeText(link);
    }
    
    setCopiedHistoryId(id);
    setTimeout(() => setCopiedHistoryId(null), 2000);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const fileItems: FileItem[] = newFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...fileItems]);
    setTransferResult(null);
    setError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const getTotalSize = () => {
    return files.reduce((sum, f) => sum + f.file.size, 0);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return '📦';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    return '📁';
  };

  const createTransfer = async () => {
    if (files.length === 0) {
      setError('Lütfen en az bir dosya ekleyin');
      return;
    }

    if (!expiryOption || (expiryOption === 'custom' && !customExpiryDate)) {
      setError('Lütfen son geçerlilik tarihini seçin');
      return;
    }

    if (sendMethod === 'email' && recipientEmails.length === 0) {
      setError('Lütfen en az bir alıcı e-posta adresi girin');
      return;
    }

    if (usePassword && !password) {
      setError('Lütfen bir şifre belirleyin');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const token = getStoredToken();
      
      // Her dosya için ayrı transfer oluştur (şimdilik tek dosya)
      // İleride ZIP olarak birleştirilebilir
      const file = files[0].file;
      
      // Dosyayı doğrudan gönder (TLS güvenliği ile korunur)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('expiry', getExpiryValue());
      if (downloadLimit) formData.append('downloadLimit', downloadLimit.toString());
      if (usePassword && password) formData.append('password', password);
      if (customFileName.trim()) formData.append('customFileName', customFileName.trim());
      
      // E-posta ile gönderim için ek parametreler
      if (sendMethod === 'email' && recipientEmails.length > 0) {
        formData.append('recipientEmails', JSON.stringify(recipientEmails));
        if (message) formData.append('message', message);
      }

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percent);
        }
      });

      const result = await new Promise<TransferResult>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || 'Transfer başarısız'));
            } catch {
              reject(new Error('Transfer başarısız'));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Bağlantı hatası'));
        
        xhr.open('POST', `${API_BASE}/files/quick-transfer`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      // Transfer sonucunu kaydet (TLS ile güvenli transfer)
      setTransferResult(result);
      loadTransferHistory(); // Geçmişi güncelle

    } catch (err: any) {
      setError(err.message || 'Transfer oluşturulamadı');
    } finally {
      setUploading(false);
    }
  };

  const copyLink = () => {
    if (transferResult?.link) {
      navigator.clipboard.writeText(transferResult.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetTransfer = () => {
    setFiles([]);
    setTransferResult(null);
    setError(null);
    setUploadProgress(0);
    setPassword('');
    setUsePassword(false);
    setRecipientEmails([]);
    setEmailInput('');
    setMessage('');
    setCustomFileName('');
  };

  const formatExpiry = (option: string | null) => {
    if (!option) return 'Seçilmedi';
    switch (option) {
      case '1h': return '1 saat';
      case '6h': return '6 saat';
      case '24h': return '24 saat';
      case '3d': return '3 gün';
      case '7d': return '7 gün';
      case 'custom': 
        if (customExpiryDate) {
          const date = new Date(customExpiryDate);
          return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
        return 'Özel tarih';
      default: return option;
    }
  };

  const getExpiryValue = () => {
    if (expiryOption === 'custom' && customExpiryDate) {
      return customExpiryDate;
    }
    return expiryOption || '7d';
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
        <div className="animate-spin" style={{ 
          width: 40, 
          height: 40, 
          border: '3px solid rgba(139, 92, 246, 0.3)',
          borderTopColor: '#8b5cf6',
          borderRadius: '50%'
        }} />
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)'
    }}>
      <Sidebar user={user} />
      
      <main style={{ 
        flex: 1, 
        marginLeft: '280px',
        paddingTop: '2rem',
        paddingBottom: '2rem',
        paddingLeft: '2rem',
        paddingRight: 'calc(2rem + 280px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100vh',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{ 
          width: '100%', 
          maxWidth: '700px', 
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 700, 
            color: '#ffffff',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#gradient1)" strokeWidth="2">
              <defs>
                <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
            CloudyOne Transfer
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem' }}>
            Büyük dosyalarınızı güvenle ve hızlıca paylaşın
          </p>
        </div>

        {/* Main Card */}
        <div style={{
          width: '100%',
          maxWidth: '700px',
          background: 'rgba(30, 41, 59, 0.6)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '24px',
          overflow: 'hidden'
        }}>
          {/* Tab Selector */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
          }}>
            <button
              onClick={() => setSendMethod('link')}
              style={{
                flex: 1,
                padding: '1rem',
                background: sendMethod === 'link' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                border: 'none',
                borderBottom: sendMethod === 'link' ? '2px solid #8b5cf6' : '2px solid transparent',
                color: sendMethod === 'link' ? '#a78bfa' : '#94a3b8',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Bağlantı Oluştur
            </button>
            <button
              onClick={() => setSendMethod('email')}
              style={{
                flex: 1,
                padding: '1rem',
                background: sendMethod === 'email' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                border: 'none',
                borderBottom: sendMethod === 'email' ? '2px solid #8b5cf6' : '2px solid transparent',
                color: sendMethod === 'email' ? '#a78bfa' : '#94a3b8',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              E-posta ile Gönder
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '1.5rem' }}>
            {/* Transfer Result */}
            {transferResult ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem'
                }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                
                {sendMethod === 'email' && recipientEmails.length > 0 ? (
                  <>
                    <h3 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      E-posta{recipientEmails.length > 1 ? 'lar' : ''} Gönderildi!
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Transfer linki <span style={{ color: '#a78bfa', fontWeight: 500 }}>{recipientEmails.length}</span> adrese gönderildi
                    </p>
                    
                    {/* Email Success Info */}
                    <div style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '12px',
                      padding: '1rem',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Alıcılar:</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingLeft: '1.5rem' }}>
                          {recipientEmails.map((email, idx) => (
                            <span key={idx} style={{ 
                              padding: '0.25rem 0.6rem', 
                              background: 'rgba(139, 92, 246, 0.15)', 
                              borderRadius: '12px', 
                              color: '#c4b5fd', 
                              fontSize: '0.8rem' 
                            }}>
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>Geçerlilik: {formatExpiry(expiryOption)}</span>
                      </div>
                    </div>
                    
                    {/* Optional: Show link for sender reference */}
                    <details style={{ marginBottom: '1rem' }}>
                      <summary style={{ 
                        color: '#64748b', 
                        fontSize: '0.85rem', 
                        cursor: 'pointer',
                        marginBottom: '0.5rem'
                      }}>
                        Bağlantıyı göster
                      </summary>
                      <div style={{
                        display: 'flex',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        marginTop: '0.5rem'
                      }}>
                        <input
                          type="text"
                          value={transferResult.link}
                          readOnly
                          style={{
                            flex: 1,
                            padding: '0.75rem 1rem',
                            background: 'transparent',
                            border: 'none',
                            color: '#e2e8f0',
                            fontSize: '0.85rem',
                            outline: 'none'
                          }}
                        />
                        <button
                          onClick={copyLink}
                          style={{
                            padding: '0.75rem 1rem',
                            background: copied ? 'rgba(34, 197, 94, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                            border: 'none',
                            color: copied ? '#22c55e' : '#a78bfa',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {copied ? 'Kopyalandı' : 'Kopyala'}
                        </button>
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <h3 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Transfer Hazır!
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                      Bağlantınız {formatExpiry(expiryOption)} boyunca geçerli olacak
                    </p>

                    {/* Link Box */}
                    <div style={{
                      display: 'flex',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      marginBottom: '1rem'
                    }}>
                      <input
                        type="text"
                        value={transferResult.link}
                        readOnly
                        style={{
                          flex: 1,
                          padding: '1rem',
                          background: 'transparent',
                          border: 'none',
                          color: '#e2e8f0',
                          fontSize: '0.9rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={copyLink}
                        style={{
                          padding: '1rem 1.5rem',
                          background: copied ? 'rgba(34, 197, 94, 0.2)' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          border: 'none',
                          color: 'white',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s'
                        }}
                      >
                        {copied ? (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Kopyalandı
                          </>
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Kopyala
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* Info */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '2rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.85rem',
                  color: '#64748b'
                }}>
                  {usePassword && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Şifre korumalı
                    </span>
                  )}
                  {downloadLimit && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {downloadLimit} indirme limiti
                    </span>
                  )}
                </div>

                <button
                  onClick={resetTransfer}
                  style={{
                    padding: '0.875rem 2rem',
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Yeni Transfer Oluştur
                </button>
              </div>
            ) : (
              <>
                {/* Email Input (if email method) */}
                {sendMethod === 'email' && (
                  <div style={{ marginBottom: '1rem' }}>
                    {/* E-posta Chips */}
                    {recipientEmails.length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: '0.75rem'
                      }}>
                        {recipientEmails.map((email, idx) => (
                          <span
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.4rem 0.75rem',
                              background: 'rgba(139, 92, 246, 0.2)',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              borderRadius: '20px',
                              color: '#c4b5fd',
                              fontSize: '0.85rem'
                            }}
                          >
                            {email}
                            <button
                              onClick={() => setRecipientEmails(prev => prev.filter((_, i) => i !== idx))}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* E-posta Input */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="email"
                        placeholder="E-posta adresi ekle"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            const email = emailInput.trim().replace(',', '');
                            if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientEmails.includes(email)) {
                              setRecipientEmails(prev => [...prev, email]);
                              setEmailInput('');
                            }
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '0.875rem 1rem',
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '12px',
                          color: '#ffffff',
                          fontSize: '0.95rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => {
                          const email = emailInput.trim();
                          if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientEmails.includes(email)) {
                            setRecipientEmails(prev => [...prev, email]);
                            setEmailInput('');
                          }
                        }}
                        style={{
                          padding: '0.875rem 1.25rem',
                          background: 'rgba(139, 92, 246, 0.2)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '12px',
                          color: '#c4b5fd',
                          fontSize: '0.9rem',
                          cursor: 'pointer'
                        }}
                      >
                        Ekle
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                      Enter veya virgül ile birden fazla e-posta ekleyebilirsiniz
                    </p>
                    
                    <textarea
                      placeholder="Mesajınız (isteğe bağlı)"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.875rem 1rem',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '12px',
                        color: '#ffffff',
                        fontSize: '0.95rem',
                        outline: 'none',
                        resize: 'none',
                        fontFamily: 'inherit',
                        marginTop: '0.75rem'
                      }}
                    />
                  </div>
                )}

                {/* File Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? '#8b5cf6' : 'rgba(148, 163, 184, 0.3)'}`,
                    borderRadius: '16px',
                    padding: files.length > 0 ? '1rem' : '3rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: isDragging ? 'rgba(139, 92, 246, 0.1)' : 'rgba(15, 23, 42, 0.4)',
                    marginBottom: '1rem'
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  
                  {files.length === 0 ? (
                    <>
                      <div style={{
                        width: '64px',
                        height: '64px',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1rem'
                      }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <p style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                        Dosyalarınızı sürükleyin veya tıklayın
                      </p>
                      <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Maksimum 2 GB boyutunda dosya gönderebilirsiniz
                      </p>
                    </>
                  ) : (
                    <>
                      {/* File Header */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.75rem',
                        padding: '0 0.5rem'
                      }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                          {files.length} öğe • {formatFileSize(getTotalSize())}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          style={{
                            background: 'rgba(139, 92, 246, 0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            color: '#a78bfa',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Dosya Ekle
                        </button>
                      </div>
                      
                      {/* File List */}
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        {files.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.75rem',
                              background: 'rgba(30, 41, 59, 0.5)',
                              borderRadius: '10px',
                              marginBottom: '0.5rem'
                            }}
                          >
                            <span style={{ fontSize: '1.5rem' }}>{getFileIcon(item.file.type)}</span>
                            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                              <p style={{ 
                                color: '#e2e8f0', 
                                fontSize: '0.9rem', 
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {item.file.name}
                              </p>
                              <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                {formatFileSize(item.file.size)}
                              </p>
                            </div>
                            <button
                              onClick={() => removeFile(item.id)}
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.5rem',
                                cursor: 'pointer',
                                color: '#f87171',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Settings Toggle */}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    background: 'transparent',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '12px',
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: showSettings ? '1rem' : '1.5rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Transfer Ayarları
                  </span>
                  <svg 
                    width="18" 
                    height="18" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    style={{ transform: showSettings ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Settings Panel */}
                {showSettings && (
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.5)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    marginBottom: '1.5rem'
                  }}>
                    {/* Custom File Name */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        Görüntülenecek Dosya Adı (isteğe bağlı)
                      </label>
                      <input
                        type="text"
                        placeholder={files.length > 0 ? files[0].file.name : 'Dosya adı'}
                        value={customFileName}
                        onChange={(e) => setCustomFileName(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.625rem 1rem',
                          background: 'rgba(30, 41, 59, 0.6)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '0.9rem',
                          outline: 'none'
                        }}
                      />
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.375rem' }}>
                        Boş bırakılırsa orijinal dosya adı kullanılır
                      </p>
                    </div>

                    {/* Expiry */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        Son Geçerlilik Tarihi
                      </label>
                      
                      {/* Tarih ve Saat Seçimi */}
                      <div>
                        <input
                          type="datetime-local"
                          value={customExpiryDate}
                          min={new Date().toISOString().slice(0, 16)}
                          onChange={(e) => {
                            setCustomExpiryDate(e.target.value);
                            if (e.target.value) {
                              setExpiryOption('custom');
                            } else {
                              setExpiryOption(null);
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            background: expiryOption === 'custom' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                            border: expiryOption === 'custom' ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.85rem',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    </div>

                    {/* Download Limit */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        İndirme Limiti (isteğe bağlı)
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Sınırsız"
                        value={downloadLimit || ''}
                        onChange={(e) => setDownloadLimit(e.target.value ? parseInt(e.target.value) : null)}
                        style={{
                          width: '120px',
                          padding: '0.625rem 1rem',
                          background: 'rgba(30, 41, 59, 0.6)',
                          border: '1px solid rgba(148, 163, 184, 0.2)',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '0.9rem',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        color: '#e2e8f0',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={usePassword}
                          onChange={(e) => setUsePassword(e.target.checked)}
                          style={{ 
                            width: '18px', 
                            height: '18px',
                            accentColor: '#8b5cf6'
                          }}
                        />
                        Şifre ile koru
                      </label>
                      {usePassword && (
                        <input
                          type="password"
                          placeholder="Şifre belirleyin"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          style={{
                            width: '100%',
                            marginTop: '0.75rem',
                            padding: '0.625rem 1rem',
                            background: 'rgba(30, 41, 59, 0.6)',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none'
                          }}
                        />
                      )}
                    </div>

                    {/* Notification */}
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem',
                      color: '#e2e8f0',
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={notifyOnDownload}
                        onChange={(e) => setNotifyOnDownload(e.target.checked)}
                        style={{ 
                          width: '18px', 
                          height: '18px',
                          accentColor: '#8b5cf6'
                        }}
                      />
                      Dosya indirildiğinde beni bilgilendir
                    </label>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    padding: '0.875rem 1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    color: '#fca5a5',
                    fontSize: '0.9rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Progress Bar */}
                {uploading && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Yükleniyor...</span>
                      <span style={{ color: '#a78bfa', fontSize: '0.85rem', fontWeight: 600 }}>{uploadProgress}%</span>
                    </div>
                    <div style={{
                      height: '6px',
                      background: 'rgba(100, 116, 139, 0.2)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}

                {/* Create Button */}
                <button
                  onClick={createTransfer}
                  disabled={uploading || files.length === 0}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    background: uploading || files.length === 0 
                      ? 'rgba(100, 116, 139, 0.3)' 
                      : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: uploading || files.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                    boxShadow: uploading || files.length === 0 ? 'none' : '0 4px 20px rgba(139, 92, 246, 0.4)'
                  }}
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin" style={{
                        width: '20px',
                        height: '20px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white',
                        borderRadius: '50%'
                      }} />
                      Transfer Oluşturuluyor...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13" />
                        <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                      </svg>
                      {sendMethod === 'email' ? 'E-posta ile Gönder' : 'Transfer Oluştur'}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div style={{
          width: '100%',
          maxWidth: '700px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginTop: '2rem'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '1.25rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Güvenli Transfer
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Uçtan uca şifreleme
            </p>
          </div>
          
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '1.25rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Otomatik Silme
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Süre dolunca kaldırılır
            </p>
          </div>
          
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRadius: '16px',
            padding: '1.25rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              2 GB'a Kadar
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Büyük dosya desteği
            </p>
          </div>
        </div>

        {/* Transfer History Section */}
        <div style={{
          width: '100%',
          maxWidth: '700px',
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '1px solid rgba(148, 163, 184, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{
              color: '#e2e8f0',
              fontSize: '1.25rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="10" />
              </svg>
              Transfer Geçmişi
            </h2>
            <button
              onClick={() => loadTransferHistory()}
              disabled={historyLoading}
              style={{
                background: historyLoading ? 'rgba(100, 116, 139, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: historyLoading ? '#64748b' : '#a78bfa',
                fontSize: '0.85rem',
                cursor: historyLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
                opacity: historyLoading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!historyLoading) {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                if (!historyLoading) {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                }
              }}
            >
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                style={{ animation: historyLoading ? 'spin 1s linear infinite' : 'none' }}
              >
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Yenile
            </button>
            
            {/* Süresi Dolmuşları Temizle butonu */}
            {transferHistory.filter(t => t.isExpired).length > 0 && (
              <button
                onClick={deleteExpiredTransfers}
                disabled={deletingExpired}
                style={{
                  background: deletingExpired ? 'rgba(100, 116, 139, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  color: deletingExpired ? '#64748b' : '#f87171',
                  fontSize: '0.85rem',
                  cursor: deletingExpired ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  opacity: deletingExpired ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!deletingExpired) {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!deletingExpired) {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  }
                }}
              >
                {deletingExpired ? (
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                )}
                {deletingExpired ? 'Siliniyor...' : `Süresi Dolmuşları Temizle (${transferHistory.filter(t => t.isExpired).length})`}
              </button>
            )}
          </div>

          {historyLoading && transferHistory.length === 0 ? (
            <div style={{
              background: 'rgba(30, 41, 59, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '3rem',
              textAlign: 'center'
            }}>
              <div className="animate-spin" style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(139, 92, 246, 0.2)',
                borderTopColor: '#8b5cf6',
                borderRadius: '50%',
                margin: '0 auto'
              }}></div>
              <p style={{ color: '#94a3b8', marginTop: '1rem' }}>Yükleniyor...</p>
            </div>
          ) : transferHistory.length === 0 ? (
            <div style={{
              background: 'rgba(30, 41, 59, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              padding: '3rem',
              textAlign: 'center'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5" style={{ margin: '0 auto' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={{ color: '#94a3b8', marginTop: '1rem' }}>Henüz transfer geçmişiniz yok</p>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Dosya transferi yaptığınızda burada görünecek
              </p>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              {transferHistory.map((transfer) => (
                <div
                  key={transfer.id}
                  style={{
                    background: transfer.isExpired 
                      ? 'rgba(239, 68, 68, 0.05)' 
                      : 'rgba(30, 41, 59, 0.4)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    padding: '1.25rem 1.5rem',
                    border: transfer.isExpired 
                      ? '1px solid rgba(239, 68, 68, 0.2)' 
                      : '1px solid rgba(148, 163, 184, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Top Row: Icon, File Info, Actions */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    {/* File Icon */}
                    <div style={{
                      width: '48px',
                      height: '48px',
                      background: transfer.isExpired 
                        ? 'rgba(239, 68, 68, 0.1)' 
                        : 'rgba(139, 92, 246, 0.15)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {transfer.sendMethod === 'email' ? (
                        <svg 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke={transfer.isExpired ? '#ef4444' : '#a78bfa'} 
                          strokeWidth="2"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      ) : (
                        <svg 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke={transfer.isExpired ? '#ef4444' : '#a78bfa'} 
                          strokeWidth="2"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      )}
                    </div>

                    {/* File Name & Badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        color: '#e2e8f0',
                        fontSize: '1rem',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block'
                      }}>
                        {transfer.fileName}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {!transfer.isExpired && transfer.sendMethod !== 'email' && (
                        <button
                          onClick={() => copyHistoryLink(transfer.link, transfer.id)}
                          style={{
                            background: copiedHistoryId === transfer.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 0.875rem',
                            color: copiedHistoryId === transfer.id ? '#10b981' : '#a78bfa',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.2s'
                          }}
                        >
                          {copiedHistoryId === transfer.id ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Kopyalandı
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Kopyala
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => showDeleteConfirm(transfer.id, transfer.fileName)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.5rem 0.875rem',
                          color: '#ef4444',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.2s'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Sil
                      </button>
                    </div>
                  </div>

                  {/* Badges Row */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    paddingLeft: '60px'
                  }}>
                    {transfer.isExpired && (
                      <span style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        textTransform: 'uppercase'
                      }}>
                        Süresi Doldu
                      </span>
                    )}
                    <span style={{
                      background: transfer.sendMethod === 'email' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                      color: transfer.sendMethod === 'email' ? '#3b82f6' : '#a78bfa',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {transfer.sendMethod === 'email' ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          E-posta
                        </>
                      ) : (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          Link
                        </>
                      )}
                    </span>
                    {transfer.hasPassword && (
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Şifreli
                      </span>
                    )}
                    {transfer.downloadLimit && (
                      <span style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#f59e0b',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {transfer.downloadLimit} limit
                      </span>
                    )}
                  </div>

                  {/* Details Row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.5rem',
                    paddingLeft: '60px',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      {(transfer.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {new Date(transfer.createdAt).toLocaleDateString('tr-TR', { 
                        day: '2-digit', 
                        month: 'long', 
                        year: 'numeric' 
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {transfer.downloadCount} indirme
                    </div>
                    {transfer.expiresAt && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        color: transfer.isExpired ? '#ef4444' : '#f59e0b'
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {transfer.isExpired ? 'Süresi doldu' : `${new Date(transfer.expiresAt).toLocaleDateString('tr-TR', { 
                          day: '2-digit', 
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}`}
                      </div>
                    )}
                    {transfer.recipientEmail && (
                      <button 
                        onClick={() => {
                          // recipientEmail virgülle ayrılmış olabilir veya JSON array olabilir
                          let emails: string[] = [];
                          try {
                            emails = JSON.parse(transfer.recipientEmail || '[]');
                          } catch {
                            emails = (transfer.recipientEmail || '').split(',').map(e => e.trim()).filter(Boolean);
                          }
                          setEmailDetailModal({ emails, fileName: transfer.fileName });
                        }}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.4rem', 
                          color: '#3b82f6',
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.2)',
                          borderRadius: '6px',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        {(() => {
                          let emails: string[] = [];
                          try {
                            emails = JSON.parse(transfer.recipientEmail || '[]');
                          } catch {
                            emails = (transfer.recipientEmail || '').split(',').map(e => e.trim()).filter(Boolean);
                          }
                          return emails.length > 1 ? `${emails.length} alıcı` : emails[0] || '';
                        })()}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Email Detail Modal */}
      {emailDetailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                Gönderilen E-postalar
              </h3>
              <button
                onClick={() => setEmailDetailModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.25rem'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <strong style={{ color: '#94a3b8' }}>{emailDetailModal.fileName}</strong> dosyası için gönderilen e-postalar:
            </p>
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {emailDetailModal.emails.map((email, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '10px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>{email}</span>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setEmailDetailModal(null)}
              style={{
                width: '100%',
                padding: '0.875rem',
                background: 'rgba(100, 116, 139, 0.2)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '10px',
                color: '#94a3b8',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                marginTop: '1.5rem'
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>

            {/* Title */}
            <h3 style={{
              color: '#e2e8f0',
              fontSize: '1.25rem',
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: '0.75rem'
            }}>
              Transfer Silinsin mi?
            </h3>

            {/* File name */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{
                color: '#f87171',
                fontSize: '0.9rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {deleteConfirm.fileName}
              </span>
            </div>

            {/* Warning */}
            <p style={{
              color: '#94a3b8',
              fontSize: '0.9rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
              lineHeight: 1.5
            }}>
              Bu işlem geri alınamaz. Transfer linki ve dosya kalıcı olarak silinecektir.
            </p>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: '0.75rem'
            }}>
              <button
                onClick={cancelDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.875rem 1.5rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                İptal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.875rem 1.5rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: deleting ? 'rgba(239, 68, 68, 0.5)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s'
                }}
              >
                {deleting ? (
                  <>
                    <div className="animate-spin" style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%'
                    }}></div>
                    Siliniyor...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Evet, Sil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx global>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
