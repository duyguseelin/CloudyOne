"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  getStoredUser, 
  clearAuth, 
  listFileRequests, 
  createFileRequest, 
  updateFileRequest, 
  deleteFileRequest, 
  toggleFileRequest,
  apiFetch
} from "../../../lib/api";
import Sidebar from "../../../components/Sidebar";
import "../../globals.css";

type FileRequest = {
  id: string;
  title: string;
  description: string | null;
  token: string;
  folderId: string | null;
  folderName: string | null;
  isActive: boolean;
  expiresAt: string | null;
  maxFileSize: number | null;
  allowedTypes: string | null;
  uploadCount: number;
  totalUploads?: number;
  pendingFiles?: number;
  savedFiles?: number;
  lastUploadAt: string | null;
  createdAt: string;
  uploaders?: Array<{ email: string; name: string | null }>;
  uploaderCount?: number;
  uploadedFiles?: Array<{ 
    id: string; 
    fileId: string | null;
    filename: string;
    sizeBytes: number | null;
    mimeType: string | null;
    uploaderName: string; 
    uploaderEmail: string | null;
    uploadedAt: string; 
    savedToFiles: boolean;
    savedAt: string | null;
  }>;
};

type FolderItem = {
  id: string;
  name: string;
};

export default function FileRequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  
  // Modal state'leri
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<FileRequest | null>(null);
  
  // Dosya listesi dropdown state
  const [showFilesDropdown, setShowFilesDropdown] = useState<string | null>(null);
  
  // Form state'leri
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFolderId, setFormFolderId] = useState<string>("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formMaxFileSize, setFormMaxFileSize] = useState("");
  const [formAllowedTypes, setFormAllowedTypes] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  
  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
  const toastIdRef = useRef(0);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Dropdown dışına tıklanınca kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showFilesDropdown) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-files-dropdown]')) {
          setShowFilesDropdown(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showFilesDropdown]);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(stored);
    loadData();
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestsData, foldersData] = await Promise.all([
        listFileRequests(),
        apiFetch('/files?foldersOnly=true', {}, true)
      ]);
      
      setRequests(requestsData?.requests || []);
      setFolders(foldersData?.folders || []);
    } catch (err) {
      console.error("Failed to load data:", err);
      showToast("Veriler yüklenirken hata oluştu", "error");
    } finally {
      setLoading(false);
    }
  };

  // Bekleyen dosyayı dosyalarıma kaydet
  const saveUploadToFiles = async (uploadId: string) => {
    try {
      const response = await apiFetch(`/file-requests/uploads/${uploadId}/save`, {
        method: 'POST',
        body: JSON.stringify({})
      }, true);
      
      showToast('Dosya başarıyla kaydedildi', 'success');
      loadData(); // Listeyi yenile
    } catch (err) {
      console.error("Save upload error:", err);
      showToast("Dosya kaydedilirken hata oluştu", 'error');
    }
  };

  // Bekleyen dosyayı sil (kaydetmeden)
  const deleteUploadedFile = async (requestId: string, uploadId: string) => {
    try {
      await apiFetch(`/file-requests/uploads/${uploadId}`, {
        method: 'DELETE'
      }, true);
      
      showToast('Dosya silindi', 'success');
      loadData(); // Listeyi yenile
    } catch (err) {
      console.error("Delete upload error:", err);
      showToast("Dosya silinirken hata oluştu", 'error');
    }
  };

  // Tüm bekleyen dosyaları kaydet
  const saveAllPendingUploads = async (requestId: string) => {
    const request = requests.find(r => r.id === requestId);
    if (!request?.uploadedFiles) return;
    
    const pendingFiles = request.uploadedFiles.filter(f => !f.savedToFiles);
    if (pendingFiles.length === 0) {
      showToast("Kaydedilecek bekleyen dosya yok", 'error');
      return;
    }
    
    let savedCount = 0;
    for (const file of pendingFiles) {
      try {
        await apiFetch(`/file-requests/uploads/${file.id}/save`, {
          method: 'POST',
          body: JSON.stringify({})
        }, true);
        savedCount++;
      } catch (err) {
        console.error("Save upload error:", err);
      }
    }
    
    if (savedCount > 0) {
      showToast(`${savedCount} dosya başarıyla kaydedildi`, 'success');
      loadData();
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormFolderId("");
    setFormExpiresAt("");
    setFormMaxFileSize("");
    setFormAllowedTypes("");
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (request: FileRequest) => {
    setEditTarget(request);
    setFormTitle(request.title);
    setFormDescription(request.description || "");
    setFormFolderId(request.folderId || "");
    setFormExpiresAt(request.expiresAt ? request.expiresAt.slice(0, 16) : "");
    setFormMaxFileSize(request.maxFileSize ? String(request.maxFileSize / (1024 * 1024)) : "");
    setFormAllowedTypes(request.allowedTypes || "");
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      showToast("Başlık gereklidir", "error");
      return;
    }

    try {
      setFormLoading(true);
      await createFileRequest({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        folderId: formFolderId && formFolderId !== "" ? formFolderId : undefined,
        expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined,
        maxFileSize: formMaxFileSize ? Number(formMaxFileSize) * 1024 * 1024 : undefined,
        allowedTypes: formAllowedTypes.trim() || undefined,
      });
      
      showToast("Dosya isteği oluşturuldu!", "success");
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      showToast(err.message || "İstek oluşturulamadı", "error");
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    if (!formTitle.trim()) {
      showToast("Başlık gereklidir", "error");
      return;
    }

    try {
      setFormLoading(true);
      await updateFileRequest(editTarget.id, {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        folderId: formFolderId && formFolderId !== "" ? formFolderId : undefined,
        expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : undefined,
        maxFileSize: formMaxFileSize ? Number(formMaxFileSize) * 1024 * 1024 : undefined,
        allowedTypes: formAllowedTypes.trim() || undefined,
      });
      
      showToast("Dosya isteği güncellendi!", "success");
      setShowEditModal(false);
      setEditTarget(null);
      resetForm();
      loadData();
    } catch (err: any) {
      showToast(err.message || "Güncellenemedi", "error");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFileRequest(id);
      showToast("Dosya isteği silindi", "success");
      setShowDeleteConfirm(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Silinemedi", "error");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const result = await toggleFileRequest(id);
      showToast(result.message, "success");
      loadData();
    } catch (err: any) {
      showToast(err.message || "İşlem başarısız", "error");
    }
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/upload/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link kopyalandı!", "success");
    } catch {
      showToast("Link kopyalanamadı", "error");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="files-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="files-page">
      {/* Sidebar */}
      <Sidebar user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="files-main">
        <div className="files-header">
          <h1 className="files-title">Dosya İstekleri</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Hesabı olmayan kişilerden güvenli bir şekilde dosya alın
          </p>
        </div>

        {requests.length === 0 ? (
          /* Empty State */
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '4rem 2rem',
            textAlign: 'center',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <div style={{ 
              width: '120px', 
              height: '120px', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '2rem'
            }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              color: '#ffffff',
              marginBottom: '0.75rem'
            }}>
              Birinden dosyaya mı ihtiyacınız var?
            </h2>
            
            <p style={{ 
              color: '#94a3b8', 
              fontSize: '0.95rem',
              lineHeight: 1.6,
              marginBottom: '2rem'
            }}>
              Dosya isteği oluşturun ve paylaşılabilir bir link alın. 
              Bu linke sahip herkes size dosya gönderebilir — hesap oluşturmasına gerek yok.
            </p>
            
            <button 
              onClick={openCreateModal}
              className="files-btn"
              style={{ 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                border: 'none',
                padding: '0.875rem 2rem',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '12px',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              İstek Oluştur
            </button>
          </div>
        ) : (
          /* Requests List */
          <div style={{ padding: '1.5rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                {requests.length} istek
              </span>
              <button 
                onClick={openCreateModal}
                className="files-btn"
                style={{ 
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Yeni İstek
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {requests.map(request => (
                <div 
                  key={request.id}
                  style={{ 
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                          {request.title}
                        </h3>
                        <span style={{ 
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: request.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: request.isActive ? '#86efac' : '#fca5a5'
                        }}>
                          {request.isActive ? 'Aktif' : 'Durduruldu'}
                        </span>
                      </div>
                      
                      {request.description && (
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                          {request.description}
                        </p>
                      )}
                      
                      {/* İlk satır: Klasör, Oluşturulma, Bitiş Tarihi */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Hedef Klasör">
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          </svg>
                          <strong style={{ color: '#94a3b8', marginRight: '0.25rem' }}>Klasör:</strong>
                          {request.folderName || 'Ana Klasör'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Oluşturulma Tarihi">
                          📅 <strong style={{ color: '#94a3b8', marginRight: '0.25rem' }}>Oluşturulma:</strong>
                          {formatDate(request.createdAt)}
                        </span>
                        {request.expiresAt && (
                          <span style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.25rem', 
                            color: new Date(request.expiresAt) < new Date() ? '#fca5a5' : '#64748b' 
                          }} title="Son Geçerlilik Tarihi">
                            ⏰ <strong style={{ color: new Date(request.expiresAt) < new Date() ? '#fca5a5' : '#94a3b8', marginRight: '0.25rem' }}>
                              {new Date(request.expiresAt) < new Date() ? 'Süresi Doldu:' : 'Bitiş Tarihi:'}
                            </strong>
                            {formatDate(request.expiresAt)}
                          </span>
                        )}
                      </div>
                      
                      {/* İkinci satır: Yüklemeler ve Yükleyenler */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.75rem', color: '#64748b', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Toplam Yükleme Sayısı">
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          <strong style={{ color: '#94a3b8', marginRight: '0.25rem' }}>Yüklemeler:</strong>
                          <span>
                            {request.uploadCount}
                            {(request.pendingFiles ?? 0) > 0 && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }} title={`${request.pendingFiles ?? 0} dosya onay bekliyor`}>
                                ({request.pendingFiles ?? 0} bekliyor)
                              </span>
                            )}
                            {(request.savedFiles ?? 0) > 0 && (
                              <span style={{ color: '#10b981', marginLeft: '0.25rem' }} title={`${request.savedFiles ?? 0} dosya kaydedildi`}>
                                ({request.savedFiles ?? 0} kaydedildi)
                              </span>
                            )}
                          </span>
                        </span>
                        {request.uploaderCount !== undefined && request.uploaderCount > 0 && (
                          <div 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              background: 'rgba(139, 92, 246, 0.1)',
                              padding: '0.375rem 0.625rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(139, 92, 246, 0.2)'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="#a78bfa">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            <span style={{ color: '#c4b5fd', fontWeight: 500 }}>
                              {request.uploaders?.map((u, i) => (
                                <span key={i} title={u.email || 'E-posta yok'}>
                                  {u.name || u.email || 'Anonim'}
                                  {i < (request.uploaders?.length || 0) - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      {request.uploadCount > 0 && (
                        <div style={{ position: 'relative' }} data-files-dropdown>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setShowFilesDropdown(showFilesDropdown === request.id ? null : request.id); }}
                            className="files-btn"
                            style={{ 
                              padding: '0.5rem 0.875rem', 
                              fontSize: '0.75rem', 
                              borderRadius: '8px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: '#6ee7b7',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.375rem'
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                            </svg>
                            Dosyalar ({request.uploadCount})
                            {(request.pendingFiles ?? 0) > 0 && (
                              <span style={{ 
                                background: '#f59e0b', 
                                color: '#000', 
                                padding: '0.125rem 0.375rem', 
                                borderRadius: '10px', 
                                fontSize: '0.6rem',
                                fontWeight: 700 
                              }}>
                                {request.pendingFiles} bekliyor
                              </span>
                            )}
                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '0.25rem' }}>
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          
                          {/* Dosyalar Dropdown */}
                          {showFilesDropdown === request.id && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: '0.5rem',
                              background: 'rgba(15, 23, 42, 0.98)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '12px',
                              padding: '0.5rem',
                              minWidth: '280px',
                              maxWidth: '360px',
                              maxHeight: '350px',
                              overflowY: 'auto',
                              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                              zIndex: 100
                            }}>
                              <div style={{ 
                                padding: '0.5rem 0.75rem', 
                                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                  Yüklenen Dosyalar
                                </span>
                                <div style={{ display: 'flex', gap: '0.375rem' }}>
                                  {(request.pendingFiles ?? 0) > 0 && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); saveAllPendingUploads(request.id); }}
                                      style={{
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        border: 'none',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '6px',
                                        color: '#6ee7b7',
                                        fontSize: '0.65rem',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}
                                      title="Tüm bekleyenleri kaydet"
                                    >
                                      ✓ Tümünü Kaydet
                                    </button>
                                  )}
                                  {(request.savedFiles ?? 0) > 0 && (
                                    <button
                                      onClick={() => router.push(`/files${request.folderId ? `?folder=${request.folderId}` : ''}`)}
                                      style={{
                                        background: 'rgba(59, 130, 246, 0.2)',
                                        border: 'none',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '6px',
                                        color: '#93c5fd',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                      }}
                                    >
                                      Klasöre Git →
                                    </button>
                                  )}
                                </div>
                              </div>
                              {request.uploadedFiles && request.uploadedFiles.length > 0 ? (
                                request.uploadedFiles.map((file, idx) => (
                                  <div 
                                    key={file.id || idx}
                                    style={{
                                      padding: '0.875rem',
                                      borderRadius: '10px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.625rem',
                                      cursor: 'default',
                                      marginBottom: idx < request.uploadedFiles!.length - 1 ? '0.5rem' : '0',
                                      background: file.savedToFiles ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                      border: `1px solid ${file.savedToFiles ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                                    }}
                                  >
                                    {/* Dosya Adı ve Durum */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
                                      <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        background: file.savedToFiles ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                      }}>
                                        <svg width="18" height="18" viewBox="0 0 20 20" fill={file.savedToFiles ? '#10b981' : '#f59e0b'}>
                                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                          <span style={{ 
                                            fontSize: '0.85rem', 
                                            fontWeight: 600,
                                            color: '#f1f5f9',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            flex: 1
                                          }}>
                                            {file.filename}
                                          </span>
                                          <span style={{ 
                                            fontSize: '0.65rem', 
                                            color: file.savedToFiles ? '#10b981' : '#f59e0b',
                                            background: file.savedToFiles ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '6px',
                                            fontWeight: 600,
                                            flexShrink: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                          }}>
                                            {file.savedToFiles ? '✓ Kaydedildi' : '⏳ Bekliyor'}
                                          </span>
                                        </div>
                                        {/* Meta Bilgiler */}
                                        <div style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          flexWrap: 'wrap',
                                          gap: '0.625rem',
                                          fontSize: '0.75rem',
                                          color: '#94a3b8'
                                        }}>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                            </svg>
                                            {file.uploaderName}
                                          </span>
                                          <span style={{ color: '#475569' }}>•</span>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                            </svg>
                                            {formatDate(file.uploadedAt)}
                                          </span>
                                          {file.sizeBytes && (
                                            <>
                                              <span style={{ color: '#475569' }}>•</span>
                                              <span style={{ 
                                                background: 'rgba(100, 116, 139, 0.2)',
                                                padding: '0.125rem 0.375rem',
                                                borderRadius: '4px',
                                                fontWeight: 500
                                              }}>
                                                {file.sizeBytes >= 1024 * 1024 
                                                  ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                                                  : `${(file.sizeBytes / 1024).toFixed(0)} KB`
                                                }
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Aksiyon Butonları - Sadece bekleyen dosyalar için */}
                                    {!file.savedToFiles && (
                                      <div style={{ 
                                        display: 'flex', 
                                        gap: '0.5rem',
                                        paddingTop: '0.5rem',
                                        borderTop: '1px solid rgba(148, 163, 184, 0.1)'
                                      }}>
                                        <button
                                          onClick={() => saveUploadToFiles(file.id)}
                                          style={{
                                            flex: 1,
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            color: '#10b981',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.375rem',
                                            transition: 'all 0.2s',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
                                          }}
                                          title="Dosyalarıma kaydet"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                          Dosyalarıma Kaydet
                                        </button>
                                        <button
                                          onClick={() => {
                                            if (confirm(`"${file.filename}" dosyasını silmek istediğinize emin misiniz?`)) {
                                              deleteUploadedFile(request.id, file.id);
                                            }
                                          }}
                                          style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '6px',
                                            color: '#ef4444',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.375rem',
                                            transition: 'all 0.2s',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                          }}
                                          title="Dosyayı sil"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                          </svg>
                                          Sil
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div style={{ padding: '0.75rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                                  Henüz dosya yüklenmemiş
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <button 
                        onClick={() => copyLink(request.token)}
                        className="files-btn"
                        style={{ 
                          padding: '0.5rem 0.875rem', 
                          fontSize: '0.75rem', 
                          borderRadius: '8px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          color: '#93c5fd'
                        }}
                      >
                        Link Kopyala
                      </button>
                      <button 
                        onClick={() => handleToggle(request.id)}
                        className="files-btn"
                        style={{ 
                          padding: '0.5rem 0.875rem', 
                          fontSize: '0.75rem', 
                          borderRadius: '8px',
                          background: request.isActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          border: `1px solid ${request.isActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                          color: request.isActive ? '#fca5a5' : '#86efac'
                        }}
                      >
                        {request.isActive ? 'Durdur' : 'Aktifleştir'}
                      </button>
                      <button 
                        onClick={() => openEditModal(request)}
                        className="files-btn"
                        style={{ 
                          padding: '0.5rem 0.875rem', 
                          fontSize: '0.75rem', 
                          borderRadius: '8px',
                          background: 'rgba(139, 92, 246, 0.15)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          color: '#c4b5fd'
                        }}
                      >
                        Düzenle
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(request.id)}
                        className="files-btn"
                        style={{ 
                          padding: '0.5rem',
                          fontSize: '0.75rem', 
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#fca5a5'
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(139, 92, 246, 0.3)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  Yeni Dosya İsteği
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                  Diğer kişilerden dosya almak için link oluşturun
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Başlık *
                </label>
                <input 
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Örn: Proje Dosyaları"
                  className="files-input"
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Açıklama (Opsiyonel)
                </label>
                <textarea 
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Yükleyicilere gösterilecek bilgi..."
                  rows={3}
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Hedef Klasör
                </label>
                <select 
                  value={formFolderId}
                  onChange={e => setFormFolderId(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Ana Klasör</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Son Geçerlilik (Opsiyonel)
                  </label>
                  <input 
                    type="datetime-local"
                    value={formExpiresAt}
                    onChange={e => setFormExpiresAt(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Maks. Dosya Boyutu (MB)
                  </label>
                  <input 
                    type="number"
                    value={formMaxFileSize}
                    onChange={e => setFormMaxFileSize(e.target.value)}
                    placeholder="Örn: 50"
                    min="1"
                    style={{ 
                      width: '100%', 
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  İzin Verilen Dosya Türleri (Opsiyonel)
                </label>
                <input 
                  type="text"
                  value={formAllowedTypes}
                  onChange={e => setFormAllowedTypes(e.target.value)}
                  placeholder="Örn: pdf,doc,jpg,png"
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem'
                  }}
                />
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Boş bırakırsanız tüm dosya türleri kabul edilir
                </p>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '0.75rem', 
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(100, 116, 139, 0.15)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '12px',
                  color: '#94a3b8',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  transition: 'all 0.2s'
                }}
              >
                İptal
              </button>
              <button 
                onClick={handleCreate}
                disabled={formLoading}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 2rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  opacity: formLoading ? 0.7 : 1,
                  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {formLoading ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editTarget && (
        <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(99, 102, 241, 0.3)'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                  İsteği Düzenle
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                  Dosya isteği ayarlarını güncelleyin
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Başlık *
                </label>
                <input 
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="files-input"
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Açıklama
                </label>
                <textarea 
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Hedef Klasör
                </label>
                <select 
                  value={formFolderId}
                  onChange={e => setFormFolderId(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Ana Klasör</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Son Geçerlilik
                  </label>
                  <input 
                    type="datetime-local"
                    value={formExpiresAt}
                    onChange={e => setFormExpiresAt(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Maks. Dosya Boyutu (MB)
                  </label>
                  <input 
                    type="number"
                    value={formMaxFileSize}
                    onChange={e => setFormMaxFileSize(e.target.value)}
                    min="1"
                    style={{ 
                      width: '100%', 
                      padding: '0.875rem 1rem',
                      borderRadius: '12px',
                      fontSize: '0.95rem'
                    }}
                  />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 500 }}>
                  İzin Verilen Dosya Türleri
                </label>
                <input 
                  type="text"
                  value={formAllowedTypes}
                  onChange={e => setFormAllowedTypes(e.target.value)}
                  placeholder="Örn: pdf,doc,jpg,png"
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>
            
            {/* Modal Footer */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '0.75rem', 
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
              <button 
                onClick={() => setShowEditModal(false)}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(100, 116, 139, 0.15)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '12px',
                  color: '#94a3b8',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  transition: 'all 0.2s'
                }}
              >
                İptal
              </button>
              <button 
                onClick={handleUpdate}
                disabled={formLoading}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 2rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  opacity: formLoading ? 0.7 : 1,
                  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {formLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ 
              width: '72px', 
              height: '72px', 
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.15) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <svg width="32" height="32" viewBox="0 0 20 20" fill="#f87171">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#ffffff' }}>
              İsteği Sil
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.6 }}>
              Bu dosya isteğini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(100, 116, 139, 0.15)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '12px',
                  color: '#94a3b8',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  transition: 'all 0.2s'
                }}
              >
                İptal
              </button>
              <button 
                onClick={() => handleDelete(showDeleteConfirm)}
                className="files-btn"
                style={{ 
                  padding: '0.75rem 1.75rem',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 1000 }}>
        {toasts.map(toast => (
          <div 
            key={toast.id}
            style={{ 
              padding: '0.875rem 1.25rem',
              borderRadius: '12px',
              background: toast.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${toast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: toast.type === 'success' ? '#86efac' : '#fca5a5',
              fontSize: '0.875rem',
              backdropFilter: 'blur(8px)',
              animation: 'slideIn 0.3s ease'
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
