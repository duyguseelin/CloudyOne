"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  getStoredUser, 
  clearAuth, 
  apiFetch,
  getDownloadUrl,
  getViewUrl,
  deleteFile as deleteFileApi,
  toggleFavoriteFile,
  renameFile,
  listVersions
} from "../../../lib/api";
import { getMasterKey, hasMasterKey, downloadAndDecryptWithKey } from "../../../lib/crypto";
import Sidebar from "../../../components/Sidebar";
import "../../globals.css";

type CommentItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
};

type MediaItem = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  folderId?: string | null;
  folder?: { id: string; name: string } | null;
  isFavorite?: boolean;
  comment?: string | null;
  comments?: CommentItem[];
  isEncrypted?: boolean;
};

export default function GalleryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  
  // Filter state
  const [filterType, setFilterType] = useState<'all' | 'images' | 'videos' | 'favorites'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Comment modal state
  const [commentTarget, setCommentTarget] = useState<MediaItem | null>(null);
  const [commentValue, setCommentValue] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ file: MediaItem; x: number; y: number } | null>(null);
  
  // Move modal state
  const [moveTarget, setMoveTarget] = useState<MediaItem | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  
  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<MediaItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  
  // Versions modal state
  const [versionsTarget, setVersionsTarget] = useState<MediaItem | null>(null);
  const [versions, setVersions] = useState<Array<{ id: number; version: number; sizeBytes: number; createdAt: string }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  
  // Edit submenu state
  const [editSubmenuOpen, setEditSubmenuOpen] = useState(false);
  
  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
  const toastIdRef = useRef(0);
  
  // Lazy loading
  const [visibleCount, setVisibleCount] = useState(24);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Thumbnail URL cache
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const loadingThumbnails = useRef<Set<string>>(new Set());
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // Image/Video extensions
  const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'tiff', 'avif'];
  const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', 'm4v'];

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const isImage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return IMAGE_EXTENSIONS.includes(ext);
  };

  const isVideo = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTENSIONS.includes(ext);
  };

  const isMedia = (filename: string) => isImage(filename) || isVideo(filename);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(stored);
    loadMedia();
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  // Dosya yükleme fonksiyonu
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Sadece görsel ve video dosyalarını filtrele
    const mediaOnlyFiles = Array.from(files).filter(f => isMedia(f.name));
    
    if (mediaOnlyFiles.length === 0) {
      showToast("Sadece fotoğraf ve video dosyaları yükleyebilirsiniz", "error");
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    let successCount = 0;
    let versionCount = 0;
    const totalFiles = mediaOnlyFiles.length;
    
    for (let i = 0; i < mediaOnlyFiles.length; i++) {
      const file = mediaOnlyFiles[i];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const token = localStorage.getItem('cloudyone_token') || localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/files/upload`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          successCount++;
          
          // Eğer dosya zaten varsa ve yeni sürüm olarak kaydedildiyse
          if (data.isNewVersion) {
            versionCount++;
            showToast(data.message || `"${file.name}" yeni sürüm olarak kaydedildi`, "success");
          }
        }
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
      }
      
      setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
    }
    
    setUploading(false);
    setUploadProgress(0);
    
    // Input'u temizle
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    if (successCount > 0) {
      if (versionCount > 0 && versionCount < successCount) {
        showToast(`${successCount - versionCount} yeni dosya, ${versionCount} sürüm güncellendi`, "success");
      } else if (versionCount === 0) {
        showToast(`${successCount} dosya başarıyla yüklendi`, "success");
      }
      // versionCount === successCount durumunda zaten her biri için mesaj gösterildi
      loadMedia(); // Listeyi yenile
    } else {
      showToast("Dosyalar yüklenemedi", "error");
    }
  };

  // Lazy loading observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredMedia.length) {
          setVisibleCount(prev => Math.min(prev + 12, filteredMedia.length));
        }
      },
      { threshold: 0.1 }
    );
    
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }
    
    return () => observerRef.current?.disconnect();
  }, [visibleCount, mediaFiles, filterType]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      // Tüm dosyaları al
      const data = await apiFetch('/files?includeAll=true', {}, true);
      
      if (data?.files) {
        // Sadece medya dosyalarını filtrele
        const media = data.files.filter((f: MediaItem) => isMedia(f.filename));
        setMediaFiles(media);
      }
    } catch (err) {
      console.error("Failed to load media:", err);
      showToast("Medya dosyaları yüklenirken hata oluştu", "error");
    } finally {
      setLoading(false);
    }
  };

  // Filtrelenmiş ve sıralanmış medya
  const filteredMedia = mediaFiles
    .filter(f => {
      // Arama filtresi
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        const matchesFilename = f.filename.toLowerCase().includes(search);
        const matchesComment = f.comment?.toLowerCase().includes(search);
        if (!matchesFilename && !matchesComment) return false;
      }
      // Tip filtresi
      if (filterType === 'images') return isImage(f.filename);
      if (filterType === 'videos') return isVideo(f.filename);
      if (filterType === 'favorites') return f.isFavorite === true;
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

  const visibleMedia = filteredMedia.slice(0, visibleCount);

  const getThumbnailUrl = (file: MediaItem) => {
    // R2'den thumbnail URL oluştur (gerçek uygulamada backend'den alınabilir)
    return `${API_BASE}/files/${file.id}/view`;
  };

  // Thumbnail URL yükleme fonksiyonu
  const loadThumbnailUrl = useCallback(async (fileId: string) => {
    // Zaten yüklenmişse veya yükleniyorsa atla
    if (thumbnailUrls[fileId] || loadingThumbnails.current.has(fileId)) {
      return;
    }
    
    loadingThumbnails.current.add(fileId);
    
    try {
      const url = await getViewUrl(fileId);
      setThumbnailUrls(prev => ({ ...prev, [fileId]: url }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
      // R2 yapılandırması eksikse veya dosya bulunamadıysa sessizce hata olarak işaretle
      if (errorMessage.includes('R2') || errorMessage.includes('503') || errorMessage.includes('yapılandırılmamış')) {
        // R2 hatası - sessizce işaretle
        setThumbnailUrls(prev => ({ ...prev, [fileId]: 'r2_error' }));
      } else if (!errorMessage.includes('404') && !errorMessage.includes('bulunamadı')) {
        console.warn(`Thumbnail yüklenemedi: ${fileId}`, errorMessage);
        setThumbnailUrls(prev => ({ ...prev, [fileId]: 'error' }));
      } else {
        setThumbnailUrls(prev => ({ ...prev, [fileId]: 'error' }));
      }
    } finally {
      loadingThumbnails.current.delete(fileId);
    }
  }, [thumbnailUrls]);

  // Görünür görsellerin thumbnail'larını yükle
  useEffect(() => {
    visibleMedia.forEach(file => {
      if (isImage(file.filename) && !thumbnailUrls[file.id]) {
        loadThumbnailUrl(file.id);
      }
    });
  }, [visibleMedia, loadThumbnailUrl, thumbnailUrls]);

  const openLightbox = async (index: number) => {
    const file = filteredMedia[index];
    setLightboxIndex(index);
    setLightboxOpen(true);
    setLightboxLoading(true);
    
    try {
      // Şifreli dosya ise decrypt edip göster
      if (file.isEncrypted) {
        if (!hasMasterKey()) {
          showToast("Şifreli dosyayı görüntülemek için önce şifrenizi girin", "error");
          setLightboxOpen(false);
          setLightboxLoading(false);
          return;
        }
        
        const token = typeof window !== 'undefined' 
          ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
          : null;
        
        if (!token) {
          showToast("Oturum bulunamadı", 'error');
          setLightboxOpen(false);
          setLightboxLoading(false);
          return;
        }
        
        const masterKey = getMasterKey();
        const { blob, filename } = await downloadAndDecryptWithKey(file.id, masterKey, token);
        
        // Dosya türüne göre MIME type belirle
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: mimeType });
        const url = URL.createObjectURL(typedBlob);
        setLightboxUrl(url);
      } else {
        // Normal (şifresiz) dosya
        const url = await getViewUrl(file.id);
        setLightboxUrl(url);
      }
    } catch (err) {
      showToast("Görsel yüklenemedi", "error");
      setLightboxOpen(false);
    } finally {
      setLightboxLoading(false);
    }
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxUrl(null);
  };

  const navigateLightbox = async (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' 
      ? (lightboxIndex - 1 + filteredMedia.length) % filteredMedia.length
      : (lightboxIndex + 1) % filteredMedia.length;
    
    setLightboxIndex(newIndex);
    setLightboxLoading(true);
    
    // Eski URL'i temizle
    if (lightboxUrl && lightboxUrl.startsWith('blob:')) {
      URL.revokeObjectURL(lightboxUrl);
    }
    setLightboxUrl(null);
    
    try {
      const file = filteredMedia[newIndex];
      
      // Şifreli dosya ise decrypt edip göster
      if (file.isEncrypted) {
        if (!hasMasterKey()) {
          showToast("Şifreli dosyayı görüntülemek için önce şifrenizi girin", "error");
          setLightboxLoading(false);
          return;
        }
        
        const token = typeof window !== 'undefined' 
          ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
          : null;
        
        if (!token) {
          showToast("Oturum bulunamadı", 'error');
          setLightboxLoading(false);
          return;
        }
        
        const masterKey = getMasterKey();
        const { blob, filename } = await downloadAndDecryptWithKey(file.id, masterKey, token);
        
        // Dosya türüne göre MIME type belirle
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: mimeType });
        const url = URL.createObjectURL(typedBlob);
        setLightboxUrl(url);
      } else {
        // Normal (şifresiz) dosya
        const url = await getViewUrl(file.id);
        setLightboxUrl(url);
      }
    } catch (err) {
      showToast("Görsel yüklenemedi", "error");
    } finally {
      setLightboxLoading(false);
    }
  };

  const handleDownload = async (file: MediaItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const url = await getDownloadUrl(file.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("İndirme başlatıldı", "success");
    } catch (err: any) {
      showToast(err.message || "İndirme başarısız", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      setDeleting(true);
      await deleteFileApi(deleteTarget.id);
      setMediaFiles(prev => prev.filter(f => f.id !== deleteTarget.id));
      showToast("Dosya silindi", "success");
      setDeleteTarget(null);
    } catch (err: any) {
      showToast(err.message || "Silme başarısız", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async (file: MediaItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await toggleFavoriteFile(file.id, !file.isFavorite);
      setMediaFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, isFavorite: !f.isFavorite } : f
      ));
      showToast(file.isFavorite ? "Favorilerden çıkarıldı" : "Favorilere eklendi", "success");
    } catch (err: any) {
      showToast(err.message || "İşlem başarısız", "error");
    }
  };

  // Context menu handler
  const openContextMenu = (e: React.MouseEvent, file: MediaItem) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ file, x: rect.left, y: rect.bottom + 5 });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setEditSubmenuOpen(false);
  };

  // Click outside to close context menu
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  const handleOpenFile = (file: MediaItem) => {
    closeContextMenu();
    openLightbox(filteredMedia.indexOf(file));
  };

  // Klasörleri yükle
  const loadFolders = async () => {
    try {
      const data = await apiFetch('/files?foldersOnly=true', {}, true);
      if (data?.folders) {
        setFolders(data.folders);
      }
    } catch (err) {
      console.error("Klasörler yüklenemedi:", err);
    }
  };

  const handleMoveFile = async (file: MediaItem) => {
    closeContextMenu();
    await loadFolders();
    setSelectedFolderId(file.folderId || null);
    setMoveTarget(file);
  };

  const confirmMove = async () => {
    if (!moveTarget) return;
    try {
      setMoving(true);
      await apiFetch(`/files/${moveTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId: selectedFolderId })
      }, true);
      setMediaFiles(prev => prev.map(f => 
        f.id === moveTarget.id ? { ...f, folderId: selectedFolderId } : f
      ));
      showToast("Dosya taşındı", "success");
      setMoveTarget(null);
    } catch (err: any) {
      showToast(err.message || "Taşıma başarısız", "error");
    } finally {
      setMoving(false);
    }
  };

  const handleRenameFile = (file: MediaItem) => {
    closeContextMenu();
    setRenameValue(file.filename);
    setRenameTarget(file);
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      setRenaming(true);
      await renameFile(renameTarget.id, renameValue.trim());
      setMediaFiles(prev => prev.map(f => 
        f.id === renameTarget.id ? { ...f, filename: renameValue.trim() } : f
      ));
      showToast("Dosya yeniden adlandırıldı", "success");
      setRenameTarget(null);
    } catch (err: any) {
      showToast(err.message || "Yeniden adlandırma başarısız", "error");
    } finally {
      setRenaming(false);
    }
  };

  const handleCopyFile = (file: MediaItem) => {
    closeContextMenu();
    // Dosya linkini panoya kopyala
    navigator.clipboard.writeText(`${window.location.origin}/files?preview=${file.id}`);
    showToast("Dosya linki kopyalandı", "success");
  };

  const handleAddComment = (file: MediaItem) => {
    closeContextMenu();
    setCommentValue('');
    setEditingCommentId(null);
    setEditingCommentValue('');
    setCommentTarget(file);
  };

  // Parse comments from JSON string
  const parseComments = (comment: string | null | undefined): CommentItem[] => {
    if (!comment) return [];
    try {
      const parsed = JSON.parse(comment);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Eski format - tek string ise array'e çevir
      if (comment.trim()) {
        return [{ id: crypto.randomUUID(), text: comment, createdAt: new Date().toISOString() }];
      }
      return [];
    }
  };

  // Add new comment
  const addComment = async () => {
    if (!commentTarget || !commentValue.trim()) return;
    try {
      setSavingComment(true);
      const currentComments = parseComments(commentTarget.comment);
      const newComment: CommentItem = {
        id: crypto.randomUUID(),
        text: commentValue.trim(),
        createdAt: new Date().toISOString()
      };
      const updatedComments = [...currentComments, newComment];
      const commentJson = JSON.stringify(updatedComments);
      
      await apiFetch(`/files/${commentTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: commentJson })
      }, true);
      
      setMediaFiles(prev => prev.map(f => 
        f.id === commentTarget.id ? { ...f, comment: commentJson } : f
      ));
      setCommentTarget(prev => prev ? { ...prev, comment: commentJson } : null);
      setCommentValue('');
      showToast("Yorum eklendi", "success");
    } catch (err: any) {
      showToast(err.message || "Yorum eklenemedi", "error");
    } finally {
      setSavingComment(false);
    }
  };

  // Update existing comment
  const updateComment = async (commentId: string) => {
    if (!commentTarget || !editingCommentValue.trim()) return;
    try {
      setSavingComment(true);
      const currentComments = parseComments(commentTarget.comment);
      const updatedComments = currentComments.map(c => 
        c.id === commentId ? { ...c, text: editingCommentValue.trim(), updatedAt: new Date().toISOString() } : c
      );
      const commentJson = JSON.stringify(updatedComments);
      
      await apiFetch(`/files/${commentTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: commentJson })
      }, true);
      
      setMediaFiles(prev => prev.map(f => 
        f.id === commentTarget.id ? { ...f, comment: commentJson } : f
      ));
      setCommentTarget(prev => prev ? { ...prev, comment: commentJson } : null);
      setEditingCommentId(null);
      setEditingCommentValue('');
      showToast("Yorum güncellendi", "success");
    } catch (err: any) {
      showToast(err.message || "Yorum güncellenemedi", "error");
    } finally {
      setSavingComment(false);
    }
  };

  // Delete comment
  const deleteComment = async (commentId: string) => {
    if (!commentTarget) return;
    try {
      setSavingComment(true);
      const currentComments = parseComments(commentTarget.comment);
      const updatedComments = currentComments.filter(c => c.id !== commentId);
      const commentJson = updatedComments.length > 0 ? JSON.stringify(updatedComments) : null;
      
      await apiFetch(`/files/${commentTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: commentJson })
      }, true);
      
      setMediaFiles(prev => prev.map(f => 
        f.id === commentTarget.id ? { ...f, comment: commentJson } : f
      ));
      setCommentTarget(prev => prev ? { ...prev, comment: commentJson } : null);
      showToast("Yorum silindi", "success");
    } catch (err: any) {
      showToast(err.message || "Yorum silinemedi", "error");
    } finally {
      setSavingComment(false);
    }
  };

  const confirmComment = async () => {
    if (!commentTarget) return;
    await addComment();
  };

  const handleVersionHistory = async (file: MediaItem) => {
    closeContextMenu();
    setVersionsTarget(file);
    setLoadingVersions(true);
    try {
      const data = await listVersions(file.id);
      setVersions(data?.versions || []);
    } catch (err) {
      showToast("Sürüm geçmişi yüklenemedi", "error");
      setVersionsTarget(null);
    } finally {
      setLoadingVersions(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigateLightbox('prev');
      if (e.key === 'ArrowRight') navigateLightbox('next');
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxIndex]);

  if (loading) {
    return (
      <div className="files-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div className="animate-spin" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }}>
            <svg viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="files-page">
      {/* Sidebar - Ortak Component */}
      <Sidebar user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="files-main">
        <div className="files-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="files-title">Fotoğraflar & Medya</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Tüm görsel ve video içerikleriniz tek bir yerde
            </p>
          </div>
          
          {/* Upload Button */}
          <div style={{ position: 'relative' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: uploading 
                  ? 'rgba(139, 92, 246, 0.5)' 
                  : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                transition: 'all 0.2s'
              }}
            >
              {uploading ? (
                <>
                  <div className="loading-spinner" style={{ width: '18px', height: '18px' }}></div>
                  <span>Yükleniyor... %{uploadProgress}</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Yükle</span>
                </>
              )}
            </button>
          </div>
        </div>

        {mediaFiles.length === 0 ? (
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
              width: '140px', 
              height: '140px', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '2rem',
              position: 'relative'
            }}>
              {/* Kamera ikonu */}
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {/* Küçük fotoğraf çerçeveleri */}
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-5px',
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)',
                borderRadius: '8px',
                border: '2px solid rgba(255,255,255,0.1)',
                transform: 'rotate(15deg)'
              }} />
              <div style={{
                position: 'absolute',
                bottom: '-5px',
                left: '-10px',
                width: '35px',
                height: '35px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)',
                borderRadius: '8px',
                border: '2px solid rgba(255,255,255,0.1)',
                transform: 'rotate(-10deg)'
              }} />
            </div>
            
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 600, 
              color: '#ffffff',
              marginBottom: '0.75rem'
            }}>
              Henüz hiç fotoğrafınız yok
            </h2>
            
            <p style={{ 
              color: '#94a3b8', 
              fontSize: '0.95rem',
              lineHeight: 1.6,
              marginBottom: '2rem'
            }}>
              Fotoğraf ve videolarınızı yükleyin, burada otomatik olarak görünecekler. 
              Anılarınızı güvenle saklayın!
            </p>
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="files-btn"
              style={{ 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
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
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              İlk Fotoğrafını Yükle
            </button>
          </div>
        ) : (
          /* Gallery Content */
          <div style={{ padding: '1.5rem' }}>
            {/* Search and Filters */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              {/* Search Box */}
              <div style={{ position: 'relative', maxWidth: '400px' }}>
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 20 20" 
                  fill="#64748b"
                  style={{ 
                    position: 'absolute', 
                    left: '12px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none'
                  }}
                >
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                <input
                  type="text"
                  placeholder="Fotoğraf veya yorum ara..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(24); }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem 0.65rem 2.5rem',
                    borderRadius: '10px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'rgba(100, 116, 139, 0.3)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#94a3b8'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filters Row */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['all', 'images', 'videos', 'favorites'] as const).map(type => (
                  <button 
                    key={type}
                    onClick={() => { setFilterType(type); setVisibleCount(24); }}
                    style={{ 
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: filterType === type ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
                      background: filterType === type 
                        ? type === 'favorites' 
                          ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
                          : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' 
                        : 'rgba(30, 41, 59, 0.5)',
                      color: filterType === type ? 'white' : '#94a3b8',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {type === 'favorites' && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                    {type === 'all' ? 'Tümü' : type === 'images' ? 'Fotoğraflar' : type === 'videos' ? 'Videolar' : 'Favoriler'}
                  </button>
                ))}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                  {filteredMedia.length} öğe
                </span>
                <select 
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                  style={{ 
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="newest">En Yeni</option>
                  <option value="oldest">En Eski</option>
                </select>
              </div>
              </div>
            </div>

            {/* Grid */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '1rem'
            }}>
              {visibleMedia.map((file, index) => (
                <div 
                  key={file.id}
                  onClick={() => openLightbox(filteredMedia.indexOf(file))}
                  style={{ 
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    transition: 'all 0.3s',
                  }}
                  className="gallery-item"
                >
                  {/* Thumbnail */}
                  {isVideo(file.filename) ? (
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)'
                    }}>
                      <svg width="48" height="48" viewBox="0 0 20 20" fill="#c4b5fd">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : thumbnailUrls[file.id] && thumbnailUrls[file.id] !== 'error' && thumbnailUrls[file.id] !== 'r2_error' ? (
                    <img 
                      src={thumbnailUrls[file.id]}
                      alt={file.filename}
                      loading="lazy"
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        transition: 'transform 0.3s'
                      }}
                      onError={(e) => {
                        // Hata durumunda tekrar yüklemeyi dene
                        const imgEl = e.target as HTMLImageElement;
                        const currentSrc = imgEl.src;
                        // Eğer stream URL değilse, doğrudan API URL'si dene
                        if (!currentSrc.includes('/stream')) {
                          imgEl.src = `${API_BASE}/files/${file.id}/stream?t=${Date.now()}`;
                        } else {
                          imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%231e293b" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2364748b" font-size="12">Yüklenemedi</text></svg>';
                        }
                      }}
                    />
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '0.5rem',
                      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)'
                    }}>
                      {thumbnailUrls[file.id] === 'r2_error' ? (
                        <>
                          <svg width="32" height="32" viewBox="0 0 20 20" fill="#f59e0b">
                            <path fillRule="evenodd" d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" clipRule="evenodd" />
                          </svg>
                          <span style={{ color: '#f59e0b', fontSize: '0.65rem', textAlign: 'center', padding: '0 4px' }}>Bulut depolama bağlantısı yok</span>
                        </>
                      ) : thumbnailUrls[file.id] === 'error' ? (
                        <>
                          <svg width="32" height="32" viewBox="0 0 20 20" fill="#475569">
                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                          </svg>
                          <span style={{ color: '#64748b', fontSize: '0.65rem' }}>Görsel bulunamadı</span>
                        </>
                      ) : (
                        <div className="loading-spinner" style={{ width: '24px', height: '24px' }}></div>
                      )}
                    </div>
                  )}
                  
                  {/* Video indicator */}
                  {isVideo(file.filename) && (
                    <div style={{ 
                      position: 'absolute', 
                      top: '8px', 
                      right: '8px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '0.65rem',
                      color: 'white',
                      fontWeight: 600
                    }}>
                      VIDEO
                    </div>
                  )}
                  
                  {/* Yıldız (Favori) butonu */}
                  <button
                    onClick={(e) => handleToggleFavorite(file, e)}
                    className="gallery-star-btn"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: file.isFavorite ? '8px' : '8px',
                      background: file.isFavorite ? 'rgba(234, 179, 8, 0.9)' : 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: file.isFavorite ? 1 : 0,
                      transition: 'all 0.2s',
                      zIndex: 5
                    }}
                    title={file.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill={file.isFavorite ? '#fef3c7' : 'white'}>
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                  
                  {/* 3 nokta menü butonu */}
                  <button
                    onClick={(e) => openContextMenu(e, file)}
                    className="gallery-menu-btn"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: isVideo(file.filename) ? '60px' : '8px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      zIndex: 5
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                  
                  {/* Hover overlay with actions */}
                  <div 
                    className="gallery-overlay"
                    style={{ 
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      padding: '12px',
                      pointerEvents: 'none'
                    }}
                  >
                    <p style={{ 
                      color: 'white', 
                      fontSize: '0.75rem', 
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '4px'
                    }}>
                      {file.filename}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                      {formatDate(file.createdAt)} · {formatFileSize(file.sizeBytes)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Load more trigger */}
            {visibleCount < filteredMedia.length && (
              <div 
                ref={loadMoreRef}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  padding: '2rem',
                  color: '#64748b'
                }}
              >
                Daha fazla yükleniyor...
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightboxOpen && (
        <div 
          onClick={closeLightbox}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
        >
          {/* Close button */}
          <button 
            onClick={closeLightbox}
            style={{ 
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          
          {/* Navigation buttons */}
          <button 
            onClick={(e) => { e.stopPropagation(); navigateLightbox('prev'); }}
            style={{ 
              position: 'absolute',
              left: '1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); navigateLightbox('next'); }}
            style={{ 
              position: 'absolute',
              right: '1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="white">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          
          {/* Image/Video */}
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '90vw',
              maxHeight: '85vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {lightboxLoading ? (
              <div className="animate-spin" style={{ width: '48px', height: '48px' }}>
                <svg viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : lightboxUrl ? (
              isVideo(filteredMedia[lightboxIndex]?.filename || '') ? (
                <video 
                  src={lightboxUrl}
                  controls
                  autoPlay
                  style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px' }}
                />
              ) : (
                <img 
                  src={lightboxUrl}
                  alt={filteredMedia[lightboxIndex]?.filename}
                  style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
                />
              )
            ) : null}
          </div>
          
          {/* Info bar */}
          <div style={{ 
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '8px',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            color: 'white',
            fontSize: '0.85rem'
          }}>
            <span>{filteredMedia[lightboxIndex]?.filename}</span>
            <span style={{ color: '#64748b' }}>•</span>
            <span style={{ color: '#94a3b8' }}>{lightboxIndex + 1} / {filteredMedia.length}</span>
            <button 
              onClick={(e) => { e.stopPropagation(); handleDownload(filteredMedia[lightboxIndex]); }}
              style={{ 
                background: 'rgba(59, 130, 246, 0.3)',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                color: '#93c5fd',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              İndir
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div 
          style={{
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
            zIndex: 1000
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              maxWidth: '400px', 
              width: '90%',
              textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
              borderRadius: '16px',
              padding: '2rem',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ 
              width: '64px', 
              height: '64px', 
              background: 'rgba(239, 68, 68, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem'
            }}>
              <svg width="28" height="28" viewBox="0 0 20 20" fill="#f87171">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#ffffff' }}>
              Dosyayı Sil
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <strong style={{ color: '#ffffff' }}>{deleteTarget.filename}</strong>
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Bu dosya çöp kutusuna taşınacak.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button 
                onClick={() => setDeleteTarget(null)}
                className="files-btn"
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8'
                }}
              >
                İptal
              </button>
              <button 
                onClick={handleDelete}
                disabled={deleting}
                className="files-btn"
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  color: '#fca5a5',
                  fontWeight: 600,
                  opacity: deleting ? 0.7 : 1
                }}
              >
                {deleting ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 1100 }}>
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

      {/* Context Menu Dropdown */}
      {contextMenu && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            top: Math.min(contextMenu.y, window.innerHeight - 380),
            background: 'rgba(30, 41, 59, 0.98)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '12px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(12px)',
            padding: '8px 0',
            minWidth: '200px',
            zIndex: 2000,
            animation: 'fadeIn 0.15s ease'
          }}
        >
          {/* Açık */}
          <button
            onClick={() => handleOpenFile(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
            Açık
          </button>

          {/* İndir */}
          <button
            onClick={() => { handleDownload(contextMenu.file); closeContextMenu(); }}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            İndir
          </button>

          {/* Yeniden Adlandır */}
          <button
            onClick={() => handleRenameFile(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Yeniden Adlandır
          </button>

          <div style={{ height: '1px', background: 'rgba(148, 163, 184, 0.1)', margin: '8px 0' }} />

          {/* Hareket */}
          <button
            onClick={() => handleMoveFile(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            Hareket
          </button>

          {/* Link Kopyala */}
          <button
            onClick={() => handleCopyFile(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
            </svg>
            Link Kopyala
          </button>

          {/* Sil */}
          <button
            onClick={() => { setDeleteTarget(contextMenu.file); closeContextMenu(); }}
            className="context-menu-item context-menu-item-danger"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Sil
          </button>

          <div style={{ height: '1px', background: 'rgba(148, 163, 184, 0.1)', margin: '8px 0' }} />

          {/* Yorumlar */}
          <button
            onClick={() => handleAddComment(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
            Yorumlar
          </button>

          {/* Sürüm geçmişi */}
          <button
            onClick={() => handleVersionHistory(contextMenu.file)}
            className="context-menu-item"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            Sürüm geçmişi
          </button>
        </div>
      )}

      {/* Move Modal */}
      {moveTarget && (
        <div 
          onClick={() => setMoveTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 2001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(30, 41, 59, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '400px',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
              Dosya Taşı
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
              "{moveTarget.filename}" dosyasını taşımak için klasör seçin:
            </p>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
              <button
                onClick={() => setSelectedFolderId(null)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: selectedFolderId === null ? 'rgba(139, 92, 246, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                  border: selectedFolderId === null ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.1)',
                  borderRadius: '8px',
                  color: selectedFolderId === null ? '#c4b5fd' : '#e2e8f0',
                  textAlign: 'left',
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                Ana Klasör
              </button>
              
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: selectedFolderId === folder.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                    border: selectedFolderId === folder.id ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.1)',
                    borderRadius: '8px',
                    color: selectedFolderId === folder.id ? '#c4b5fd' : '#e2e8f0',
                    textAlign: 'left',
                    cursor: 'pointer',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  {folder.name}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setMoveTarget(null)}
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button 
                onClick={confirmMove}
                disabled={moving}
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontWeight: 600,
                  cursor: moving ? 'not-allowed' : 'pointer',
                  opacity: moving ? 0.7 : 1
                }}
              >
                {moving ? 'Taşınıyor...' : 'Taşı'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div 
          onClick={() => setRenameTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 2001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(30, 41, 59, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '400px',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '1rem' }}>
              Yeniden Adlandır
            </h3>
            
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Yeni dosya adı"
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.95rem',
                marginBottom: '1rem',
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenameTarget(null);
              }}
            />
            
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setRenameTarget(null)}
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button 
                onClick={confirmRename}
                disabled={renaming || !renameValue.trim()}
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontWeight: 600,
                  cursor: renaming || !renameValue.trim() ? 'not-allowed' : 'pointer',
                  opacity: renaming || !renameValue.trim() ? 0.7 : 1
                }}
              >
                {renaming ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Versions Modal */}
      {versionsTarget && (
        <div 
          onClick={() => setVersionsTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 2001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(30, 41, 59, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
              Sürüm Geçmişi
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {versionsTarget.filename}
            </p>
            
            {loadingVersions ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                <div className="loading-spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }}></div>
                Yükleniyor...
              </div>
            ) : versions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ margin: '0 auto 0.5rem', opacity: 0.5 }}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <p>Henüz sürüm geçmişi yok</p>
                <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Dosya güncellendikçe sürümler burada görünecek</p>
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {versions.map((v, i) => (
                  <div 
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: i === 0 ? 'rgba(139, 92, 246, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                      border: i === 0 ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '8px',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <div>
                      <p style={{ color: '#e2e8f0', fontWeight: 500 }}>
                        Sürüm {v.version} {i === 0 && <span style={{ color: '#c4b5fd', fontSize: '0.75rem' }}>(Güncel)</span>}
                      </p>
                      <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        {formatDate(v.createdAt)} · {formatFileSize(v.sizeBytes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                onClick={() => setVersionsTarget(null)}
                style={{ 
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {commentTarget && (
        <div 
          onClick={() => { setCommentTarget(null); setEditingCommentId(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 2001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(30, 41, 59, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.25rem' }}>
              Yorumlar
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {commentTarget.filename}
            </p>
            
            {/* Mevcut Yorumlar Listesi */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              marginBottom: '1rem',
              maxHeight: '300px',
              minHeight: '100px'
            }}>
              {parseComments(commentTarget.comment).length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#64748b', 
                  padding: '2rem',
                  fontSize: '0.9rem'
                }}>
                  Henüz yorum yok
                </div>
              ) : (
                parseComments(commentTarget.comment).map((c, index) => (
                  <div 
                    key={c.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.15)',
                      borderRadius: '10px',
                      padding: '0.875rem',
                      marginBottom: '0.5rem'
                    }}
                  >
                    {editingCommentId === c.id ? (
                      // Düzenleme modu
                      <div>
                        <textarea
                          value={editingCommentValue}
                          onChange={(e) => setEditingCommentValue(e.target.value)}
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '0.625rem',
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid rgba(139, 92, 246, 0.4)',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '0.9rem',
                            outline: 'none',
                            resize: 'vertical',
                            minHeight: '60px',
                            fontFamily: 'inherit'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setEditingCommentId(null); setEditingCommentValue(''); }}
                            style={{
                              padding: '0.375rem 0.75rem',
                              background: 'rgba(100, 116, 139, 0.2)',
                              border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '6px',
                              color: '#94a3b8',
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            İptal
                          </button>
                          <button
                            onClick={() => updateComment(c.id)}
                            disabled={savingComment || !editingCommentValue.trim()}
                            style={{
                              padding: '0.375rem 0.75rem',
                              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                              border: 'none',
                              borderRadius: '6px',
                              color: 'white',
                              fontSize: '0.8rem',
                              fontWeight: 500,
                              cursor: savingComment || !editingCommentValue.trim() ? 'not-allowed' : 'pointer',
                              opacity: savingComment || !editingCommentValue.trim() ? 0.6 : 1
                            }}
                          >
                            {savingComment ? 'Kaydediliyor...' : 'Kaydet'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Görüntüleme modu
                      <div>
                        <p style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '0.5rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {c.text}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {new Date(c.createdAt).toLocaleDateString('tr-TR', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                            {c.updatedAt && ' (düzenlendi)'}
                          </span>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingCommentValue(c.text); }}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#94a3b8',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Düzenle
                            </button>
                            <button
                              onClick={() => deleteComment(c.id)}
                              disabled={savingComment}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#f87171',
                                fontSize: '0.75rem',
                                cursor: savingComment ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            
            {/* Yeni Yorum Ekleme */}
            <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '1rem' }}>
              <textarea
                value={commentValue}
                onChange={(e) => setCommentValue(e.target.value)}
                placeholder="Yeni yorum yaz..."
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  marginBottom: '0.75rem',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: '70px',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setCommentTarget(null); setEditingCommentId(null); }
                  if (e.key === 'Enter' && e.metaKey && commentValue.trim()) addComment();
                }}
              />
              
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => { setCommentTarget(null); setEditingCommentId(null); }}
                  style={{ 
                    padding: '0.625rem 1.25rem',
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '10px',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  Kapat
                </button>
                <button 
                  onClick={addComment}
                  disabled={savingComment || !commentValue.trim()}
                  style={{ 
                    padding: '0.625rem 1.25rem',
                    background: savingComment || !commentValue.trim() 
                      ? 'rgba(100, 116, 139, 0.3)' 
                      : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontWeight: 600,
                    cursor: savingComment || !commentValue.trim() ? 'not-allowed' : 'pointer',
                    opacity: savingComment || !commentValue.trim() ? 0.6 : 1
                  }}
                >
                  {savingComment ? 'Ekleniyor...' : 'Yorum Ekle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gallery hover styles */}
      <style jsx global>{`
        .gallery-item:hover {
          transform: scale(1.02);
          border-color: rgba(139, 92, 246, 0.4) !important;
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.3);
        }
        .gallery-item:hover .gallery-overlay {
          opacity: 1 !important;
        }
        .gallery-item:hover .gallery-menu-btn {
          opacity: 1 !important;
        }
        .gallery-item:hover .gallery-star-btn {
          opacity: 1 !important;
        }
        .gallery-item:hover img {
          transform: scale(1.1);
        }
        .gallery-menu-btn:hover {
          background: rgba(0, 0, 0, 0.8) !important;
          transform: scale(1.1);
        }
        .gallery-star-btn:hover {
          transform: scale(1.15);
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .context-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: #e2e8f0;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
        }
        .context-menu-item:hover {
          background: rgba(139, 92, 246, 0.15);
          color: #c4b5fd;
        }
        .context-menu-item svg {
          flex-shrink: 0;
          color: #94a3b8;
        }
        .context-menu-item:hover svg {
          color: #c4b5fd;
        }
        .context-menu-item-danger:hover {
          background: rgba(239, 68, 68, 0.15) !important;
          color: #fca5a5 !important;
        }
        .context-menu-item-danger:hover svg {
          color: #fca5a5 !important;
        }
      `}</style>
    </div>
  );
}
