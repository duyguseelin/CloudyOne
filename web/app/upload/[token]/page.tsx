"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import "../../globals.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

type RequestInfo = {
  title: string;
  description: string | null;
  ownerName: string;
  folderName: string;
  maxFileSize: number | null;
  allowedTypes: string | null;
};

// API functions
const getPublicFileRequest = async (token: string): Promise<RequestInfo> => {
  const url = `${API_BASE}/file-requests/public/${token}`;
  console.log('Fetching file request from:', url);
  const res = await fetch(url);
  console.log('Response status:', res.status);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.log('Error response:', data);
    throw new Error(data.message || data.error || "Dosya isteği bulunamadı veya süresi dolmuş.");
  }
  return res.json();
};

const uploadToFileRequestWithProgress = async (
  token: string,
  file: File,
  uploaderName?: string,
  uploaderEmail?: string,
  customFileName?: string,
  onProgress?: (percent: number) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    if (uploaderName) formData.append("uploaderName", uploaderName);
    if (uploaderEmail) formData.append("uploaderEmail", uploaderEmail);
    if (customFileName) formData.append("customFileName", customFileName);
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || "Yükleme başarısız"));
        } catch {
          reject(new Error("Yükleme başarısız"));
        }
      }
    };
    
    xhr.onerror = () => reject(new Error("Ağ hatası"));
    xhr.open("POST", `${API_BASE}/file-requests/public/${token}/upload`);
    xhr.send(formData);
  });
};

export default function PublicUploadPage() {
  const params = useParams();
  const token = params?.token as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  
  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [customFileNames, setCustomFileNames] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { status: 'pending' | 'uploading' | 'success' | 'error'; percent: number }>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadComplete, setUploadComplete] = useState(false);
  const [totalProgress, setTotalProgress] = useState(0);
  
  // Uploader info (optional)
  const [uploaderName, setUploaderName] = useState("");
  const [uploaderEmail, setUploaderEmail] = useState("");
  
  // Drag and drop
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      loadRequestInfo();
    }
  }, [token]);

  const loadRequestInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPublicFileRequest(token);
      setRequestInfo(data);
    } catch (err: any) {
      setError(err.message || "Dosya isteği yüklenemedi.");
    } finally {
      setLoading(false);
    }
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
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, [requestInfo]);

  const addFiles = (files: File[]) => {
    // Validate files
    const validFiles: File[] = [];
    
    for (const file of files) {
      // Check file type if restricted
      if (requestInfo?.allowedTypes) {
        const allowedList = requestInfo.allowedTypes.toLowerCase().split(",").map(t => t.trim());
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!allowedList.includes(ext)) {
          continue; // Skip invalid file type
        }
      }
      
      // Check file size if restricted
      if (requestInfo?.maxFileSize && file.size > requestInfo.maxFileSize) {
        continue; // Skip oversized file
      }
      
      validFiles.push(file);
    }
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    // Özel dosya adlarını da güncelle
    setCustomFileNames(prev => {
      const newNames: Record<number, string> = {};
      Object.keys(prev).forEach(key => {
        const k = parseInt(key);
        if (k < index) newNames[k] = prev[k];
        else if (k > index) newNames[k - 1] = prev[k];
      });
      return newNames;
    });
  };

  const updateCustomFileName = (index: number, name: string) => {
    setCustomFileNames(prev => ({ ...prev, [index]: name }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setUploading(true);
    setTotalProgress(0);
    const progress: Record<string, { status: 'pending' | 'uploading' | 'success' | 'error'; percent: number }> = {};
    const errors: Record<string, string> = {};
    
    // Initialize progress
    selectedFiles.forEach((f, i) => {
      progress[i] = { status: 'pending', percent: 0 };
    });
    setUploadProgress({ ...progress });
    
    // Upload files one by one
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      progress[i] = { status: 'uploading', percent: 0 };
      setUploadProgress({ ...progress });
      
      try {
        // Özel dosya adı varsa kullan, yoksa orijinal adı kullan
        const customName = customFileNames[i]?.trim();
        await uploadToFileRequestWithProgress(
          token, 
          file, 
          uploaderName.trim() || undefined, 
          uploaderEmail.trim() || undefined,
          customName || undefined,
          (percent) => {
            progress[i] = { status: 'uploading', percent };
            setUploadProgress({ ...progress });
            // Calculate total progress
            const completedFiles = Object.values(progress).filter(p => p.status === 'success').length;
            const currentFileProgress = percent / 100;
            const total = Math.round(((completedFiles + currentFileProgress) / selectedFiles.length) * 100);
            setTotalProgress(total);
          }
        );
        progress[i] = { status: 'success', percent: 100 };
      } catch (err: any) {
        progress[i] = { status: 'error', percent: 0 };
        errors[i] = err.message || "Yükleme hatası";
      }
      setUploadProgress({ ...progress });
    }
    
    setUploadErrors(errors);
    setUploading(false);
    setTotalProgress(100);
    
    // Check if all successful
    const allSuccess = Object.values(progress).every(p => p.status === 'success');
    if (allSuccess) {
      setUploadComplete(true);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const resetUpload = () => {
    setSelectedFiles([]);
    setCustomFileNames({});
    setUploadProgress({});
    setUploadErrors({});
    setUploadComplete(false);
    setTotalProgress(0);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0a0e27 50%, #050816 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0a0e27 50%, #050816 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ 
          maxWidth: '400px',
          textAlign: 'center',
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '20px',
          padding: '3rem 2rem'
        }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            background: 'rgba(239, 68, 68, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="#f87171">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.75rem' }}>
            Bir Hata Oluştu
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (uploadComplete) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0a0e27 50%, #050816 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{ 
          maxWidth: '450px',
          textAlign: 'center',
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '20px',
          padding: '3rem 2rem'
        }}>
          <div style={{ 
            width: '80px', 
            height: '80px', 
            background: 'rgba(34, 197, 94, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="#86efac">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.75rem' }}>
            Yükleme Tamamlandı!
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            {selectedFiles.length} dosya başarıyla yüklendi. Teşekkürler!
          </p>
          <button 
            onClick={resetUpload}
            style={{ 
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Başka Dosya Yükle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0a0e27 50%, #050816 100%)',
      padding: '2rem'
    }}>
      <div style={{ 
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(139, 92, 246, 0.2)',
            padding: '0.5rem 1rem',
            borderRadius: '20px',
            marginBottom: '1rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>☁️</span>
            <span style={{ color: '#c4b5fd', fontWeight: 600 }}>CloudyOne</span>
          </div>
          
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
            {requestInfo?.title}
          </h1>
          
          {requestInfo?.description && (
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              {requestInfo.description}
            </p>
          )}
          
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            İsteyen: <span style={{ color: '#a78bfa' }}>{requestInfo?.ownerName}</span>
            {requestInfo?.folderName && (
              <> · Klasör: <span style={{ color: '#94a3b8' }}>{requestInfo.folderName}</span></>
            )}
          </p>
        </div>

        {/* Upload Area */}
        <div style={{ 
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: '20px',
          padding: '2rem',
          marginBottom: '1.5rem'
        }}>
          {/* Uploader Info (Optional) */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.375rem' }}>
                Adınız (Opsiyonel)
              </label>
              <input 
                type="text"
                value={uploaderName}
                onChange={e => setUploaderName(e.target.value)}
                placeholder="İsim"
                style={{ 
                  width: '100%', 
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.875rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.375rem' }}>
                E-posta (Opsiyonel)
              </label>
              <input 
                type="email"
                value={uploaderEmail}
                onChange={e => setUploaderEmail(e.target.value)}
                placeholder="ornek@email.com"
                style={{ 
                  width: '100%', 
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          {/* Drop Zone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              border: `2px dashed ${isDragging ? 'rgba(139, 92, 246, 0.6)' : 'rgba(148, 163, 184, 0.3)'}`,
              borderRadius: '16px',
              padding: '3rem 2rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging ? 'rgba(139, 92, 246, 0.1)' : 'rgba(15, 23, 42, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            <input 
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept={requestInfo?.allowedTypes ? requestInfo.allowedTypes.split(',').map(t => `.${t.trim()}`).join(',') : undefined}
            />
            
            <div style={{ 
              width: '64px', 
              height: '64px', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            
            <p style={{ color: '#ffffff', fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              Dosyaları sürükleyip bırakın
            </p>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
              veya <span style={{ color: '#a78bfa' }}>tıklayarak seçin</span>
            </p>
            
            {/* Restrictions info */}
            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b' }}>
              {requestInfo?.maxFileSize && (
                <span>Maks. boyut: {formatFileSize(requestInfo.maxFileSize)}</span>
              )}
              {requestInfo?.maxFileSize && requestInfo?.allowedTypes && <span> · </span>}
              {requestInfo?.allowedTypes && (
                <span>Türler: {requestInfo.allowedTypes}</span>
              )}
            </div>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.75rem' }}>
                Seçilen Dosyalar ({selectedFiles.length})
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedFiles.map((file, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: '0.875rem 1rem',
                      background: 'rgba(15, 23, 42, 0.5)',
                      borderRadius: '12px',
                      border: '1px solid rgba(148, 163, 184, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          width: '36px', 
                          height: '36px', 
                          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="#c4b5fd">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ 
                            margin: 0, 
                            fontSize: '0.85rem', 
                            color: '#ffffff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {file.name}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Progress indicator */}
                        {uploadProgress[index]?.status === 'uploading' && (
                          <div className="loading-spinner" style={{ width: '20px', height: '20px' }}></div>
                        )}
                        {uploadProgress[index]?.status === 'success' && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="#86efac">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {uploadProgress[index]?.status === 'error' && (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="#f87171">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        )}
                        
                        {!uploading && !uploadProgress[index]?.status && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            style={{ 
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              color: '#94a3b8'
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Özel dosya adı alanı */}
                    {!uploading && !uploadProgress[index]?.status && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <input 
                          type="text"
                          value={customFileNames[index] || ''}
                          onChange={e => updateCustomFileName(index, e.target.value)}
                          placeholder={`Özel isim (varsayılan: ${file.name})`}
                          style={{ 
                            width: '100%', 
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(30, 41, 59, 0.5)',
                            border: '1px solid rgba(148, 163, 184, 0.15)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.8rem'
                          }}
                        />
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                          Boş bırakırsanız orijinal isimle gönderilir
                        </p>
                      </div>
                    )}

                    {/* Individual file progress bar */}
                    {uploadProgress[index]?.status === 'uploading' && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ 
                          flex: 1, 
                          height: '4px', 
                          background: 'rgba(139, 92, 246, 0.2)',
                          borderRadius: '2px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${uploadProgress[index]?.percent || 0}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                            borderRadius: '2px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#a78bfa', minWidth: '32px' }}>
                          {uploadProgress[index]?.percent || 0}%
                        </span>
                      </div>
                    )}

                    {/* Error message */}
                    {uploadErrors[index] && (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#f87171' }}>
                        {uploadErrors[index]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Total Progress Bar */}
              {uploading && (
                <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Toplam İlerleme</span>
                    <span style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>{totalProgress}%</span>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${totalProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #a78bfa)',
                      backgroundSize: '200% 100%',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                      animation: 'shimmer 2s infinite linear'
                    }} />
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <button 
                onClick={handleUpload}
                disabled={uploading || selectedFiles.length === 0}
                style={{ 
                  width: '100%',
                  marginTop: '1rem',
                  padding: '0.875rem',
                  background: uploading ? 'rgba(139, 92, 246, 0.3)' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {uploading ? (
                  <>
                    <div className="loading-spinner" style={{ width: '20px', height: '20px' }}></div>
                    Yükleniyor... {totalProgress}%
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    {selectedFiles.length} Dosya Yükle
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b' }}>
          CloudyOne ile güvenli dosya paylaşımı
        </p>
      </div>
      
      {/* Shimmer animation style */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
