"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearAuth, getStoredUser, renameFile, deleteFile as deleteFileApi, shareFile, updateShare, getShareStats, listFavorites, toggleFavoriteFile, listTrash, restoreFile, permanentDeleteFile, listVersions, restoreVersion, deleteVersion, updateFolder, deleteFolder, restoreFolder, permanentDeleteFolder, toggleFolderFavorite, getAccountStorage, updatePlan, emptyTrash, fetchSharedFiles, getDownloadUrl, getViewUrl, listHiddenFiles, toggleFileHidden, toggleFolderHidden, hasHiddenFilesPin, verifyHiddenFilesPin, setHiddenFilesPin, shareFolder, shareFileWithTeam, listMyTeams } from "../../lib/api";
import { encryptAndUploadWithKey, downloadAndDecryptWithKey, hasMasterKey, getMasterKey, clearMasterKey, decryptFilenameWithKey, initializeMasterKey, b64ToU8, u8ToB64, aesGcmDecrypt } from "../../lib/crypto";
import { useWebSocket } from "../../lib/useWebSocket";

type FileItem = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  updatedAt?: string;
  folderId?: string | null;
  folder?: { id: string; name: string } | null;
  isFavorite?: boolean;
  isDeleted?: boolean;
  deletedAt?: string | null;
  isEncrypted?: boolean;
  // Şifreli dosya metadata'sı
  metaNameEnc?: string | null;
  metaNameIv?: string | null;
  // Şifreleme için EDEK bilgileri
  edek?: string | null;
  edekIv?: string | null;
  cipherIv?: string | null;
  // Paylaşım alanları (shared tab için)
  shareToken?: string | null;
  sharePermission?: "VIEW" | "DOWNLOAD" | "EDIT" | null;
  shareExpiresAt?: string | null;
  shareOpenCount?: number | null;
};
type FolderItem = {
  id: string;
  name: string;
  parentFolderId?: string | null;
  createdAt: string;
  fileCount?: number;
  totalSize?: number;
  isFavorite?: boolean;
};

type ActivityItem = {
  id: string;
  type: 'FILE_UPLOAD' | 'FILE_DOWNLOAD' | 'FILE_DELETE' | 'FILE_SHARE' | 'FILE_SHARE_EXPIRED' | 'FILE_RENAME' | 'FILE_RESTORE' | 'FILE_MOVE' | 'FOLDER_CREATE' | 'FOLDER_DELETE' | 'TEAM_MEMBER_JOINED' | 'TEAM_MEMBER_LEFT' | 'COMMENT_ADDED' | 'PASSWORD_CHANGED' | 'LOGIN';
  fileName?: string;
  fileId?: string;
  folderId?: string;
  folderName?: string;
  actorName?: string;
  actorId?: string;
  createdAt: string;
  isRead: boolean;
  metadata?: string;
};

export default function FilesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [usage, setUsage] = useState<{ usedStorageBytes: number; storageLimitBytes: number; trashStorageBytes?: number; trashLimitBytes?: number; plan?: string } | null>(null);
  
  // WebSocket bağlantısını kur
  const token = typeof window !== 'undefined' ? localStorage.getItem('cloudyone_token') || localStorage.getItem('token') : null;
  const { isConnected, on } = useWebSocket(token);
  // Eski alt panel yerine modallar için hedef dosya state'leri
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null);
  const [shareModalLink, setShareModalLink] = useState<string | null>(null);
  const [shareGenerating, setShareGenerating] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<string | number>("24");
  const [shareExpiryDate, setShareExpiryDate] = useState<string>(""); // YYYY-MM-DD
  const [shareExpiryTime, setShareExpiryTime] = useState<string>(""); // HH:mm
  const [shareExpiryMode, setShareExpiryMode] = useState<"hours" | "datetime">("hours"); // saat veya tarih modu
  const [sharePermission, setSharePermission] = useState<"VIEW" | "DOWNLOAD" | "EDIT">("DOWNLOAD");
  const [shareStats, setShareStats] = useState<any | null>(null);
  const [shareStatsLoading, setShareStatsLoading] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ permission: string; expiresAt: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [unsharing, setUnsharing] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isStoppingShare, setIsStoppingShare] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<FileItem | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderRenameTarget, setFolderRenameTarget] = useState<FolderItem | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderItem | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileActionLoading, setFileActionLoading] = useState<Record<string, { download?: boolean; delete?: boolean; rename?: boolean }>>({});
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [versionTarget, setVersionTarget] = useState<FileItem | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<FileItem | null>(null);
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<FileItem | null>(null);
  const [permanentDeleteFolderTarget, setPermanentDeleteFolderTarget] = useState<FolderItem | null>(null);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("FREE");
  const [planUpdating, setPlanUpdating] = useState(false);
  // Çöp kutusu boşaltma onayı için ek state'ler
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  // Etkinlik temizleme onay modalı
  const [showClearActivitiesConfirm, setShowClearActivitiesConfirm] = useState(false);
  const [clearingActivities, setClearingActivities] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [fileType, setFileType] = useState(""); // pdf,image,video,zip,other
  const [sortKey, setSortKey] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  // Paylaşılanlar tabı
  const [showShared, setShowShared] = useState(false);
  const searchDebounceRef = useRef<any>(null);
  const [folderSearchTerm, setFolderSearchTerm] = useState("");
  const [folderSortOrder, setFolderSortOrder] = useState<"asc" | "desc">("desc");
  const [folderContextMenu, setFolderContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error'; isExiting?: boolean }>>([]);
  const toastIdRef = useRef(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Toplam depolama grafiği için TÜM dosyalar (klasörden bağımsız)
  const [allUserFiles, setAllUserFiles] = useState<FileItem[]>([]);
  // Çöp kutusu otomatik silme süresi (kullanıcı tercihinden gelecek)
  const [autoDeleteTrashDays, setAutoDeleteTrashDays] = useState(30);
  // Depolama dolu uyarı modalı
  const [showStorageFullWarning, setShowStorageFullWarning] = useState(false);
  // Animasyon tetikleyicisi
  const [animateContent, setAnimateContent] = useState(false);
  // Aynı dosya yükleme onayı
  const [duplicateFileWarning, setDuplicateFileWarning] = useState<{ file: File; existingFile?: any } | null>(null);
  // Sürüm silme onayı
  const [deleteVersionConfirm, setDeleteVersionConfirm] = useState<{ versionId: number; version: number } | null>(null);
  // Gizli dosyalar
  const [showHidden, setShowHidden] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  // Klasör paylaşma
  const [folderShareTarget, setFolderShareTarget] = useState<FolderItem | null>(null);
  const [folderShareExpiry, setFolderShareExpiry] = useState<string>("1d");
  const [folderSharePermission, setFolderSharePermission] = useState<"DOWNLOAD" | "VIEW">("DOWNLOAD");
  const [folderShareLink, setFolderShareLink] = useState<string | null>(null);
  const [folderShareGenerating, setFolderShareGenerating] = useState(false);
  
  // Ekiple paylaş state'leri
  const [teamShareTarget, setTeamShareTarget] = useState<FileItem | null>(null);
  const [userTeams, setUserTeams] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [teamShareLoading, setTeamShareLoading] = useState(false);
  
  // Dosya context menu state'i
  const [fileContextMenu, setFileContextMenu] = useState<{ fileId: string; x: number; y: number } | null>(null);
  const fileContextMenuRef = useRef<HTMLDivElement>(null);
  
  // Şifreleme durumu (master key memory'de var mı?)
  const [hasEncryptionKey, setHasEncryptionKey] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const decryptedFileIdsRef = useRef<Set<string>>(new Set()); // Hangi dosyaların decrypt edildiğini takip et
  
  // Şifre giriş modalı için
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'view' | 'download' | 'upload'; file?: FileItem } | null>(null);
  
  // Uygulama Merkezi menü state'i
  const [showAppCenter, setShowAppCenter] = useState(false);
  const appCenterRef = useRef<HTMLDivElement>(null);
  
  // Etkinlik Paneli state'leri
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  

  
  // Uygulama Merkezi araçları konfigürasyonu
  const appCenterTools = [
    {
      id: 'transfer',
      title: 'Hızlı Transfer',
      description: 'Büyük dosyaları güvenle gönder',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 2L11 13" />
          <path d="M22 2L15 22l-4-9-9-4 20-7z" />
        </svg>
      ),
      color: '#3b82f6',
      href: '/transfer'
    }
  ];
  
  // Master key kontrolü (şifreleme hazır mı?)
  useEffect(() => {
    const checkEncryptionKey = () => {
      try {
        const hasKey = hasMasterKey();
        setHasEncryptionKey(hasKey);
        console.log(`🔐 Master key durumu: ${hasKey}`);
      } catch (err) {
        console.error("Master key kontrol hatası:", err);
        setHasEncryptionKey(false);
      }
    };
    
    checkEncryptionKey();
    
    // Master key expire olduğunda dinle
    const handleKeyExpired = () => {
      setHasEncryptionKey(false);
      showToast("Oturumunuz zaman aşımına uğradı. Şifreli dosyalar için yeniden giriş yapın.", 'error');
    };
    
    window.addEventListener('master-key-expired', handleKeyExpired);
    
    // Periyodik kontrol (her 5 saniyede bir kontrol et)
    const interval = setInterval(checkEncryptionKey, 5000);
    
    return () => {
      window.removeEventListener('master-key-expired', handleKeyExpired);
      clearInterval(interval);
    };
  }, [refreshFlag]); // refreshFlag değişince yeniden kontrol et
  
  // Şifreli dosya adlarını çöz - sessionStorage'da cache'le
  useEffect(() => {
    const decryptFileNames = async () => {
      // hasMasterKey() doğrudan çağır, state'e bağlı değil
      if (!hasMasterKey()) {
        console.log("🔐 Master key yok, şifreli dosya adları çözülemiyor");
        return;
      }
      
      // SessionStorage'dan cache'i oku
      const cachedDecryptions = typeof window !== 'undefined' 
        ? JSON.parse(sessionStorage.getItem('decrypted_filenames') || '{}')
        : {};
      
      // Şifreli ve henüz çözülmemiş ve zaten decrypt edilmemiş dosyaları bul
      const encryptedFiles = files.filter(
        f => f.isEncrypted && f.metaNameEnc && f.metaNameIv && f.filename === 'encrypted' && !cachedDecryptions[f.id]
      );
      
      if (encryptedFiles.length === 0) {
        // Eğer cache'de veri varsa, dosyaları cache'den güncelle
        if (Object.keys(cachedDecryptions).length > 0) {
          setFiles(prevFiles => 
            prevFiles.map(file => {
              if (cachedDecryptions[file.id]) {
                return { ...file, filename: cachedDecryptions[file.id] };
              }
              return file;
            })
          );
          console.log(`🔓 ${Object.keys(cachedDecryptions).length} şifreli dosya adı cache'den yüklendi`);
        }
        return;
      }
      
      try {
        const masterKey = getMasterKey();
        
        // Dosya adlarını paralel olarak çöz
        const decryptedNames = await Promise.all(
          encryptedFiles.map(async (file) => {
            try {
              const decryptedName = await decryptFilenameWithKey(
                file.metaNameEnc!,
                file.metaNameIv!,
                masterKey
              );
              return { id: file.id, filename: decryptedName };
            } catch (err) {
              console.error(`Dosya adı çözülemedi: ${file.id}`, err);
              return { id: file.id, filename: file.filename }; // Hata durumunda orijinal adı koru
            }
          })
        );
        
        // Cache'i güncelle (sessionStorage'da sakla)
        const newDecryptions = { ...cachedDecryptions };
        decryptedNames.forEach(item => {
          if (item.filename !== 'encrypted') {
            newDecryptions[item.id] = item.filename;
            decryptedFileIdsRef.current.add(item.id);
          }
        });
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('decrypted_filenames', JSON.stringify(newDecryptions));
        }
        
        // Dosya listesini güncelle
        setFiles(prevFiles => 
          prevFiles.map(file => {
            const decrypted = decryptedNames.find(d => d.id === file.id);
            if (decrypted && decrypted.filename !== 'encrypted') {
              return { ...file, filename: decrypted.filename };
            } else if (newDecryptions[file.id]) {
              return { ...file, filename: newDecryptions[file.id] };
            }
            return file;
          })
        );
        
        console.log(`🔓 ${decryptedNames.filter(d => d.filename !== 'encrypted').length} şifreli dosya adı çözüldü ve cache'lendi`);
      } catch (err) {
        console.error("Dosya adları çözülürken hata:", err);
      }
    };
    
    decryptFileNames();
  }, [files.length, refreshFlag, showHidden, showFavorites, showTrash, showShared]); // Tüm filter state'ları ekle
  
  // Uygulama Merkezi dışına tıklama kontrolü
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (appCenterRef.current && !appCenterRef.current.contains(event.target as Node)) {
        setShowAppCenter(false);
      }
    };
    
    if (showAppCenter) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAppCenter]);
  
  // Etkinlik Paneli dışına tıklama kontrolü
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activityPanelRef.current && !activityPanelRef.current.contains(event.target as Node)) {
        setShowActivityPanel(false);
      }
    };
    
    if (showActivityPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActivityPanel]);
  
  // Etkinlikleri API'den yükle
  const loadActivities = async (page: number = 1, reset: boolean = false) => {
    if (activitiesLoading) return;
    
    setActivitiesLoading(true);
    
    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const data = await apiFetch(`/api/activities?limit=${limit}&offset=${offset}`, { auth: true }, true);
      
      const newActivities = data.activities || [];
      
      if (reset) {
        setActivities(newActivities);
      } else {
        setActivities(prev => [...prev, ...newActivities]);
      }
      
      setActivitiesPage(page);
      setHasMoreActivities(newActivities.length >= limit);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Etkinlikler yüklenirken hata:', error);
    }
    
    setActivitiesLoading(false);
  };
  
  // Tümünü okundu işaretle
  const markAllAsRead = async () => {
    try {
      await apiFetch('/api/activities/read-all', {
        method: 'PATCH',
        auth: true
      }, true);
      
      setActivities(prev => prev.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
      showToast('Tüm bildirimler okundu olarak işaretlendi', 'success');
    } catch (error) {
      console.error('Etkinlikler işaretlenirken hata:', error);
      showToast('Bildirimler işaretlenemedi', 'error');
    }
  };

  // Tüm etkinlikleri temizle
  const clearAllActivities = async () => {
    if (activities.length === 0) return;
    setShowClearActivitiesConfirm(true);
  };
  
  // Etkinlik temizlemeyi onayla
  const confirmClearActivities = async () => {
    setClearingActivities(true);
    try {
      await apiFetch('/account/activities', {
        method: 'DELETE',
        auth: true
      }, true);
      
      setActivities([]);
      setUnreadCount(0);
      setHasMoreActivities(false);
      showToast('Etkinlik geçmişi temizlendi', 'success');
      setShowClearActivitiesConfirm(false);
    } catch (error) {
      console.error('Etkinlikler temizlenirken hata:', error);
      showToast('Etkinlikler temizlenemedi', 'error');
    } finally {
      setClearingActivities(false);
    }
  };
  
  // Sonsuz kaydırma
  const handleActivityScroll = () => {
    if (!activityScrollRef.current || activitiesLoading || !hasMoreActivities) return;
    
    const { scrollTop, scrollHeight, clientHeight } = activityScrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      loadActivities(activitiesPage + 1);
    }
  };
  
  // Zaman formatla
  const formatActivityTime = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };
  
  // Etkinlik ikonu ve rengi
  const getActivityIcon = (type: ActivityItem['type']): { icon: React.ReactNode; color: string; bg: string } => {
    const icons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
      FILE_UPLOAD: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.15)'
      },
      FILE_DOWNLOAD: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>,
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.15)'
      },
      FILE_SHARE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>,
        color: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.15)'
      },
      FILE_SHARE_EXPIRED: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>,
        color: '#f97316',
        bg: 'rgba(249, 115, 22, 0.15)'
      },
      FILE_DELETE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)'
      },
      FILE_RENAME: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)'
      },
      FILE_RESTORE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>,
        color: '#06b6d4',
        bg: 'rgba(6, 182, 212, 0.15)'
      },
      FILE_MOVE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" /></svg>,
        color: '#64748b',
        bg: 'rgba(100, 116, 139, 0.15)'
      },
      FOLDER_CREATE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" /></svg>,
        color: '#ec4899',
        bg: 'rgba(236, 72, 153, 0.15)'
      },
      FOLDER_DELETE: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zM8 11a1 1 0 100 2h4a1 1 0 100-2H8z" clipRule="evenodd" /></svg>,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)'
      },
      TEAM_MEMBER_JOINED: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.15)'
      },
      TEAM_MEMBER_LEFT: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 100-2h-4a1 1 0 100 2h4z" /></svg>,
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)'
      },
      COMMENT_ADDED: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>,
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.15)'
      },
      PASSWORD_CHANGED: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)'
      },
      LOGIN: {
        icon: <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" /></svg>,
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.15)'
      }
    };
    return icons[type] || icons['FILE_UPLOAD'];
  };
  
  // Etkinlik mesajı
  const getActivityMessage = (type: ActivityItem['type']): string => {
    const messages: Record<string, string> = {
      FILE_UPLOAD: 'yükledi',
      FILE_DOWNLOAD: 'indirdi',
      FILE_SHARE: 'paylaştı',
      FILE_SHARE_EXPIRED: 'paylaşım süresi doldu',
      FILE_DELETE: 'sildi',
      FILE_RENAME: 'yeniden adlandırdı',
      FILE_RESTORE: 'geri yükledi',
      FILE_MOVE: 'taşıdı',
      FOLDER_CREATE: 'klasör oluşturdu',
      FOLDER_DELETE: 'klasör sildi',
      TEAM_MEMBER_JOINED: 'ekibe katıldı',
      TEAM_MEMBER_LEFT: 'ekipten ayrıldı',
      COMMENT_ADDED: 'yorum ekledi',
      PASSWORD_CHANGED: 'şifre değiştirdi',
      LOGIN: 'giriş yaptı'
    };
    return messages[type] || 'işlem yaptı';
  };
  
  // Panel açıldığında etkinlikleri yükle
  useEffect(() => {
    if (showActivityPanel && activities.length === 0) {
      loadActivities(1, true);
    }
  }, [showActivityPanel]);

  // Toast notification fonksiyonu
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    
    // 3 saniye sonra çıkış animasyonunu başlat
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t));
      // Animasyon bitince tamamen kaldır
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 3000);
  };

  // URL parametresini kontrol et (sayfa ilk yüklenirken)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const filterParam = urlParams.get('filter');
    const folderParam = urlParams.get('folder');
    
    // filter parametresini işle (Sidebar'dan gelen linkler için)
    if (filterParam === 'shared') {
      setShowShared(true);
      setShowFavorites(false);
      setShowTrash(false);
      setShowHidden(false);
      setCurrentFolder(null);
      setAnimateContent(false);
      setTimeout(() => setAnimateContent(true), 50);
      setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      // URL'den parametreyi temizle
      window.history.replaceState({}, '', '/files');
    } else if (filterParam === 'favorites') {
      setShowFavorites(true);
      setShowShared(false);
      setShowTrash(false);
      setShowHidden(false);
      setCurrentFolder(null);
      setAnimateContent(false);
      setTimeout(() => setAnimateContent(true), 50);
      setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      // URL'den parametreyi temizle
      window.history.replaceState({}, '', '/files');
    } else if (filterParam === 'trash') {
      setShowTrash(true);
      setShowFavorites(false);
      setShowShared(false);
      setShowHidden(false);
      setCurrentFolder(null);
      setAnimateContent(false);
      setTimeout(() => setAnimateContent(true), 50);
      setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      // URL'den parametreyi temizle
      window.history.replaceState({}, '', '/files');
    } else if (filterParam === 'hidden') {
      // Gizli dosyalar için PIN kontrolü yap
      const checkPinAndShowHidden = async () => {
        try {
          const pinCheck = await hasHiddenFilesPin();
          if (pinCheck?.hasPinSet) {
            // PIN ayarlanmış, doğrulama iste
            setHasPinSet(true);
            setPinModalOpen(true);
          } else {
            // PIN yok, PIN oluşturma modalı göster
            setHasPinSet(false);
            setPinModalOpen(true);
          }
        } catch (err) {
          console.error('PIN kontrolü hatası:', err);
        }
        // URL'den parametreyi temizle
        window.history.replaceState({}, '', '/files');
      };
      checkPinAndShowHidden();
    } else if (viewParam === 'trash') {
      setShowTrash(true);
      setShowFavorites(false);
      setShowShared(false);
      setShowHidden(false);
      setCurrentFolder(null);
      setAnimateContent(false);
      setTimeout(() => setAnimateContent(true), 50);
      setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      // URL'den parametreyi temizle
      window.history.replaceState({}, '', '/files');
    } else if (folderParam) {
      // Klasör parametresi varsa o klasörün bilgilerini al ve set et
      const fetchFolderAndNavigate = async () => {
        try {
          const data = await apiFetch(`/folders/${folderParam}`, {}, true);
          if (data && data.folder) {
            setCurrentFolder(data.folder);
            setShowTrash(false);
            setShowFavorites(false);
            setShowShared(false);
            setShowHidden(false);
            setAnimateContent(false);
            setTimeout(() => setAnimateContent(true), 50);
          }
        } catch (err) {
          console.error("Klasör bilgisi alınamadı:", err);
        }
        // URL'den parametreyi temizle
        window.history.replaceState({}, '', '/files');
      };
      fetchFolderAndNavigate();
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const stored = getStoredUser();
        if (!stored) { router.push("/login"); return; }
        setUser(stored);
        
        // localStorage'dan çöp kutusu otomatik silme tercihini oku
        const savedTrashDays = localStorage.getItem('autoDeleteTrashDays');
        if (savedTrashDays) {
          setAutoDeleteTrashDays(Number(savedTrashDays));
        }
        
        const meData = await apiFetch("/auth/me", {}, true);
        if (meData?.user) {
          setUser(meData.user);
          // Plan kontrolü - plan seçilmemişse plan seçme sayfasına yönlendir
          if (!meData.user.plan || meData.user.plan === null) {
            router.push("/select-plan");
            return;
          }
        }
        let filesData;
        // Eğer bir klasör içindeyken özel modlardaysak (favorites, trash, shared), 
        // o klasörün normal dosyalarını göster
        if (currentFolder && (showFavorites || showTrash || showShared)) {
          if (showTrash) {
            // Çöp kutusunda klasör içindeyken o klasördeki silinmiş dosyaları getir
            filesData = await listTrash(currentFolder.id);
          } else {
            // Klasör içindeyken normal dosyaları getir
            const params: string[] = [];
            params.push(`folderId=${encodeURIComponent(currentFolder.id)}`);
            if (searchTerm.trim()) params.push(`search=${encodeURIComponent(searchTerm.trim())}`);
            if (fileType) params.push(`type=${encodeURIComponent(fileType)}`);
            if (sortKey) params.push(`sort=${encodeURIComponent(sortKey)}`);
            if (sortOrder) params.push(`order=${encodeURIComponent(sortOrder)}`);
            const query = params.length ? `?${params.join("&")}` : "";
            filesData = await apiFetch(`/files${query}`, {}, true);
          }
        } else if (showTrash) {
          filesData = await listTrash();
        } else if (showFavorites) {
          filesData = await listFavorites();
        } else if (showShared) {
          filesData = await fetchSharedFiles();
          // Süresi dolmuş paylaşımları işaretle ama listeden çıkarma
          // Kullanıcı bunları görebilsin ve yenileyebilsin
        } else if (showHidden) {
          filesData = await listHiddenFiles(currentFolder?.id || null);
        } else {
          // Query param inşa
          const params: string[] = [];
          if (currentFolder) params.push(`folderId=${encodeURIComponent(currentFolder.id)}`);
          if (searchTerm.trim()) params.push(`search=${encodeURIComponent(searchTerm.trim())}`);
          if (fileType) params.push(`type=${encodeURIComponent(fileType)}`);
          if (sortKey) params.push(`sort=${encodeURIComponent(sortKey)}`);
          if (sortOrder) params.push(`order=${encodeURIComponent(sortOrder)}`);
          const query = params.length ? `?${params.join("&")}` : "";
          filesData = await apiFetch(`/files${query}`, {}, true);
        }
        if (Array.isArray(filesData)) setFiles(filesData);
        else if (filesData?.files) setFiles(filesData.files);
        
        // Cache'deki decrypt edilen dosya adlarını apply et
        if (typeof window !== 'undefined') {
          const cachedDecryptions = JSON.parse(sessionStorage.getItem('decrypted_filenames') || '{}');
          if (Object.keys(cachedDecryptions).length > 0) {
            setFiles(prevFiles => 
              prevFiles.map(file => {
                if (cachedDecryptions[file.id] && file.filename === 'encrypted') {
                  return { ...file, filename: cachedDecryptions[file.id] };
                }
                return file;
              })
            );
            console.log(`🔓 Cache'den ${Object.keys(cachedDecryptions).length} dosya adı yüklendi`);
          }
        }
        
        // Folders state güncelleme
        if (filesData?.folders) {
          setFolders(filesData.folders);
        } else if ((showTrash || showFavorites || showShared) && !currentFolder) {
          // Ana dizindeyken klasörler varsa göster, yoksa temizle
          setFolders(filesData?.folders || []);
        } else if (currentFolder) {
          // Klasör içindeyken alt klasörleri göster (varsa)
          setFolders(filesData?.folders || []);
        } else {
          setFolders([]);
        }
        
        if (filesData?.usage) {
          console.log("Setting usage from filesData:", filesData.usage);
          setUsage({
            usedStorageBytes: filesData.usage.usedStorageBytes,
            storageLimitBytes: filesData.usage.storageLimitBytes,
            trashStorageBytes: filesData.usage.trashStorageBytes,
            trashLimitBytes: filesData.usage.trashLimitBytes,
            plan: filesData.usage.plan
          });
        }
        try {
          const acc = await getAccountStorage();
          if (acc) {
            console.log("Storage info from backend:", acc);
            console.log("Category bytes:", acc.categoryBytes);
            console.log("Hidden files:", acc.hiddenFilesCount, acc.hiddenFilesBytes);
            setStorageInfo(acc);
            setSelectedPlan(acc.plan);
          }
        } catch {}
        // TÜM dosyaları çek (grafikte kullanmak için - her zaman güncel tutmak için)
        if (!showTrash && !showFavorites && !showShared) {
          try {
            const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
            if (allFilesData?.files) {
              setAllUserFiles(allFilesData.files);
            }
          } catch (e) {
            console.error('Failed to fetch all files for storage graph:', e);
          }
        }
        
        // Depolama alanı uyarısı - %90 üzeri
        if (filesData?.usage) {
          const usedBytes = filesData.usage.usedStorageBytes || 0;
          const limitBytes = filesData.usage.storageLimitBytes || 1;
          const usagePercent = (usedBytes / limitBytes) * 100;
          
          if (usagePercent >= 95) {
            setShowStorageFullWarning(true);
          } else if (usagePercent >= 90) {
            showToast(
              `Depolama alanınızın %${usagePercent.toFixed(0)}'i dolu.`,
              'error'
            );
          }
        }
      } catch (err: any) {
        console.error(err);
        if (err?.message === "UNAUTHORIZED") {
          clearAuth(); router.push("/login");
        } else {
          showToast(err?.message || "Dosyalar alınırken bir hata oluştu", 'error');
        }
      } finally { setLoading(false); }
    }
    load();
  }, [router, refreshFlag, currentFolder, showTrash, showFavorites, showShared, showHidden, showHidden, searchTerm, fileType, sortKey, sortOrder]);
  
  // WebSocket event listener'ları
  useEffect(() => {
    if (!isConnected) return;
    
    console.log('✅ WebSocket bağlandı - event listener\'lar kuruluyor');
    
    // Tüm sync event'lerini dinle
    const unsubscribe = on('*', (event) => {
      console.log('📥 Sync event alındı:', event);
      
      // Dosya/klasör değişiklikleri olduğunda refresh et
      if (event.type.startsWith('file:') || event.type.startsWith('folder:')) {
        console.log('🔄 Dosya/klasör değişikliği - sayfayı yeniliyorum');
        setRefreshFlag(f => f + 1);
      }
      
      // Depolama güncellemelerini direkt uygula
      if (event.type === 'storage:updated') {
        console.log('💾 Depolama bilgisi güncelleniyor');
        setUsage(event.data);
      }
      
      // Başarı bildirimi göster
      const messages: Record<string, string> = {
        'file:uploaded': 'Dosya yüklendi',
        'file:deleted': 'Dosya silindi',
        'file:renamed': 'Dosya yeniden adlandırıldı',
        'file:restored': 'Dosya geri yüklendi',
        'file:moved': 'Dosya taşındı',
        'folder:created': 'Klasör oluşturuldu',
        'folder:deleted': 'Klasör silindi',
        'folder:renamed': 'Klasör yeniden adlandırıldı',
      };
      
      if (messages[event.type]) {
        showToast(messages[event.type], 'success');
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [isConnected, on]);
  
  function formatPercent(a: number, total: number) {
    if (!total) return 0;
    return Math.min(100, Math.round((a / total) * 100));
  }
  async function handlePlanSave() {
    if (!selectedPlan || planUpdating) return;
    setPlanUpdating(true);
    try {
      const resp = await updatePlan(selectedPlan);
      if (resp) {
        showToast("Plan güncellendi.", 'success');
        const acc = await getAccountStorage();
        if (acc) setStorageInfo(acc);
        setRefreshFlag(f=>f+1);
      }
    } catch (err:any) { showToast(err.message || "Plan güncellenemedi", 'error'); }
    finally { setPlanUpdating(false); }
  }
  async function handleEmptyTrash() {
    // Çöp kutusunda dosya veya klasör var mı kontrol et
    if (files.length === 0 && folders.length === 0) {
      showToast("Çöp kutusu zaten boş.", 'error');
      setShowEmptyTrashConfirm(false);
      return;
    }

    setEmptyingTrash(true);
    try {
      const resp = await emptyTrash();
      if (resp?.usage) {
        setUsage({
          usedStorageBytes: resp.usage.usedStorageBytes,
          storageLimitBytes: resp.usage.storageLimitBytes,
          trashStorageBytes: resp.usage.trashStorageBytes || 0,
          trashLimitBytes: resp.usage.trashLimitBytes || 0,
          plan: resp.usage.plan
        });
      }
      const acc = await getAccountStorage();
      if (acc) setStorageInfo(acc);
      showToast("Çöp kutusu boşaltıldı.", 'success');
      setRefreshFlag(f=>f+1);
    } catch (err:any) { showToast(err.message || "Çöp kutusu boşaltılamadı", 'error'); }
    finally {
      setEmptyingTrash(false);
      setShowEmptyTrashConfirm(false);
    }
  }

  // Arama debounce (300ms)
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchTerm(prev => prev); // immediate no change; use debounce below
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchTerm(value);
      setRefreshFlag(f=>f+1);
    }, 300);
  }

  function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Depolama alanı kontrolü
    if (usage) {
      const usedBytes = usage.usedStorageBytes || 0;
      const limitBytes = usage.storageLimitBytes || 1;
      const availableBytes = limitBytes - usedBytes;
      
      // Eğer dosya boyutu kullanılabilir alandan büyükse
      if (file.size > availableBytes) {
        const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
        const limitGB = (limitBytes / (1024 * 1024 * 1024)).toFixed(2);
        const fileSize = (file.size / (1024 * 1024)).toFixed(2);
        showToast(
          `Depolama alanınız dolu! Kullanılan: ${usedGB} GB / ${limitGB} GB. Dosya boyutu: ${fileSize} MB`, 
          'error'
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      
      // Eğer %95'ten fazla doluysa uyarı ver
      const usagePercent = (usedBytes / limitBytes) * 100;
      if (usagePercent > 95) {
        showToast(
          `Uyarı: Depolama alanınızın %${usagePercent.toFixed(0)}'i dolu!`, 
          'error'
        );
      }
    }
    
    // Aynı isimli dosya var mı kontrol et
    const existingFile = files.find(f => 
      f.filename === file.name && 
      !f.isDeleted && 
      f.folderId === (currentFolder?.id || null)
    );
    
    if (existingFile) {
      // Aynı dosya var, kullanıcıya sor
      setDuplicateFileWarning({ file, existingFile });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      // Büyük dosya uyarısını kontrol et
      const warnLargeFiles = localStorage.getItem('warnLargeFiles') !== 'false';
      const LARGE_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
      
      if (warnLargeFiles && file.size > LARGE_FILE_SIZE) {
        const confirmUpload = confirm(
          `Bu dosya ${(file.size / (1024 * 1024)).toFixed(1)} MB boyutunda.\n\n` +
          `Büyük dosyalar yüklenirken daha fazla zaman alabilir ve kotanızı hızlıca doldurabilir.\n\n` +
          `Yüklemeye devam etmek istiyor musunuz?`
        );
        
        if (!confirmUpload) {
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }
      
      setPendingFile(file);
    }
  }

  function cancelPendingFile() {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Güvenlik oturumu sona erdi modal state
  const [showSecurityExpiredModal, setShowSecurityExpiredModal] = useState(false);
  
  // Dosya yükleme - zorunlu şifreleme (master key gerekli)
  async function confirmUpload() {
    if (!pendingFile) return;
    
    // Master key kontrolü - yoksa yüklemeyi engelle
    // hasMasterKey() ile gerçek zamanlı kontrol
    if (!hasMasterKey()) {
      // Şifre modalını göster
      setPendingAction({ type: 'upload' });
      setShowPasswordModal(true);
      return;
    }
    
    setUploading(true);
    
    try {
      // Token'ı al
      const token = typeof window !== 'undefined' 
        ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
        : null;
      
      if (!token) {
        showToast("Oturum bulunamadı", 'error');
        setUploading(false);
        return;
      }
      
      // Şifreli yükle (zorunlu)
      setIsEncrypting(true);
      try {
        const masterKey = getMasterKey();
        console.log("🔐 Şifreli upload başlatılıyor...");
        
        const fileId = await encryptAndUploadWithKey(pendingFile, masterKey, token, currentFolder?.id || null, showHidden);
        console.log("✅ Şifreli upload tamamlandı, fileId:", fileId);
        showToast(showHidden ? "Dosya gizli olarak yüklendi 🔐" : "Dosya şifrelenerek yüklendi 🔐", 'success');
      } catch (err: any) {
        console.error("Encrypted upload error:", err);
        showToast(err.message || "Şifreli yükleme başarısız", 'error');
        setIsEncrypting(false);
        setUploading(false);
        return;
      }
      setIsEncrypting(false)
      
      // Storage bilgisini güncelle
      try {
        const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
        if (allFilesData?.files) {
          setAllUserFiles(allFilesData.files);
        }
        const acc = await getAccountStorage();
        if (acc) {
          console.log("Storage info updated after upload:", acc);
          setStorageInfo(acc);
          setUsage({
            usedStorageBytes: acc.usedStorageBytes,
            storageLimitBytes: acc.storageLimitBytes,
            trashStorageBytes: acc.trashStorageBytes || 0,
            trashLimitBytes: acc.trashLimitBytes || 0,
            plan: acc.plan
          });
        }
      } catch (e) {
        console.error('Failed to refresh storage graph:', e);
      }
      
      setRefreshFlag((f) => f + 1);
      cancelPendingFile();
      
    } catch (err: any) {
      console.error("Upload error:", err);
      showToast(err.message || "Yükleme başarısız", 'error');
    } finally {
      setUploading(false);
    }
  }

  function openDelete(file: FileItem) { setDeleteTarget(file); }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setFileActionLoading((m) => ({ ...m, [id]: { ...(m[id]||{}), delete: true } }));
    try {
      const data = await deleteFileApi(id);
      if (data?.usage) {
        setUsage({
          usedStorageBytes: data.usage.usedStorageBytes,
          storageLimitBytes: data.usage.storageLimitBytes,
          trashStorageBytes: data.usage.trashStorageBytes || 0,
          trashLimitBytes: data.usage.trashLimitBytes || 0,
          plan: data.usage.plan
        });
      }
      setRefreshFlag((f) => f + 1);
      showToast("Dosya silindi", 'success');
      // Grafiği güncellemek için tüm dosyaları ve storage bilgisini yeniden çek
      try {
        const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
        if (allFilesData?.files) {
          setAllUserFiles(allFilesData.files);
        }
        const acc = await getAccountStorage();
        if (acc) {
          console.log("Storage info updated after delete:", acc);
          setStorageInfo(acc);
        }
      } catch (e) {
        console.error('Failed to refresh storage graph:', e);
      }
      setDeleteTarget(null);
    } catch (err:any) {
      console.error(err);
      showToast(err.message || "Dosya silinemedi", 'error');
    } finally {
      setFileActionLoading((m) => ({ ...m, [id]: { ...(m[id]||{}), delete: false } }));
    }
  }

  function handleOpenFolder(folder: FolderItem) { 
    setCurrentFolder(folder);
  }
  function handleGoRoot() { setCurrentFolder(null); }
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    try {
      const body = { 
        name: newFolderName.trim(), 
        parentId: currentFolder?.id,
        isHidden: showHidden // Gizli bölümde ise true
      };
      const data = await apiFetch("/files/folders", { method: "POST", body: JSON.stringify(body) }, true);
      if (data?.folder) setFolders((prev) => [data.folder, ...prev]);
      setNewFolderName(""); setCreatingFolder(false);
    } catch (err: any) { alert(err.message || "Klasör oluşturulamadı"); }
  }
  function openRename(file: FileItem) {
    setRenameTarget(file);
    setRenameValue(file.filename);
  }
  function openFolderRename(folder: FolderItem) {
    setFolderRenameTarget(folder);
    setFolderRenameValue(folder.name);
  }
  async function confirmFolderRename() {
    if (!folderRenameTarget) return;
    try {
      const data = await updateFolder(folderRenameTarget.id, folderRenameValue.trim());
      if (data?.folder) {
        setFolders(prev => prev.map(f => f.id === data.folder.id ? data.folder : f));
        if (currentFolder && currentFolder.id === data.folder.id) setCurrentFolder(data.folder);
      }
      showToast("Klasör adı güncellendi", 'success');
      setFolderRenameTarget(null);
    } catch (err:any) {
      console.error(err); showToast(err.message || "Klasör adı güncellenemedi", 'error');
    }
  }
  function openFolderDelete(folder: FolderItem) {
    setFolderDeleteTarget(folder);
  }
  async function confirmFolderDelete() {
    if (!folderDeleteTarget) return;
    try {
      const data = await deleteFolder(folderDeleteTarget.id);
      setFolders(prev => prev.filter(f => f.id !== folderDeleteTarget.id));
      if (currentFolder && currentFolder.id === folderDeleteTarget.id) setCurrentFolder(null);
      showToast("Klasör çöp kutusuna taşındı", 'success');
      setFolderDeleteTarget(null);
      setRefreshFlag(f=>f+1);
      if (data?.usage) {
        setUsage({
          usedStorageBytes: data.usage.usedStorageBytes,
          storageLimitBytes: data.usage.storageLimitBytes,
          trashStorageBytes: data.usage.trashStorageBytes || 0,
          trashLimitBytes: data.usage.trashLimitBytes || 0,
          plan: data.usage.plan
        });
      }
      // Storage bilgisini güncelle
      const acc = await getAccountStorage();
      if (acc) {
        console.log("Storage info updated after folder delete:", acc);
        setStorageInfo(acc);
      }
    } catch (err:any) {
      console.error(err); showToast(err.message || "Klasör silinemedi", 'error');
    }
  }

  // Klasör paylaşma
  function openFolderShare(folder: FolderItem) {
    setFolderShareTarget(folder);
    setFolderShareLink(null);
    setFolderShareExpiry("1d");
    setFolderSharePermission("DOWNLOAD");
  }
  
  async function generateFolderShareLink() {
    if (!folderShareTarget || folderShareGenerating) return;
    setFolderShareGenerating(true);
    try {
      const data = await shareFolder(folderShareTarget.id, folderShareExpiry, folderSharePermission);
      if (data?.shareUrl) {
        setFolderShareLink(data.shareUrl);
        showToast(`${data.fileCount} dosya paylaşıldı`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Klasör paylaşılamadı", 'error');
    } finally {
      setFolderShareGenerating(false);
    }
  }
  
  // Ekiple paylaş modalını aç
  async function openTeamShare(file: FileItem) {
    setTeamShareTarget(file);
    setSelectedTeamId("");
    try {
      const response = await listMyTeams();
      // API {owned: [], member: []} formatında döner, birleştir
      const allTeams = [
        ...(response.owned || []),
        ...(response.member || [])
      ];
      // Sadece düzenleme yetkisi olan ekipleri göster
      const editableTeams = allTeams.filter((t: any) => 
        t.role === 'OWNER' || t.role === 'ADMIN' || t.role === 'EDITOR'
      );
      setUserTeams(editableTeams);
    } catch (err: any) {
      console.error(err);
      setUserTeams([]);
    }
  }
  
  // Ekiple paylaş işlemi
  async function handleShareWithTeam() {
    if (!teamShareTarget || !selectedTeamId || teamShareLoading) return;
    setTeamShareLoading(true);
    try {
      let encryptionData: { teamDek: string; teamDekIv: string } | undefined;
      
      // Şifreli dosya ise DEK'i çöz ve ekip için hazırla
      if (teamShareTarget.isEncrypted && teamShareTarget.edek && teamShareTarget.edekIv) {
        const masterKey = await getMasterKey();
        if (masterKey) {
          const edekBytes = b64ToU8(teamShareTarget.edek);
          const edekIvBytes = b64ToU8(teamShareTarget.edekIv);
          
          // EDEK'i çöz -> plain DEK
          const plainDek = await aesGcmDecrypt(edekBytes, masterKey, edekIvBytes);
          
          // teamDek olarak base64 encode et (sunucuda saklanacak)
          encryptionData = {
            teamDek: u8ToB64(plainDek),
            teamDekIv: teamShareTarget.cipherIv || ''
          };
        }
      }
      
      await shareFileWithTeam(teamShareTarget.id, selectedTeamId, encryptionData);
      showToast("Dosya ekiple paylaşıldı", 'success');
      setTeamShareTarget(null);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Dosya ekiple paylaşılamadı", 'error');
    } finally {
      setTeamShareLoading(false);
    }
  }
  
  // tagTarget set edildiğinde openTagEdit fonksiyonunu çağır
  // versionsTarget set edildiğinde loadVersions fonksiyonunu çağır
  useEffect(() => {
    if (versionsTarget) {
      setVersionsList([]);
      setVersionLoading(true);
      loadVersions(versionsTarget.id);
    }
  }, [versionsTarget]);

  async function confirmRename() {
    if (!renameTarget) return;
    setFileActionLoading((m) => ({ ...m, [renameTarget.id]: { ...(m[renameTarget.id]||{}), rename: true } }));
    try {
      const data = await renameFile(renameTarget.id, renameValue.trim());
      if (data?.file) setFiles((prev) => prev.map((f) => f.id === data.file.id ? data.file : f));
      showToast("Dosya adı güncellendi", 'success');
      setRenameTarget(null);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Yeniden adlandırma başarısız", 'error');
    } finally {
      setFileActionLoading((m) => ({ ...m, [renameTarget.id]: { ...(m[renameTarget.id]||{}), rename: false } }));
    }
  }
  function openShare(file: FileItem) {
    setShareTarget(file);
    setShareModalLink(null);
    setShareStats(null);
    setUnsharing(false);
    setShareStatsLoading(false);
    setShareExpiryMode("hours"); // Varsayılan mod
    setShareExpiryDate("");
    setShareExpiryTime("");
    
    // Eğer dosya zaten paylaşılmışsa mevcut bilgileri yükle
    if (file.shareToken) {
      // Şifreli dosyalar için DEK fragment'lı frontend URL'i oluştur
      (async () => {
        try {
          console.log("🔐 openShare: Şifreli dosya kontrolü", {
            isEncrypted: file.isEncrypted,
            hasEdek: !!file.edek,
            hasEdekIv: !!file.edekIv,
            edekLength: file.edek?.length,
            edekIvLength: file.edekIv?.length
          });
          
          if (file.isEncrypted && file.edek && file.edekIv) {
            const masterKey = getMasterKey();
            console.log("🔑 Master key durumu:", !!masterKey, masterKey?.length);
            
            if (masterKey) {
              // EDEK'i master key ile çözerek plain DEK elde et
              const edekBytes = b64ToU8(file.edek);
              const edekIvBytes = b64ToU8(file.edekIv);
              console.log("📦 Decrypt parametreleri:", {
                masterKeyLen: masterKey.length,
                edekIvLen: edekIvBytes.length,
                edekLen: edekBytes.length
              });
              
              // Sıra: aesGcmDecrypt(key, iv, ciphertext)
              const plainDek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);
              const plainDekB64 = u8ToB64(plainDek);
              console.log("✅ DEK başarıyla çözüldü, uzunluk:", plainDekB64.length);
              
              // Format: #dek=plainDek.cipherIv.metaNameEnc.metaNameIv
              const encFragment = [
                plainDekB64,
                file.cipherIv || '',
                file.metaNameEnc || '',
                file.metaNameIv || ''
              ].map(v => encodeURIComponent(v || '')).join('.');
              
              const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
              const fullUrl = `${frontendUrl}/share/${file.shareToken}#dek=${encFragment}`;
              setShareModalLink(fullUrl);
            } else {
              // Master key yoksa sadece frontend URL'i göster (DEK olmadan)
              const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
              setShareModalLink(`${frontendUrl}/share/${file.shareToken}`);
            }
          } else {
            // Şifresiz dosya - frontend URL'i yeterli
            const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
            setShareModalLink(`${frontendUrl}/share/${file.shareToken}`);
          }
        } catch (e) {
          console.error("DEK decrypt error:", e);
          // Hata durumunda basit URL göster
          const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
          setShareModalLink(`${frontendUrl}/share/${file.shareToken}`);
        }
      })();
      
      // Mevcut izin ve süreyi ayarla
      setSharePermission(file.sharePermission || "DOWNLOAD");
      
      // Süre hesaplama - kalan saati göster
      if (file.shareExpiresAt) {
        const now = new Date();
        const expiry = new Date(file.shareExpiresAt);
        const diffMs = expiry.getTime() - now.getTime();
        const diffHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
        setShareExpiry(String(diffHours));
        // Tarih/saat modunu da doldur
        setShareExpiryDate(expiry.toISOString().split('T')[0]);
        setShareExpiryTime(expiry.toTimeString().slice(0, 5));
      } else {
        setShareExpiry("unlimited");
      }
      
      setShareInfo({ 
        permission: file.sharePermission || "DOWNLOAD", 
        expiresAt: file.shareExpiresAt || null 
      });
      
      // İstatistikleri yükle
      (async () => {
        try {
          setShareStatsLoading(true);
          const data = await getShareStats(file.id);
          setShareStats(data);
        } catch (e) {
          // ignore if no stats yet or not shared
        } finally { setShareStatsLoading(false); }
      })();
    } else {
      // Yeni paylaşım - default değerler
      setShareExpiry("24");
      setSharePermission("DOWNLOAD");
      setShareInfo(null);
    }
  }
  async function handleConfirmStopShare() {
    if (!shareTarget) return;
    try {
      setIsStoppingShare(true);
      const resp = await apiFetch(`/files/${shareTarget.id}/unshare`, { method: "POST" }, true);
      if (resp?.file) {
        showToast("Paylaşım kapatıldı", 'success');
        setRefreshFlag(f => f + 1);
        // Modal ve state'leri temizle
        setShowStopConfirm(false);
        setShareTarget(null);
        setShareModalLink(null);
        setShareInfo(null);
        setShareStats(null);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Paylaşım kapatılırken bir hata oluştu", 'error');
    } finally {
      setIsStoppingShare(false);
    }
  }
  
  // Mevcut paylaşımın iznini güncelle (yeni link oluşturmaz)
  async function handlePermissionChange(newPermission: "VIEW" | "DOWNLOAD" | "EDIT") {
    if (!shareTarget || !shareTarget.shareToken) return;
    
    // Sadece mevcut paylaşımlar için API çağrısı yap
    try {
      const data = await updateShare(shareTarget.id, { permission: newPermission });
      setSharePermission(newPermission);
      setShareInfo({ 
        permission: newPermission, 
        expiresAt: data.share.expiresAt 
      });
      
      // files listesini güncelle
      setFiles((prev) => prev.map((f) => 
        f.id === shareTarget.id ? { ...f, sharePermission: newPermission } : f
      ));
      
      showToast(`İzin "${newPermission === 'VIEW' ? 'Sadece Görüntüleme' : newPermission === 'DOWNLOAD' ? 'Görüntüleme ve İndirme' : 'Tüm İzinler'}" olarak güncellendi`, 'success');
    } catch (err: any) {
      console.error("Permission update error:", err);
      showToast(err.message || "İzin güncellenemedi", 'error');
    }
  }
  
  async function generateShareLink() {
    if (!shareTarget || shareGenerating) return;
    setShareGenerating(true);
    try {
      // Tarih modunda süreyi hesapla, saat modunda direkt kullan
      let expiresIn: string | number = shareExpiry;
      if (shareExpiryMode === "datetime" && shareExpiryDate) {
        const expireDateTime = new Date(`${shareExpiryDate}T${shareExpiryTime || '23:59'}`);
        const now = new Date();
        const diffMs = expireDateTime.getTime() - now.getTime();
        if (diffMs <= 0) {
          showToast("Geçerlilik tarihi geçmişte olamaz", 'error');
          setShareGenerating(false);
          return;
        }
        // Saate çevir
        expiresIn = String(Math.ceil(diffMs / (1000 * 60 * 60)));
      }
      
      const body: any = { expiresIn, permission: sharePermission };
      const data = await shareFile(shareTarget.id, body);
      if (data?.shareUrl) {
        let finalShareUrl = data.shareUrl;
        
        // Şifreli dosya için DEK'i URL fragment olarak ekle
        if (data.encryptionInfo?.isEncrypted && data.encryptionInfo.edek) {
          try {
            // Master key ile DEK'i çöz
            const masterKey = getMasterKey();
            if (!masterKey) {
              showToast("Şifreli dosya paylaşımı için oturum açmanız gerekir", 'error');
              setShareGenerating(false);
              return;
            }
            
            // EDEK'i master key ile çözerek plain DEK elde et
            const edekBytes = b64ToU8(data.encryptionInfo.edek!);
            const edekIvBytes = b64ToU8(data.encryptionInfo.edekIv!);
            const plainDek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);
            const plainDekB64 = u8ToB64(plainDek);
            
            // Format: #dek=plainDek.cipherIv.metaNameEnc.metaNameIv
            // Plain DEK paylaşılıyor (EDEK değil) - alıcı direkt dosyayı çözebilir
            const encFragment = [
              plainDekB64,
              data.encryptionInfo.cipherIv,
              data.encryptionInfo.metaNameEnc,
              data.encryptionInfo.metaNameIv
            ].map(v => encodeURIComponent(v || '')).join('.');
            
            // Frontend share sayfasına yönlendir (backend değil)
            const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
            const token = data.shareUrl.split('/share/')[1];
            finalShareUrl = `${frontendUrl}/share/${token}#dek=${encFragment}`;
            
            showToast("🔐 Şifreli dosya paylaşım linki oluşturuldu", 'success');
          } catch (err) {
            console.error("DEK decryption error:", err);
            showToast("Şifreleme anahtarı çözülemedi", 'error');
            setShareGenerating(false);
            return;
          }
        } else {
          showToast(shareTarget.shareToken ? "Paylaşım güncellendi" : "Paylaşım linki oluşturuldu", 'success');
        }
        
        setShareModalLink(finalShareUrl);
        setShareInfo(data.share || null);
        
        // Dosya listesini yenile
        setRefreshFlag(f => f + 1);
        
        // update stats after creating link
        try {
          setShareStatsLoading(true);
          const stats = await getShareStats(shareTarget.id);
          setShareStats(stats);
        } catch (e) {
          // ignore
        } finally { setShareStatsLoading(false); }
      }
    } catch (err:any) {
      console.error(err);
      showToast(err.message || "Paylaşım linki oluşturulamadı", 'error');
    } finally {
      setShareGenerating(false);
    }
  }
  function openVersions(file: FileItem) {
    setVersionTarget(file);
    setVersionsList([]);
    loadVersions(file.id);
  }
  async function loadVersions(id: string) {
    setVersionLoading(true);
    try {
      const data = await listVersions(id);
      if (data?.versions) {
        // Sürümleri tarihe göre sırala - en yeni önce (desc)
        const sortedVersions = [...data.versions].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setVersionsList(sortedVersions);
      }
      // Güncel dosya bilgisini döndür (state'i doğrudan güncelleme)
      return data?.file || null;
    } catch (err:any) { 
      console.error(err); 
      showToast(err.message || "Versiyonlar alınamadı", 'error');
      return null;
    } finally { 
      setVersionLoading(false); 
    }
  }
  async function doRestoreVersion(version: number) {
    const targetFile = versionTarget || versionsTarget;
    if (!targetFile) return;
    try {
      await restoreVersion(targetFile.id, version);
      showToast("Sürüm geri yüklendi", 'success');
      
      // Sürümleri yeniden yükle ve dosya bilgisini güncelle (modal açıksa)
      if (versionsTarget) {
        const updatedFile = await loadVersions(targetFile.id);
        if (updatedFile) {
          setVersionsTarget(updatedFile);
        }
      } else {
        setVersionTarget(null);
      }
      
      // Dosya listesini güncelle
      setRefreshFlag(f=>f+1);
    } catch (err:any) { console.error(err); showToast(err.message || "Sürüm geri yüklenemedi", 'error'); }
  }
  
  async function doDeleteVersion(versionId: number) {
    const targetFile = versionTarget || versionsTarget;
    if (!targetFile) return;
    try {
      await deleteVersion(targetFile.id, versionId);
      showToast("Sürüm silindi", 'success');
      setDeleteVersionConfirm(null);
      // Versiyonları yeniden yükle
      loadVersions(targetFile.id);
    } catch (err:any) { console.error(err); showToast(err.message || "Sürüm silinemedi", 'error'); }
  }
  
  async function toggleFavorite(file: FileItem) {
    try {
      const desired = !file.isFavorite;
      const data = await toggleFavoriteFile(file.id, desired);
      if (data?.file) setFiles(prev=>prev.map(f=>f.id===file.id ? { ...f, isFavorite: data.file.isFavorite } : f));
    } catch (err:any) { console.error(err); showToast(err.message || "Favori güncellenemedi", 'error'); }
  }
  async function handleToggleFavorite(file: FileItem) {
    return toggleFavorite(file);
  }
  async function doRestoreFromTrash(file: FileItem) {
    try {
      const data = await restoreFile(file.id);
      
      // Usage bilgisini güncelle (varsa)
      if (data?.usage) {
        setUsage({
          usedStorageBytes: data.usage.usedStorageBytes,
          storageLimitBytes: data.usage.storageLimitBytes,
          trashStorageBytes: data.usage.trashStorageBytes || 0,
          trashLimitBytes: data.usage.trashLimitBytes || 0,
          plan: data.usage.plan
        });
      }
      
      // Grafiği güncellemek için tüm dosyaları ve storage bilgisini yeniden çek
      const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
      if (allFilesData?.files) {
        setAllUserFiles(allFilesData.files);
      }
      const acc = await getAccountStorage();
      if (acc) {
        console.log("Storage info updated after restore:", acc);
        setStorageInfo(acc);
      }
      
      showToast("Dosya geri yüklendi", 'success');
      setRefreshFlag(f=>f+1);
    } catch (err:any) { 
      console.error(err); 
      showToast(err.message || "Geri yükleme başarısız", 'error'); 
    }
  }
  function openPermanentDelete(file: FileItem) { setPermanentDeleteTarget(file); }
  async function confirmPermanentDeleteFolder() {
    if (!permanentDeleteFolderTarget) return;
    try {
      await permanentDeleteFolder(permanentDeleteFolderTarget.id);
      showToast("Klasör kalıcı olarak silindi", 'success');
      setPermanentDeleteFolderTarget(null);
      setRefreshFlag(f => f + 1);
      // Storage bilgisini güncelle
      const acc = await getAccountStorage();
      if (acc) {
        console.log("Storage info updated after folder permanent delete:", acc);
        setStorageInfo(acc);
      }
    } catch (err: any) {
      showToast(err.message || "Klasör silinemedi", 'error');
    }
  }
  async function confirmPermanentDelete() {
    if (!permanentDeleteTarget) return;
    try {
      const data = await permanentDeleteFile(permanentDeleteTarget.id);
      
      // Usage bilgisini güncelle (varsa)
      if (data?.usage) {
        setUsage({
          usedStorageBytes: data.usage.usedStorageBytes,
          storageLimitBytes: data.usage.storageLimitBytes,
          trashStorageBytes: data.usage.trashStorageBytes || 0,
          trashLimitBytes: data.usage.trashLimitBytes || 0,
          plan: data.usage.plan
        });
      }
      
      // Grafiği güncellemek için tüm dosyaları ve storage bilgisini yeniden çek
      const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
      if (allFilesData?.files) {
        setAllUserFiles(allFilesData.files);
      }
      const acc = await getAccountStorage();
      if (acc) {
        console.log("Storage info updated after permanent delete:", acc);
        setStorageInfo(acc);
      }
      
      showToast("Kalıcı olarak silindi", 'success');
      setPermanentDeleteTarget(null);
      setRefreshFlag(f=>f+1);
    } catch (err:any) { 
      console.error(err); 
      showToast(err.message || "Kalıcı silme başarısız", 'error'); 
    }
  }
  function formatDate(d: string) { return new Date(d).toLocaleString("tr-TR"); }
  function formatSize(bytes: number) {
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
  }
  function formatSizeFull(bytes: number) {
    const mb = 1024 * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return (bytes / gb).toFixed(1) + " GB";
    if (bytes >= mb) return (bytes / mb).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
  }
  
  // Grafik için kompakt format - sayı ve birim ayrı
  function formatSizeCompact(bytes: number): { value: string; unit: string } {
    if (bytes === 0) return { value: '0', unit: 'B' };
    const mb = 1024 * 1024;
    const gb = mb * 1024;
    const tb = gb * 1024;
    if (bytes >= tb) return { value: (bytes / tb).toFixed(2), unit: 'TB' };
    if (bytes >= gb) return { value: (bytes / gb).toFixed(2), unit: 'GB' };
    if (bytes >= mb) return { value: (bytes / mb).toFixed(2), unit: 'MB' };
    if (bytes >= 1024) return { value: (bytes / 1024).toFixed(2), unit: 'KB' };
    return { value: bytes.toString(), unit: 'B' };
  }
  function handleLogout() { 
    // Şifreleme anahtarını memory'den temizle
    try {
      clearMasterKey();
      console.log("🗑️ Şifreleme anahtarı temizlendi");
    } catch (e) {
      // ignore
    }
    
    // Cache'i sil
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('decrypted_filenames');
    }
    
    clearAuth(); 
    router.push("/login"); 
  }

  // Paylaşım süresini hesaplayan helper fonksiyon
  function getShareTimeRemaining(expiresAt: string | null): { text: string; expired: boolean; percentage: number } {
    if (!expiresAt) return { text: 'Süresiz', expired: false, percentage: 100 };
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'Süresi doldu', expired: true, percentage: 0 };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Orijinal süreyi tahmin et (genellikle 1h, 1d, 7d, unlimited)
    const totalHours = diff / (1000 * 60 * 60);
    let originalHours = 24; // default 1 gün
    if (totalHours <= 1) originalHours = 1;
    else if (totalHours <= 24) originalHours = 24;
    else if (totalHours <= 168) originalHours = 168; // 7 gün
    
    const percentage = Math.min(100, (totalHours / originalHours) * 100);
    
    if (days > 0) return { text: `${days} gün ${hours} saat`, expired: false, percentage };
    if (hours > 0) return { text: `${hours} saat ${minutes} dakika`, expired: false, percentage };
    return { text: `${minutes} dakika`, expired: false, percentage };
  }

  // Şifre doğrulama ve master key oluşturma
  async function handlePasswordSubmit() {
    if (!passwordInput.trim()) {
      setPasswordError("Şifre gerekli");
      return;
    }
    
    setPasswordLoading(true);
    setPasswordError("");
    
    try {
      const token = typeof window !== 'undefined' 
        ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
        : null;
      
      if (!token) {
        setPasswordError("Oturum bulunamadı");
        setPasswordLoading(false);
        return;
      }
      
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5001";
      
      // Get KDF parameters from backend
      const initRes = await fetch(`${baseUrl}/api/crypto/init`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!initRes.ok) {
        setPasswordError("KDF bilgileri alınamadı");
        setPasswordLoading(false);
        return;
      }
      
      const { kdfSalt, kdfParams: kdfParamsRaw } = await initRes.json();
      
      // Parse kdfParams if it's a string
      const kdfParams = typeof kdfParamsRaw === 'string' ? JSON.parse(kdfParamsRaw) : kdfParamsRaw;
      console.log("📥 KDF params:", kdfParams);
      
      // Initialize master key
      await initializeMasterKey(passwordInput, kdfSalt, kdfParams);
      
      setHasEncryptionKey(true);
      setShowPasswordModal(false);
      setPasswordInput("");
      
      showToast("Şifreleme anahtarı hazır 🔓", "success");
      
      // Execute pending action
      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        
        if (action.type === 'view' && action.file) {
          handleView(action.file);
        } else if (action.type === 'download' && action.file) {
          handleDownload(action.file);
        } else if (action.type === 'upload') {
          confirmUpload();
        }
      }
      
    } catch (err: any) {
      console.error("Password verification error:", err);
      setPasswordError(err.message || "Şifre doğrulanamadı");
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDownload(file: FileItem) {
    setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: true } }));
    
    // Şifreli dosya ise otomatik decrypt
    if (file.isEncrypted) {
      // hasMasterKey() ile gerçek zamanlı kontrol (state güncellenmeden önce de çalışır)
      if (!hasMasterKey()) {
        // Şifre modalını göster
        setPendingAction({ type: 'download', file });
        setShowPasswordModal(true);
        setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
        return;
      }
      
      setIsDecrypting(true);
      
      try {
        const token = typeof window !== 'undefined' 
          ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
          : null;
        
        if (!token) {
          showToast("Oturum bulunamadı", 'error');
          return;
        }
        
        const masterKey = getMasterKey();
        console.log("🔓 Şifreli dosya indiriliyor...");
        
        // Şifreli dosyayı indir ve çöz
        const { blob, filename } = await downloadAndDecryptWithKey(file.id, masterKey, token);
        
        // Dosyayı kaydet
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast(`${filename} indiriliyor... 🔓`, 'success');
        
      } catch (err: any) {
        console.error("Decrypt error:", err);
        showToast(err.message || "Dosya çözümlenemedi", 'error');
      } finally {
        setIsDecrypting(false);
        setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
      }
      return;
    }
    
    // Normal (şifresiz) dosya indirme
    try {
      const url = await getDownloadUrl(file.id);
      
      // Dosyayı otomatik indirmek için geçici bir link oluştur
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename || 'download';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`${file.filename} indiriliyor...`, 'success');
    } catch (err:any) {
      console.error(err); showToast(err.message || "İndirme linki alınamadı", 'error');
    } finally {
      setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
    }
  }
  
  async function handleView(file: FileItem) {
    console.log("🔍 handleView çağrıldı:", { fileId: file.id, filename: file.filename, isEncrypted: file.isEncrypted, hasMasterKey: hasMasterKey() });
    setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: true } }));
    
    // Şifreli dosya ise decrypt edip göster
    if (file.isEncrypted) {
      // hasMasterKey() ile gerçek zamanlı kontrol (state güncellenmeden önce de çalışır)
      if (!hasMasterKey()) {
        // Şifre modalını göster
        setPendingAction({ type: 'view', file });
        setShowPasswordModal(true);
        setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
        return;
      }
      
      setIsDecrypting(true);
      
      try {
        const token = typeof window !== 'undefined' 
          ? (localStorage.getItem('cloudyone_token') || localStorage.getItem('token') || sessionStorage.getItem('cloudyone_token') || sessionStorage.getItem('token'))
          : null;
        
        if (!token) {
          showToast("Oturum bulunamadı", 'error');
          setIsDecrypting(false);
          setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
          return;
        }
        
        const masterKey = getMasterKey();
        console.log("🔓 Şifreli dosya görüntüleniyor...");
        
        // Şifreli dosyayı indir ve çöz
        const { blob, filename } = await downloadAndDecryptWithKey(file.id, masterKey, token);
        
        // Dosya türüne göre MIME type belirle
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          'pdf': 'application/pdf',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'svg': 'image/svg+xml',
          'mp4': 'video/mp4',
          'webm': 'video/webm',
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'txt': 'text/plain',
          'html': 'text/html',
          'css': 'text/css',
          'js': 'text/javascript',
          'json': 'application/json',
          'xml': 'application/xml',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'ppt': 'application/vnd.ms-powerpoint',
          'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: mimeType });
        
        // Word dosyaları için Mammoth.js ile HTML'e çevir
        if (ext === 'docx') {
          try {
            const mammoth = (await import('mammoth')).default;
            const arrayBuffer = await typedBlob.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            
            // HTML içeriği ile yeni sayfa aç
            const htmlWindow = window.open('', '_blank');
            if (htmlWindow) {
              htmlWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <title>${filename}</title>
                  <style>
                    body { 
                      font-family: Arial, sans-serif; 
                      max-width: 800px; 
                      margin: 40px auto; 
                      padding: 20px;
                      background: #f5f5f5;
                    }
                    .document {
                      background: white;
                      padding: 40px;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                      border-radius: 8px;
                    }
                    h1, h2, h3 { color: #333; }
                    p { line-height: 1.6; color: #555; }
                  </style>
                </head>
                <body>
                  <div class="document">
                    <h1 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
                      🔓 ${filename}
                    </h1>
                    ${result.value}
                  </div>
                </body>
                </html>
              `);
              htmlWindow.document.close();
            }
            showToast(`${filename} açılıyor... 🔓`, 'success');
          } catch (err) {
            console.error('Mammoth error:', err);
            // Hata durumunda indir
            const url = URL.createObjectURL(typedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`${filename} indiriliyor... 🔓`, 'success');
          }
        }
        // Excel dosyaları için SheetJS ile tablo göster
        else if (ext === 'xlsx' || ext === 'xls') {
          try {
            const XLSX = (await import('xlsx')).default;
            const arrayBuffer = await typedBlob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            
            // İlk sheet'i HTML tablosuna çevir
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const html = XLSX.utils.sheet_to_html(worksheet);
            
            // HTML tablo ile yeni sayfa aç
            const htmlWindow = window.open('', '_blank');
            if (htmlWindow) {
              htmlWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <title>${filename}</title>
                  <style>
                    body { 
                      font-family: Arial, sans-serif; 
                      padding: 20px;
                      background: #f5f5f5;
                    }
                    h1 {
                      color: #10b981;
                      border-bottom: 2px solid #10b981;
                      padding-bottom: 10px;
                    }
                    table { 
                      border-collapse: collapse; 
                      width: 100%; 
                      background: white;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    td, th { 
                      border: 1px solid #ddd; 
                      padding: 8px; 
                      text-align: left;
                    }
                    th { 
                      background-color: #10b981; 
                      color: white;
                    }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                  </style>
                </head>
                <body>
                  <h1>🔓 ${filename}</h1>
                  <p><strong>Sheet:</strong> ${firstSheetName}</p>
                  ${html}
                </body>
                </html>
              `);
              htmlWindow.document.close();
            }
            showToast(`${filename} açılıyor... 🔓`, 'success');
          } catch (err) {
            console.error('SheetJS error:', err);
            // Hata durumunda indir
            const url = URL.createObjectURL(typedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`${filename} indiriliyor... 🔓`, 'success');
          }
        }
        // PowerPoint ve diğer Office dosyaları indirilir
        else if (ext === 'ppt' || ext === 'pptx') {
          const url = URL.createObjectURL(typedBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`${filename} indiriliyor... 🔓 (PowerPoint dosyaları tarayıcıda görüntülenemez)`, 'success');
        }
        // Diğer dosyaları normal aç
        else {
          const url = URL.createObjectURL(typedBlob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          showToast(`${filename} açılıyor... 🔓`, 'success');
        }
        
      } catch (err: any) {
        console.error("Decrypt error:", err);
        showToast(err.message || "Dosya çözümlenemedi", 'error');
      } finally {
        setIsDecrypting(false);
        setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
      }
      return;
    }
    
    // Normal (şifresiz) dosya görüntüleme
    try {
      console.log("📥 View URL alınıyor...", file.id);
      const url = await getViewUrl(file.id);
      console.log("✅ View URL alındı:", url);
      
      // Office dosyaları için Google Docs Viewer kullan
      const ext = file.filename.split('.').pop()?.toLowerCase() || '';
      const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
      
      if (officeExtensions.includes(ext)) {
        // Google Docs Viewer ile aç
        const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
        window.open(viewerUrl, '_blank');
        showToast(`${file.filename} Google Docs Viewer'da açılıyor...`, 'success');
      } else {
        // Resim dosyaları için direkt blob fetch yap (CORS sorununu önler)
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        if (imageExtensions.includes(ext)) {
          try {
            // URL'den blob fetch et
            const response = await fetch(url);
            if (!response.ok) throw new Error('Dosya yüklenemedi');
            
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            // Yeni sekmede aç
            const newWindow = window.open(blobUrl, '_blank');
            if (newWindow) {
              // Blob URL'i temizle (1 dakika sonra)
              setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
              showToast(`${file.filename} açılıyor...`, 'success');
            } else {
              throw new Error('Pop-up engellenmiş olabilir');
            }
          } catch (fetchErr) {
            console.warn('Blob fetch başarısız, direkt URL deneniyor:', fetchErr);
            // Fallback: Direkt URL'i aç
            window.open(url, "_blank");
            showToast(`${file.filename} açılıyor...`, 'success');
          }
        } else {
          // Diğer dosyaları normal aç
          window.open(url, "_blank");
          showToast(`${file.filename} açılıyor...`, 'success');
        }
      }
    } catch (err:any) {
      console.error("❌ View hatası:", err); 
      showToast(err.message || "Görüntüleme linki alınamadı", 'error');
    } finally {
      setFileActionLoading(m => ({ ...m, [file.id]: { ...(m[file.id]||{}), download: false } }));
    }
  }

  const used = usage?.usedStorageBytes ?? user?.usedStorageBytes ?? 0;
  const trash = usage?.trashStorageBytes ?? user?.trashStorageBytes ?? 0;
  const limit = usage?.storageLimitBytes ?? user?.storageLimitBytes ?? 1;
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  if (loading) {
    return (
      <div className="files-page">
        <div className="files-main">
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
            <div className="animate-spin" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }}>
              <svg viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p>Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="files-page">
      {/* Sidebar */}
      <aside className="files-sidebar">
        <div className="sidebar-logo" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <div style={{ width: '36px', height: '36px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>☁️</div>
          <span>CloudyOne</span>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`sidebar-nav-item ${!showTrash && !showFavorites && !showShared && !showHidden ? 'active' : ''}`}
            onClick={() => {
              setShowTrash(false); setShowFavorites(false); setShowShared(false); setShowHidden(false);
              setCurrentFolder(null);
              setAnimateContent(false);
              setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
              setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
            </svg>
            <span>Dosyalarım</span>
          </button>
          
          <button 
            className={`sidebar-nav-item ${showFavorites ? 'active' : ''}`}
            onClick={() => {
              setShowTrash(false); setShowFavorites(true); setShowShared(false); setShowHidden(false);
              setCurrentFolder(null);
              setAnimateContent(false);
              setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
              setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>Favoriler</span>
          </button>
          
          <button 
            className={`sidebar-nav-item ${showShared ? 'active' : ''}`}
            onClick={() => {
              setShowTrash(false); setShowFavorites(false); setShowShared(true); setShowHidden(false);
              setCurrentFolder(null);
              setAnimateContent(false);
              setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
              setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
            </svg>
            <span>Paylaşılanlar</span>
          </button>
          
          <button 
            className={`sidebar-nav-item ${showHidden ? 'active' : ''}`}
            onClick={async () => {
              // PIN kontrolü yap
              const pinCheck = await hasHiddenFilesPin();
              if (pinCheck?.hasPinSet) {
                // PIN ayarlanmış, doğrulama iste
                setHasPinSet(true);
                setPinModalOpen(true);
              } else {
                // PIN yok, PIN oluşturma modalı göster
                setHasPinSet(false);
                setPinModalOpen(true);
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            <span>Gizli</span>
          </button>
          
          <button 
            className={`sidebar-nav-item ${showTrash ? 'active' : ''}`}
            onClick={() => {
              setShowTrash(true); 
              setShowFavorites(false); 
              setShowShared(false);
              setShowHidden(false); 
              setCurrentFolder(null);
              setAnimateContent(false);
              setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
              setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Çöp Kutusu</span>
          </button>
          
          {/* Özel Modüller */}
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>Modüller</span>
            
            <button 
              className="sidebar-nav-item"
              onClick={() => router.push('/files/gallery')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              <span>Fotoğraflar</span>
            </button>
            
            <button 
              className="sidebar-nav-item"
              onClick={() => router.push('/files/requests')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span>Dosya İstekleri</span>
            </button>
            
            <button 
              className="sidebar-nav-item"
              onClick={() => router.push('/files/mobile')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <span>Mobil Uygulama</span>
            </button>
            
            <button 
              className="sidebar-nav-item"
              onClick={() => router.push('/files/team')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span>Ekip Yönetimi</span>
            </button>
            
            <button 
              className="sidebar-nav-item"
              onClick={() => router.push('/transfer')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ffffff' }}>
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
              <span style={{ color: '#ffffff' }}>Hızlı Transfer</span>
            </button>
          </div>
        </nav>
        
        {/* Storage Chart */}
        {usage && (() => {
          const usedBytes = usage.usedStorageBytes || 0;
          const limitBytes = usage.storageLimitBytes || 1;
          const percentage = Math.min(100, (usedBytes / limitBytes) * 100);
          // Çok küçük yüzdeler için daha hassas gösterim
          let displayPercentage: string;
          if (percentage === 0) {
            displayPercentage = '0';
          } else if (percentage < 0.01) {
            displayPercentage = '<0.01';
          } else if (percentage < 0.1) {
            displayPercentage = percentage.toFixed(2);
          } else if (percentage < 1) {
            displayPercentage = percentage.toFixed(1);
          } else {
            displayPercentage = Math.round(percentage).toString();
          }
          
          // Backend'den gelen kategori bilgileri varsa kullan, yoksa frontend'de hesapla
          let categoryBytes = storageInfo?.categoryBytes || {
            image: 0,
            media: 0,
            document: 0,
            other: 0
          };
          
          let categoryCounts = storageInfo?.categoryCounts || {
            image: 0,
            media: 0,
            document: 0,
            other: 0
          };
          
          // Eğer backend'den veri gelmemişse fallback olarak frontend'de hesapla
          if (!storageInfo?.categoryBytes) {
            // TOPLAM depolama için TÜM dosyalardan kategori hesaplama (klasörden bağımsız)
            const filesToAnalyze = allUserFiles.length > 0 ? allUserFiles : files;
            filesToAnalyze.forEach((file) => {
              if (!file.isDeleted && file.filename) {
                const ext = file.filename.split('.').pop()?.toLowerCase() || '';
                const size = file.sizeBytes || 0;
                
                // Resimler
                if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'tiff'].includes(ext)) {
                  categoryBytes.image += size;
                  categoryCounts.image += 1;
                }
                // Medya (video ve ses dosyaları)
                else if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) {
                  categoryBytes.media += size;
                  categoryCounts.media += 1;
                }
                // Dokümanlar
                else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
                  categoryBytes.document += size;
                  categoryCounts.document += 1;
                }
                // Diğer
                else {
                  categoryBytes.other += size;
                  categoryCounts.other += 1;
                }
              }
            });
          }
          
          const totalCategoryBytes = (Object.values(categoryBytes) as number[]).reduce((a, b) => a + b, 0);
          
          // Gizli dosyalar
          const hiddenCount = storageInfo?.hiddenFilesCount || 0;
          const hiddenBytes = storageInfo?.hiddenFilesBytes || 0;
          
          // Kategori yüzdeleri TOPLAM depolama kapasitesine göre (limitBytes)
          const categoryPercentages = {
            image: limitBytes > 0 ? ((categoryBytes.image / limitBytes) * 100).toFixed(1) : '0',
            document: limitBytes > 0 ? ((categoryBytes.document / limitBytes) * 100).toFixed(1) : '0',
            other: limitBytes > 0 ? ((categoryBytes.other / limitBytes) * 100).toFixed(1) : '0'
          };
          const hiddenPercent = limitBytes > 0 ? (hiddenBytes / limitBytes) * 100 : 0;
          
          // Dairesel grafik için segment hesaplamaları (3 kategori)
          const circumference = 2 * Math.PI * 80; // r=80
          const imagePercent = parseFloat(categoryPercentages.image);
          const documentPercent = parseFloat(categoryPercentages.document);
          const otherPercent = parseFloat(categoryPercentages.other);
          
          const imageDash = (imagePercent / 100) * circumference;
          const documentDash = (documentPercent / 100) * circumference;
          const otherDash = (otherPercent / 100) * circumference;
          const hiddenDash = (hiddenPercent / 100) * circumference;
          
          // Offset hesaplamaları (her segment bir öncekinin sonundan başlar)
          const imageOffset = -circumference / 4; // -90 derece başlangıç
          const documentOffset = imageOffset - imageDash;
          const otherOffset = documentOffset - documentDash;
          const hiddenOffset = otherOffset - otherDash;
          
          return (
            <div className="storage-chart-widget">
              <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#e0e7ff' }}>
                  Depolama Detayı
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                  {formatSizeFull(usedBytes)} / {formatSizeFull(limitBytes)}
                </p>
              </div>
              <div className="storage-chart-circle">
                <svg viewBox="0 0 200 200" className="storage-svg">
                  {/* Arka plan dairesi */}
                  <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="20" />
                  
                  {/* Resimler - Turuncu */}
                  {imageDash > 0 && (
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="80" 
                      fill="none" 
                      stroke="#f97316"
                      strokeWidth="20"
                      strokeDasharray={`${imageDash} ${circumference}`}
                      strokeDashoffset={imageOffset}
                      strokeLinecap="butt"
                    />
                  )}
                  
                  {/* Dokümanlar - Mavi */}
                  {documentDash > 0 && (
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="80" 
                      fill="none" 
                      stroke="#3b82f6"
                      strokeWidth="20"
                      strokeDasharray={`${documentDash} ${circumference}`}
                      strokeDashoffset={documentOffset}
                      strokeLinecap="butt"
                    />
                  )}
                  
                  {/* Çöp Kutusu - Mor */}
                  {otherDash > 0 && (
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="80" 
                      fill="none" 
                      stroke="#a855f7"
                      strokeWidth="20"
                      strokeDasharray={`${otherDash} ${circumference}`}
                      strokeDashoffset={otherOffset}
                      strokeLinecap="butt"
                    />
                  )}
                  
                  {/* Gizli - İndigo */}
                  {hiddenDash > 0 && (
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="80" 
                      fill="none" 
                      stroke="#6366f1"
                      strokeWidth="20"
                      strokeDasharray={`${hiddenDash} ${circumference}`}
                      strokeDashoffset={hiddenOffset}
                      strokeLinecap="butt"
                    />
                  )}
                </svg>
                <div className="storage-percentage" style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  lineHeight: 1.1
                }}>
                  <span style={{ 
                    fontSize: usedBytes > 1024*1024*1024 ? '1.6rem' : '2rem', 
                    fontWeight: 700,
                    color: '#ffffff'
                  }}>
                    {formatSizeCompact(usedBytes).value}
                  </span>
                  <span style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.7)',
                    marginTop: '2px'
                  }}>
                    {formatSizeCompact(usedBytes).unit}
                  </span>
                </div>
              </div>
              
              <div className="storage-breakdown">
                <div className="storage-category">
                  <div className="category-color" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}></div>
                  <span className="category-name">
                    Resimler {categoryCounts.image > 0 && `(${categoryCounts.image})`}
                  </span>
                  <span className="category-percent">{formatSizeFull(categoryBytes.image)}</span>
                </div>
                <div className="storage-category">
                  <div className="category-color" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}></div>
                  <span className="category-name">
                    Dokümanlar {categoryCounts.document > 0 && `(${categoryCounts.document})`}
                  </span>
                  <span className="category-percent">{formatSizeFull(categoryBytes.document)}</span>
                </div>
                <div className="storage-category">
                  <div className="category-color" style={{ background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' }}></div>
                  <span className="category-name">
                    Diğer {categoryCounts.other > 0 && `(${categoryCounts.other})`}
                  </span>
                  <span className="category-percent">{formatSizeFull(categoryBytes.other)}</span>
                </div>
                <div className="storage-category">
                  <div className="category-color" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' }}></div>
                  <span className="category-name">
                    Çöp Kutusu
                  </span>
                  <span className="category-percent">{formatSizeFull(usage?.trashStorageBytes || storageInfo?.trashStorageBytes || 0)}</span>
                </div>
                <div className="storage-category">
                  <div className="category-color" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}></div>
                  <span className="category-name">Gizli {hiddenCount > 0 && `(${hiddenCount})`}</span>
                  <span className="category-percent">{formatSizeFull(hiddenBytes)}</span>
                </div>
              </div>
            </div>
          );
        })()}
        
        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'row', gap: '0.75rem', marginTop: 'auto', justifyContent: 'center' }}>
            <button 
              onClick={() => router.push('/settings')}
              className="sidebar-nav-item"
              style={{ justifyContent: 'center', padding: 0, borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center' }}
            >
              <div className="user-avatar" style={{ margin: 0, width: '52px', height: '52px', borderRadius: '50%', fontSize: '1.125rem' }}>
                {(user?.name || user?.email || 'U')[0].toUpperCase()}
              </div>
            </button>
            
            {/* Bildirim/Etkinlik Butonu */}
            <div ref={activityPanelRef} style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowActivityPanel(!showActivityPanel)}
                className="sidebar-nav-item"
                style={{ 
                  justifyContent: 'center', 
                  padding: '0.75rem',
                  background: showActivityPanel ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)',
                  border: showActivityPanel ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '50%',
                  width: '52px',
                  height: '52px',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!showActivityPanel) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showActivityPanel) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                  }
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
                {/* Okunmamış sayacı */}
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '18px',
                    height: '18px',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    borderRadius: '50%',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(15, 23, 42, 0.9)',
                    animation: 'pulse 2s infinite'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
            
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="sidebar-nav-item"
              style={{ 
                justifyContent: 'center', 
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '50%',
                width: '52px',
                height: '52px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Etkinlik Paneli - Sidebar dışında, her şeyin üzerinde */}
      {showActivityPanel && (
        <div 
          ref={activityPanelRef}
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '280px',
            width: '360px',
            maxHeight: 'calc(100vh - 180px)',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 30, 0.99) 100%)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            zIndex: 99999,
            overflow: 'hidden',
            animation: 'slideInLeft 0.25s ease-out',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.08) 0%, transparent 100%)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(139, 92, 246, 0.2)'
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '1.0625rem', 
                  fontWeight: 600, 
                  color: '#f1f5f9'
                }}>
                  Etkinlikler
                </h3>
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Son dosya işlemleriniz
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowActivityPanel(false)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(148, 163, 184, 0.1)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)';
                e.currentTarget.style.color = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          {/* Okunmamış Badge ve Aksiyonlar */}
          <div style={{
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
            background: unreadCount > 0 ? 'rgba(139, 92, 246, 0.05)' : 'transparent'
          }}>
            <span style={{
              fontSize: '0.75rem',
              color: unreadCount > 0 ? '#a78bfa' : '#64748b',
              fontWeight: 500
            }}>
              {unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : `${activities.length} etkinlik`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '8px',
                    color: '#c4b5fd',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                  }}
                >
                  Tümünü Okundu İşaretle
                </button>
              )}
              {activities.length > 0 && (
                <button
                  onClick={clearAllActivities}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                  }}
                >
                  Temizle
                </button>
              )}
            </div>
          </div>
          
          {/* Etkinlik Listesi */}
          <div 
            ref={activityScrollRef}
            onScroll={handleActivityScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '0.5rem'
            }}
            className="activity-scroll"
          >
            {activities.length === 0 && !activitiesLoading ? (
              <div style={{
                padding: '3rem 2rem',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 1rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#8b5cf6' }}>
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <p style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Henüz etkinlik yok
                </p>
                <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Dosya işlemleriniz burada görünecek
                </p>
              </div>
            ) : (
              <>
                {activities.map((activity, index) => {
                  const { icon, color, bg } = getActivityIcon(activity.type);
                  return (
                    <div 
                      key={activity.id}
                      style={{
                        padding: '0.875rem 1rem',
                        margin: '0.25rem 0.5rem',
                        display: 'flex',
                        gap: '0.875rem',
                        alignItems: 'flex-start',
                        background: activity.isRead ? 'rgba(148, 163, 184, 0.03)' : 'rgba(139, 92, 246, 0.08)',
                        borderRadius: '12px',
                        border: activity.isRead ? '1px solid transparent' : '1px solid rgba(139, 92, 246, 0.15)',
                        transition: 'all 0.15s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = activity.isRead ? 'rgba(148, 163, 184, 0.03)' : 'rgba(139, 92, 246, 0.08)';
                        e.currentTarget.style.borderColor = activity.isRead ? 'transparent' : 'rgba(139, 92, 246, 0.15)';
                      }}
                    >
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: color,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ 
                          margin: 0, 
                          fontSize: '0.875rem', 
                          color: '#e2e8f0', 
                          lineHeight: 1.4 
                        }}>
                          <span style={{ fontWeight: 600, color: color }}>{activity.actorName || 'Sen'}</span>
                          <span style={{ color: '#94a3b8' }}> {getActivityMessage(activity.type)}</span>
                        </p>
                        <p style={{ 
                          margin: '0.25rem 0 0', 
                          fontSize: '0.8125rem', 
                          color: '#c4b5fd', 
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {activity.fileName || activity.folderName || 'Dosya'}
                        </p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                          {formatActivityTime(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                
                {/* Yükleniyor Spinner */}
                {activitiesLoading && (
                  <div style={{
                    padding: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem'
                  }}>
                    <div className="loading-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Yükleniyor...</span>
                  </div>
                )}
                
                {/* Daha Fazla Yok */}
                {!hasMoreActivities && activities.length > 0 && (
                  <div style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: '0.75rem'
                  }}>
                    Tüm etkinlikler yüklendi
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <div className="files-content">
        {/* Main Content */}
        <main className="files-main" style={{ padding: '0.75rem 0.5rem' }}>
          {/* Dashboard Grid */}
          {!showTrash && (
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* New Folder Card */}
            <div className="dashboard-card add-folder-card" onClick={() => setCreatingFolder(true)}>
              <div className="add-folder-icon">
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m8-8H4" />
                </svg>
              </div>
              <span className="card-label">Yeni<br/>Klasör</span>
            </div>

            {/* Upload File Card */}
            {!pendingFile ? (
              <label className="dashboard-card add-folder-card" style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                <div className="add-folder-icon">
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <span className="card-label">{uploading ? "Yükleniyor..." : "Dosya Yükle"}</span>
                <input ref={fileInputRef} type="file" onChange={handleSelectFile} style={{ display: "none" }} disabled={uploading} />
              </label>
            ) : (
              <div className="dashboard-card" style={{ background: 'rgba(139, 92, 246, 0.15)', border: '2px dashed rgba(139, 92, 246, 0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', textAlign: 'center', color: '#c4b5fd' }}>{pendingFile.name}<br/><span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({formatSizeFull(pendingFile.size)})</span></div>
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <button onClick={confirmUpload} className="files-btn files-btn-primary" style={{ fontSize: '0.75rem', flex: 1 }} disabled={uploading}>
                    Yükle
                  </button>
                  <button onClick={cancelPendingFile} className="files-btn" style={{ fontSize: '0.75rem', flex: 1 }}>
                    İptal
                  </button>
                </div>
              </div>
            )}

          </div>
          )}

          {/* Mobil Tarama Yönlendirme Kartı */}
          {!showTrash && !showFavorites && !showShared && !showHidden && (
            <div 
              onClick={() => router.push('/files/mobile')}
              style={{ 
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '16px',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(139, 92, 246, 0.18) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* İkon */}
              <div style={{ 
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              
              {/* Metin */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  📱 Mobil ile Taramaya Başla
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                  Telefonunuzu kullanarak belge, makbuz veya not tarayın ve doğrudan sisteme kaydedin
                </div>
              </div>
              
              {/* Ok İkonu */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#a78bfa" style={{ flexShrink: 0 }}>
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}

          {/* PIN Verification / Creation Modal */}
          {pinModalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ 
                width: 'min(400px, 90%)', 
                background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(148,163,184,0.2)', 
                borderRadius: 24, 
                padding: 28,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 12, 
                    background: hasPinSet ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: hasPinSet ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: hasPinSet ? '#8b5cf6' : '#10b981' }}>
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 18, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>
                      {hasPinSet ? 'PIN Doğrulama' : 'PIN Oluşturun'}
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                      {hasPinSet ? 'Gizli dosyalara erişmek için PIN girin' : 'Gizli dosyalarınızı korumak için 4 haneli PIN oluşturun'}
                    </p>
                  </div>
                </div>
                
                {hasPinSet ? (
                  /* PIN Doğrulama */
                  <div style={{ marginBottom: 20 }}>
                    <input 
                      type="password"
                      maxLength={4}
                      placeholder="4 haneli PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && pinInput.length === 4) {
                          try {
                            await verifyHiddenFilesPin(pinInput);
                            setPinVerified(true);
                            setPinModalOpen(false);
                            setPinInput("");
                            setShowTrash(false);
                            setShowFavorites(false);
                            setShowShared(false);
                            setShowHidden(true);
                            setCurrentFolder(null);
                            setAnimateContent(false);
                            setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
                            setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                          } catch (err: any) {
                            showToast(err.message || "Yanlış PIN", 'error');
                            setPinInput("");
                          }
                        }
                      }}
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        fontSize: 16, 
                        borderRadius: 12, 
                        background: 'rgba(15, 23, 42, 0.6)', 
                        border: '1px solid rgba(148, 163, 184, 0.2)', 
                        color: '#f1f5f9',
                        textAlign: 'center',
                        letterSpacing: '0.5em',
                        fontWeight: 600
                      }}
                    />
                  </div>
                ) : (
                  /* PIN Oluşturma */
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>PIN (4 haneli)</label>
                      <input 
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        style={{ 
                          width: '100%', 
                          padding: '12px 16px', 
                          fontSize: 16, 
                          borderRadius: 12, 
                          background: 'rgba(15, 23, 42, 0.6)', 
                          border: '1px solid rgba(148, 163, 184, 0.2)', 
                          color: '#f1f5f9',
                          textAlign: 'center',
                          letterSpacing: '0.5em',
                          fontWeight: 600
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>PIN Tekrar</label>
                      <input 
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                        style={{ 
                          width: '100%', 
                          padding: '12px 16px', 
                          fontSize: 16, 
                          borderRadius: 12, 
                          background: 'rgba(15, 23, 42, 0.6)', 
                          border: '1px solid rgba(148, 163, 184, 0.2)', 
                          color: '#f1f5f9',
                          textAlign: 'center',
                          letterSpacing: '0.5em',
                          fontWeight: 600
                        }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => { setPinModalOpen(false); setPinInput(""); setNewPin(""); setConfirmPin(""); }}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'rgba(148,163,184,0.1)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    İptal
                  </button>
                  <button 
                    onClick={async () => {
                      if (hasPinSet) {
                        // PIN Doğrulama
                        if (pinInput.length !== 4) {
                          showToast("PIN 4 haneli olmalıdır", 'error');
                          return;
                        }
                        try {
                          await verifyHiddenFilesPin(pinInput);
                          setPinVerified(true);
                          setPinModalOpen(false);
                          setPinInput("");
                          setShowTrash(false);
                          setShowFavorites(false);
                          setShowShared(false);
                          setShowHidden(true);
                          setCurrentFolder(null);
                          setAnimateContent(false);
                          setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
                          setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                        } catch (err: any) {
                          showToast(err.message || "Yanlış PIN", 'error');
                          setPinInput("");
                        }
                      } else {
                        // PIN Oluşturma
                        if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
                          showToast("PIN 4 haneli sayı olmalıdır", 'error');
                          return;
                        }
                        if (newPin !== confirmPin) {
                          showToast("PIN'ler eşleşmiyor", 'error');
                          return;
                        }
                        try {
                          await setHiddenFilesPin(newPin);
                          showToast("Gizli dosyalar PIN'i oluşturuldu", 'success');
                          setPinVerified(true);
                          setHasPinSet(true);
                          setPinModalOpen(false);
                          setNewPin("");
                          setConfirmPin("");
                          setShowTrash(false);
                          setShowFavorites(false);
                          setShowShared(false);
                          setShowHidden(true);
                          setCurrentFolder(null);
                          setAnimateContent(false);
                          setTimeout(() => { setAnimateContent(true); setRefreshFlag(f=>f+1); }, 50);
                          setTimeout(() => document.querySelector('.files-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                        } catch (err: any) {
                          showToast(err.message || "PIN oluşturulamadı", 'error');
                        }
                      }
                    }}
                    disabled={hasPinSet ? pinInput.length !== 4 : (newPin.length !== 4 || confirmPin.length !== 4)}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: (hasPinSet ? pinInput.length === 4 : (newPin.length === 4 && confirmPin.length === 4)) 
                        ? (hasPinSet ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)') 
                        : 'rgba(139, 92, 246, 0.3)', 
                      border: 'none', 
                      color: 'white',
                      cursor: (hasPinSet ? pinInput.length === 4 : (newPin.length === 4 && confirmPin.length === 4)) ? 'pointer' : 'not-allowed',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: (hasPinSet ? pinInput.length === 4 : (newPin.length === 4 && confirmPin.length === 4)) ? 1 : 0.5
                    }}
                  >
                    {hasPinSet ? 'Doğrula' : 'Oluştur'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Version Delete Confirmation Modal */}
          {deleteVersionConfirm && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ 
                width: 'min(450px, 90%)', 
                background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(148,163,184,0.2)', 
                borderRadius: 24, 
                padding: 28,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 12, 
                    background: 'rgba(239, 68, 68, 0.15)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 18, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>Sürümü Sil</h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Bu işlem geri alınamaz</p>
                  </div>
                </div>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
                    <strong style={{ color: '#f1f5f9' }}>Sürüm {deleteVersionConfirm.version}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setDeleteVersionConfirm(null)}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'rgba(148,163,184,0.1)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(148,163,184,0.1)';
                    }}
                  >
                    İptal
                  </button>
                  <button 
                    onClick={() => doDeleteVersion(deleteVersionConfirm.versionId)}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                      border: 'none', 
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                    }}
                  >
                    Evet, Sil
                  </button>
                </div>
              </div>
            </div>
          )}

          {duplicateFileWarning && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ 
                width: 'min(500px, 90%)', 
                background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(148,163,184,0.2)', 
                borderRadius: 24, 
                padding: 28,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 12, 
                    background: 'rgba(251, 191, 36, 0.15)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(251, 191, 36, 0.3)'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#fbbf24' }}>
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 18, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>Dosya Zaten Mevcut</h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Bu dosya sistemde zaten var</p>
                  </div>
                </div>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 14, color: '#cbd5e1' }}>
                    <strong style={{ color: '#f1f5f9' }}>{duplicateFileWarning.file.name}</strong> isimli dosya sistemde zaten mevcut.
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                    Yeni sürüm olarak yüklemek ister misiniz? Eski sürüm saklanacak ve "Sürümler" butonundan erişebilirsiniz.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => {
                      setDuplicateFileWarning(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'rgba(148,163,184,0.1)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(148,163,184,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(148,163,184,0.1)';
                    }}
                  >
                    İptal
                  </button>
                  <button 
                    onClick={async () => {
                      const file = duplicateFileWarning.file;
                      setDuplicateFileWarning(null);
                      
                      // Direkt yükleme işlemini başlat
                      setUploading(true);
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        if (currentFolder) formData.append("folderId", currentFolder.id);
                        if (showHidden) formData.append("isHidden", "true"); // Gizli bölümdeyse
                        const data = await apiFetch("/files/upload", { method: "POST", body: formData }, true);
                        console.log("Upload response:", data);
                        if (data?.usage) {
                          console.log("Setting usage from upload:", data.usage);
                          setUsage({
                            usedStorageBytes: data.usage.usedStorageBytes,
                            storageLimitBytes: data.usage.storageLimitBytes,
                            trashStorageBytes: data.usage.trashStorageBytes || 0,
                            trashLimitBytes: data.usage.trashLimitBytes || 0,
                            plan: data.usage.plan
                          });
                        }
                        // Backend'den gelen mesajı göster
                        if (data?.isNewVersion && data?.message) {
                          showToast(data.message, 'success');
                        } else {
                          showToast("Yeni sürüm olarak yüklendi", 'success');
                        }
                        // Grafiği güncellemek için tüm dosyaları yeniden çek
                        try {
                          const allFilesData = await apiFetch('/files?includeAll=true', {}, true);
                          if (allFilesData?.files) {
                            setAllUserFiles(allFilesData.files);
                          }
                        } catch (e) {
                          console.error('Failed to refresh storage graph:', e);
                        }
                        setRefreshFlag((f) => f + 1);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      } catch (err: any) {
                        console.error(err);
                        showToast(err.message || "Yükleme başarısız", 'error');
                      } finally {
                        setUploading(false);
                      }
                    }}
                    disabled={uploading}
                    style={{ 
                      padding: '10px 20px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: uploading ? 'rgba(139, 92, 246, 0.5)' : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', 
                      border: 'none', 
                      color: 'white',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                      opacity: uploading ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!uploading) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!uploading) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                      }
                    }}
                  >
                    {uploading ? 'Yükleniyor...' : 'Yeni Sürüm Olarak Yükle'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Güvenlik Oturumu Sona Erdi Modal */}
          {showSecurityExpiredModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ 
                width: 'min(440px, 90%)', 
                background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(239, 68, 68, 0.3)', 
                borderRadius: 24, 
                padding: 28,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: 14, 
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.15) 100%)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 20, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>Güvenlik Oturumu Sona Erdi</h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Şifreleme anahtarınız süresi doldu</p>
                  </div>
                </div>
                
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
                      <p style={{ margin: '0 0 8px 0' }}>Dosyalarınızı korumak için güvenlik oturumu 30 dakika hareketsizlik sonunda otomatik olarak sonlanır.</p>
                      <p style={{ margin: 0 }}>Devam etmek için <strong style={{ color: '#f1f5f9' }}>tekrar giriş yapmanız</strong> gerekmektedir.</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setShowSecurityExpiredModal(false)}
                    style={{ 
                      padding: '12px 24px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'rgba(148,163,184,0.1)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    Kapat
                  </button>
                  <button 
                    onClick={() => {
                      // Logout ve login'e yönlendir
                      clearMasterKey();
                      localStorage.removeItem('cloudyone_token');
                      localStorage.removeItem('token');
                      sessionStorage.removeItem('cloudyone_token');
                      sessionStorage.removeItem('token');
                      window.location.href = '/login';
                    }}
                    style={{ 
                      padding: '12px 28px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                      border: 'none', 
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Giriş Yap
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Şifre Giriş Modalı */}
          {showPasswordModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ 
                width: 'min(440px, 90%)', 
                background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(139, 92, 246, 0.3)', 
                borderRadius: 24, 
                padding: 28,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: 14, 
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(124, 58, 237, 0.15) 100%)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#8b5cf6' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 20, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>Şifre Doğrulama</h3>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Şifreli dosyalara erişmek için şifrenizi girin</p>
                  </div>
                </div>
                
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 14, color: '#94a3b8', marginBottom: 8 }}>Hesap Şifreniz</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !passwordLoading) {
                        handlePasswordSubmit();
                      }
                    }}
                    placeholder="Şifrenizi girin"
                    disabled={passwordLoading}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: 15,
                      borderRadius: 12,
                      background: 'rgba(30,41,59,0.8)',
                      border: passwordError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(148,163,184,0.2)',
                      color: '#f1f5f9',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                  {passwordError && (
                    <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#ef4444' }}>{passwordError}</p>
                  )}
                </div>

                <div style={{ background: 'rgba(139, 92, 246, 0.1)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 2 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
                      <p style={{ margin: 0 }}>Şifreli dosyalarınız güvenlik için 30 dakika hareketsizlik sonunda kilitlenir. Şifreniz sadece şifreleme anahtarını oluşturmak için kullanılır.</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordInput("");
                      setPasswordError("");
                      setPendingAction(null);
                    }}
                    disabled={passwordLoading}
                    style={{ 
                      padding: '12px 24px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: 'rgba(148,163,184,0.1)', 
                      border: '1px solid rgba(148,163,184,0.2)', 
                      color: '#cbd5e1',
                      cursor: passwordLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: passwordLoading ? 0.5 : 1
                    }}
                  >
                    İptal
                  </button>
                  <button 
                    onClick={handlePasswordSubmit}
                    disabled={passwordLoading || !passwordInput.trim()}
                    style={{ 
                      padding: '12px 28px', 
                      fontSize: 14, 
                      borderRadius: 12, 
                      background: passwordLoading || !passwordInput.trim() 
                        ? 'rgba(139, 92, 246, 0.3)' 
                        : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', 
                      border: 'none', 
                      color: 'white',
                      cursor: passwordLoading || !passwordInput.trim() ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {passwordLoading ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
                        </svg>
                        Doğrulanıyor...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Onayla
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notifications */}
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
            {toasts.map((toast) => (
              <div
                key={toast.id}
                style={{
                  background: toast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
                  border: `1px solid ${toast.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  animation: toast.isExiting ? 'slideOutRight 0.3s ease-out forwards' : 'slideInRight 0.3s ease-out',
                  minWidth: 280
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  {toast.type === 'success' ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  )}
                </svg>
                {toast.message}
              </div>
            ))}
          </div>

          {/* Recent Files Section - Card Style with Scrolling */}
          {files.length > 0 && (
            <div className="recent-files-section" style={{ padding: '0 1rem', marginBottom: '2rem' }}>
              <div style={{ 
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 16, 
                padding: '1.75rem',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s'
              }}>
                <h2 className="section-title-modern" style={{ marginBottom: '1.25rem' }}>Son İşlemler</h2>
                <div 
                  className="recent-files-container" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.5rem',
                    maxHeight: 'calc(4 * (44px + 0.875rem + 0.875rem + 0.5rem))', // 4 dosya yüksekliği
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingRight: '0.5rem'
                  }}
                >
                  {files.slice(0, 10).map((file) => (
                  <div key={file.id} style={{ 
                    background: 'rgba(30, 41, 59, 0.4)', 
                    border: '1px solid rgba(148, 163, 184, 0.1)', 
                    borderRadius: 12, 
                    padding: '0.875rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleDownload(file)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.1)';
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                  }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        width: 44, 
                        height: 44, 
                        background: file.isEncrypted 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)'
                          : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        position: 'relative'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill={file.isEncrypted ? '#34d399' : '#c4b5fd'}>
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        {file.isEncrypted && (
                          <div style={{ 
                            position: 'absolute', 
                            bottom: -2, 
                            right: -2, 
                            width: 16, 
                            height: 16, 
                            background: '#10b981', 
                            borderRadius: 5, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            border: '2px solid rgba(30, 41, 59, 0.9)'
                          }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '0.875rem', 
                          fontWeight: 600, 
                          color: '#ffffff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          {file.isEncrypted && file.filename === 'encrypted' ? 'Şifreli Dosya' : file.filename}
                          {file.isEncrypted && (
                            <span style={{ 
                              fontSize: 9, 
                              padding: '2px 5px', 
                              background: 'rgba(16, 185, 129, 0.2)', 
                              color: '#10b981', 
                              borderRadius: 4, 
                              fontWeight: 600 
                            }}>E2E</span>
                          )}
                        </h4>
                        <p style={{ 
                          margin: '0.125rem 0 0', 
                          fontSize: '0.75rem', 
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap'
                        }}>
                          <span>{formatSize(file.sizeBytes)}</span>
                          <span>•</span>
                          <span>{new Date(file.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                          {file.folder && !currentFolder && (
                            <>
                              <span>•</span>
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentFolder({
                                    id: file.folder!.id,
                                    name: file.folder!.name,
                                    createdAt: new Date().toISOString()
                                  });
                                  setRefreshFlag(f => f + 1);
                                }}
                                style={{ 
                                  color: '#a78bfa',
                                  cursor: 'pointer',
                                  transition: 'color 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontWeight: 500
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#c4b5fd'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#a78bfa'}
                              >
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                                {file.folder.name}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
          )}

          {/* Empty Trash Button - Above Folders */}
          {showTrash && (folders.length > 0 || files.length > 0) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', padding: '0 1rem' }}>
              <button
                onClick={() => setShowEmptyTrashConfirm(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Çöp Kutusunu Boşalt
              </button>
            </div>
          )}

          {/* Folders Section */}
          {folders.length > 0 && (
            <div className="folders-section-modern">
              <div className="folders-header">
                <h2 className="section-title-modern">Klasörler</h2>
                <div className="folders-controls">
                  <div className="search-container-modern">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    <input 
                      type="text" 
                      placeholder="Ara" 
                      value={folderSearchTerm}
                      onChange={(e) => setFolderSearchTerm(e.target.value)}
                    />
                  </div>
                  <select
                    value={folderSortOrder === "asc" ? "date:asc" : "date:desc"}
                    onChange={(e) => setFolderSortOrder(e.target.value === "date:asc" ? "asc" : "desc")}
                    className="sort-select-modern"
                  >
                    <option value="date:desc">Tarih (Yeni→Eski)</option>
                    <option value="date:asc">Tarih (Eski→Yeni)</option>
                  </select>
                </div>
              </div>
              
              {/* Horizontal Scrollable Folder List */}
              <div className="folders-scroll-container">
                {folders
                  .filter(f => f.name.toLowerCase().includes(folderSearchTerm.toLowerCase()))
                  .sort((a, b) => {
                    const dateA = new Date(a.createdAt).getTime();
                    const dateB = new Date(b.createdAt).getTime();
                    return folderSortOrder === "asc" ? dateA - dateB : dateB - dateA;
                  })
                  .map((f, idx) => {
                    const colors = [
                      { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: '#a78bfa', name: '#e0e7ff' },
                      { bg: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)', label: '#4ade80', name: '#dcfce7' },
                      { bg: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', label: '#fbbf24', name: '#fef3c7' },
                      { bg: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', label: '#f472b6', name: '#fce7f3' },
                    ];
                    const color = colors[idx % colors.length];
                    
                    // Klasördeki dosyaların toplam boyutunu hesapla
                    // Backend'den gelen değerleri kullan, yoksa hesapla
                    const fileCount = f.fileCount ?? 0;
                    const folderSize = f.totalSize ?? 0;
                    
                    return (
                  <div 
                    key={f.id} 
                    className="folder-card-modern"
                    onClick={() => handleOpenFolder(f)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setFolderContextMenu({ folderId: f.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <button
                      className="folder-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderContextMenu({ folderId: f.id, x: e.currentTarget.getBoundingClientRect().right, y: e.currentTarget.getBoundingClientRect().bottom });
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {/* Favori Yıldız Butonu */}
                    {!showTrash && !showHidden && (
                    <button
                      className="folder-favorite-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const result = await toggleFolderFavorite(f.id);
                          showToast(result.message || (f.isFavorite ? "Klasör favorilerden çıkarıldı" : "Klasör favorilere eklendi"), 'success');
                          setRefreshFlag(fr => fr + 1);
                        } catch (err: any) {
                          showToast(err.message || "Favori durumu güncellenemedi", 'error');
                        }
                      }}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        backdropFilter: 'blur(8px)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        zIndex: 2,
                        color: f.isFavorite ? '#fbbf24' : '#94a3b8'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill={f.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                    )}

                    <div className="folder-icon-modern" style={{ background: color.bg }}>
                      <svg width="56" height="56" viewBox="0 0 24 24" fill="white">
                        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                      </svg>
                    </div>
                    
                    <div className="folder-info-modern">
                      <h3 className="folder-name-modern" style={{ color: color.name }}>
                        {f.name}
                      </h3>
                      <p className="folder-date-modern" style={{ color: color.label }}>
                        {fileCount} dosya • {formatSize(folderSize)}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Breadcrumb Navigation Header */}
          {currentFolder && (
            <div style={{ 
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              borderRadius: 16,
              padding: '1rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                flex: 1
              }}>
                <button 
                  onClick={() => setCurrentFolder(null)}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: 10,
                    transition: 'all 0.2s',
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    cursor: 'pointer',
                    color: '#cbd5e1'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)';
                    e.currentTarget.style.color = '#c4b5fd';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                    e.currentTarget.style.color = '#cbd5e1';
                  }}
                  title="Ana dizine dön"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L4.414 9H17a1 1 0 110 2H4.414l5.293 5.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.625rem',
                  fontSize: '0.9375rem',
                  color: '#94a3b8'
                }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6 }}>
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                  <span>Ana Dizin</span>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.4 }}>
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{currentFolder.name}</span>
                  </div>
                </div>
              </div>
              
              <div style={{ 
                fontSize: '0.8125rem',
                color: '#94a3b8',
                whiteSpace: 'nowrap'
              }}>
                {files.filter(f => f.folderId === currentFolder.id).length} dosya
              </div>
            </div>
          )}

          {/* Detailed Files Table - keeping original functionality */}
          <div className={`files-table-section ${animateContent ? 'animate-slide-down' : ''}`}>
            <div className="table-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 className="section-title" style={{ margin: 0 }}>{showHidden ? "Gizli" : showShared ? "Paylaşılan Dosyalar" : showFavorites ? "Favoriler" : showTrash ? "Çöp Kutusu" : currentFolder ? "Dosyalar" : "Tüm Dosyalar"}</h2>
                {showTrash && (files.length > 0 || folders.length > 0) && (
                  <button
                    onClick={() => setShowEmptyTrashConfirm(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      color: '#fca5a5',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Tümünü Sil
                  </button>
                )}
              </div>
              <div className="table-filters" style={{ gap: '0.75rem' }}>
                <div className="search-container" style={{ minWidth: '200px' }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.5 }}>
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <input 
                    type="text" 
                    placeholder="Ara" 
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="search-input"
                  />
                </div>
                <select value={fileType} onChange={e=>{setFileType(e.target.value); setRefreshFlag(f=>f+1);}} className="filter-select">
                  <option value="">Tip: Tümü</option>
                  <option value="pdf">PDF</option>
                  <option value="image">Resimler</option>
                  <option value="video">Videolar</option>
                  <option value="zip">Sıkıştırılmış</option>
                  <option value="other">Diğer</option>
                </select>
                <select
                  value={`${sortKey}:${sortOrder}`}
                  onChange={e=>{
                    const [k,o] = e.target.value.split(":");
                    setSortKey(k); setSortOrder(o); setRefreshFlag(f=>f+1);
                  }}
                  className="filter-select"
                >
                  <option value="date:desc">Tarih (Yeni→Eski)</option>
                  <option value="date:asc">Tarih (Eski→Yeni)</option>
                  <option value="size:asc">Boyut (Küçük→Büyük)</option>
                  <option value="size:desc">Boyut (Büyük→Küçük)</option>
                  <option value="name:asc">İsim (A→Z)</option>
                  <option value="name:desc">İsim (Z→A)</option>
                </select>
              </div>
            </div>

            {/* Tüm dosyalar için liste görünümü (paylaşılanlar dahil) */}
            {files.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem', padding: '0 1rem' }}>
                {files.map((file) => {
                  const shareTime = showShared ? getShareTimeRemaining(file.shareExpiresAt || null) : null;
                  const isExpired = shareTime?.expired || false;
                  
                  return (
                  <div key={file.id} style={{ 
                    background: isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(30, 41, 59, 0.4)', 
                    border: `1px solid ${isExpired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.1)'}`, 
                    borderRadius: 12, 
                    padding: '0.875rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.1)';
                    e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
                  }}
                  >
                    {/* Dosya ikonu ve adı */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        width: 44, 
                        height: 44, 
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="#c4b5fd">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '0.875rem', 
                          fontWeight: 600, 
                          color: '#ffffff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {file.filename}
                        </h4>
                        <p style={{ 
                          margin: '0.125rem 0 0', 
                          fontSize: '0.75rem', 
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap'
                        }}>
                          <span>{formatSize(file.sizeBytes)}</span>
                          <span>•</span>
                          <span>{new Date(file.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                          {file.folder && !currentFolder && (
                            <>
                              <span>•</span>
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentFolder({
                                    id: file.folder!.id,
                                    name: file.folder!.name,
                                    createdAt: new Date().toISOString()
                                  });
                                  setRefreshFlag(f => f + 1);
                                }}
                                style={{ 
                                  color: '#a78bfa',
                                  cursor: 'pointer',
                                  transition: 'color 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontWeight: 500
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = '#c4b5fd'}
                                onMouseLeave={(e) => e.currentTarget.style.color = '#a78bfa'}
                              >
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                                {file.folder.name}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* İşlem butonları - Üç nokta menü */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      {showTrash ? (
                        <>
                          <button 
                            onClick={() => doRestoreFromTrash(file)} 
                            className="files-btn"
                            style={{ padding: '8px 16px', fontSize: '0.8125rem', borderRadius: 10, whiteSpace: 'nowrap', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}
                          >
                            Geri Yükle
                          </button>
                          <button 
                            onClick={() => setPermanentDeleteTarget(file)} 
                            className="files-btn"
                            style={{ padding: '8px 16px', fontSize: '0.8125rem', borderRadius: 10, whiteSpace: 'nowrap', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}
                          >
                            Kalıcı Sil
                          </button>
                        </>
                      ) : showShared ? (
                        <>
                          {/* Paylaşım Bilgileri - Tek Satır */}
                          <div style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            fontSize: '0.65rem',
                            color: '#94a3b8',
                            padding: '5px 10px',
                            background: 'rgba(139, 92, 246, 0.08)',
                            borderRadius: 6,
                            border: '1px solid rgba(139, 92, 246, 0.15)',
                            whiteSpace: 'nowrap'
                          }}>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              <span style={{ fontSize: '0.55rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Paylaşım</span>
                              <span style={{ color: '#cbd5e1' }}>📅 {new Date(file.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {new Date(file.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                            <span style={{ color: 'rgba(148, 163, 184, 0.3)' }}>|</span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              <span style={{ fontSize: '0.55rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bitiş</span>
                              <span style={{ color: '#cbd5e1' }}>⏰ {file.shareExpiresAt ? `${new Date(file.shareExpiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${new Date(file.shareExpiresAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Süresiz'}</span>
                            </span>
                            <span style={{ color: 'rgba(148, 163, 184, 0.3)' }}>|</span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              <span style={{ fontSize: '0.55rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>İzin</span>
                              <span style={{ 
                                padding: '1px 5px',
                                borderRadius: 3,
                                fontSize: '0.6rem',
                                fontWeight: 600,
                                background: file.sharePermission === 'DOWNLOAD' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(167, 139, 250, 0.2)',
                                color: file.sharePermission === 'DOWNLOAD' ? '#93c5fd' : '#c4b5fd'
                              }}>
                                {file.sharePermission === 'DOWNLOAD' ? 'İndirilebilir' : 'Görüntüleme'}
                              </span>
                            </span>
                            <span style={{ color: 'rgba(148, 163, 184, 0.3)' }}>|</span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              <span style={{ fontSize: '0.55rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Açılma</span>
                              <span style={{ color: '#8b5cf6', fontWeight: 600 }}>👁 {file.shareOpenCount || 0}</span>
                            </span>
                          </div>

                          {/* Aksiyon Butonları - Kompakt */}
                          <button 
                            onClick={() => openShare(file)} 
                            className="files-btn"
                            style={{ padding: '4px 10px', fontSize: '0.7rem', lineHeight: '1.2', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.35)', color: '#c4b5fd' }}
                          >
                            Düzenle
                          </button>
                          <button 
                            onClick={async () => {
                              if (file.shareToken) {
                                try {
                                  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
                                  let shareUrl = `${frontendUrl}/share/${file.shareToken}`;
                                  
                                  // Şifreli dosyalar için DEK fragment ekle
                                  if (file.isEncrypted && file.edek && file.edekIv) {
                                    const masterKey = getMasterKey();
                                    if (masterKey) {
                                      const edekBytes = b64ToU8(file.edek);
                                      const edekIvBytes = b64ToU8(file.edekIv);
                                      const plainDek = await aesGcmDecrypt(masterKey, edekIvBytes, edekBytes);
                                      const plainDekB64 = u8ToB64(plainDek);
                                      
                                      const encFragment = [
                                        plainDekB64,
                                        file.cipherIv || '',
                                        file.metaNameEnc || '',
                                        file.metaNameIv || ''
                                      ].map(v => encodeURIComponent(v || '')).join('.');
                                      
                                      shareUrl = `${frontendUrl}/share/${file.shareToken}#dek=${encFragment}`;
                                    }
                                  }
                                  
                                  // Clipboard API ile kopyala, fallback olarak textarea kullan
                                  try {
                                    await navigator.clipboard.writeText(shareUrl);
                                  } catch {
                                    // Fallback: textarea ile kopyala
                                    const textarea = document.createElement('textarea');
                                    textarea.value = shareUrl;
                                    textarea.style.position = 'fixed';
                                    textarea.style.left = '-9999px';
                                    document.body.appendChild(textarea);
                                    textarea.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(textarea);
                                  }
                                  showToast('Paylaşım linki kopyalandı!', 'success');
                                } catch (err) {
                                  console.error('Link kopyalama hatası:', err);
                                  showToast('Link kopyalanamadı', 'error');
                                }
                              }
                            }}
                            className="files-btn"
                            style={{ padding: '4px 10px', fontSize: '0.7rem', lineHeight: '1.2', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.25)', color: '#93c5fd' }}
                          >
                            Link Kopyala
                          </button>
                          <button 
                            onClick={() => {
                              setShareTarget(file);
                              setShowStopConfirm(true);
                            }}
                            className="files-btn"
                            style={{ padding: '4px 10px', fontSize: '0.7rem', lineHeight: '1.2', borderRadius: 6, whiteSpace: 'nowrap', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}
                          >
                            Kapat
                          </button>
                        </>
                      ) : (
                        /* Normal dosya görünümü - Üç nokta menü */
                        <div style={{ position: 'relative' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setFileContextMenu(
                                fileContextMenu?.fileId === file.id 
                                  ? null 
                                  : { fileId: file.id, x: rect.left - 150, y: rect.bottom + 5 }
                              );
                            }}
                            className="files-btn"
                            style={{
                              padding: '8px 12px',
                              fontSize: '1.2rem',
                              borderRadius: 10,
                              background: fileContextMenu?.fileId === file.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(100, 116, 139, 0.3)',
                              border: '1px solid ' + (fileContextMenu?.fileId === file.id ? 'rgba(139, 92, 246, 0.4)' : 'rgba(148, 163, 184, 0.4)'),
                              color: '#e2e8f0',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            ⋮
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                {showTrash ? (
                  <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                    <svg width="64" height="64" viewBox="0 0 20 20" fill="rgba(148, 163, 184, 0.3)" style={{ margin: '0 auto 1rem' }}>
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p style={{ fontSize: '1rem', color: '#94a3b8', margin: '0 0 0.5rem' }}>Çöp kutusu boş</p>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
                      {autoDeleteTrashDays === 0 
                        ? 'Silinen dosyalar otomatik olarak kalıcı silinmeyecektir'
                        : `Silinen dosyalar ${autoDeleteTrashDays} gün içinde otomatik olarak kalıcı silinecektir`
                      }
                    </p>
                  </div>
                ) : (
                  <div style={{ opacity: 0.6 }}>Dosya bulunamadı</div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals - kept from original */}
      {/* Storage Full Warning Modal */}
      {showStorageFullWarning && usage && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }} onClick={() => setShowStorageFullWarning(false)}>
          <div style={{ width: "min(480px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: 24, padding: 32, boxShadow: "0 20px 60px rgba(251, 191, 36, 0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '90px', 
                height: '90px', 
                margin: '0 auto 1.5rem', 
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.25))', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '3px solid rgba(251, 191, 36, 0.4)',
                boxShadow: '0 8px 32px rgba(251, 191, 36, 0.3)'
              }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 22, marginBottom: 14, color: '#fbbf24', fontWeight: 700 }}>Depolama Alanınız Dolu!</h3>
              <p style={{ fontSize: 15, color: '#cbd5e1', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
                Depolama alanınızın <strong style={{ color: '#fbbf24' }}>%{((usage.usedStorageBytes / usage.storageLimitBytes) * 100).toFixed(0)}</strong>'i kullanılmış durumda.
              </p>
              <div style={{ 
                background: 'rgba(251, 191, 36, 0.1)', 
                border: '1px solid rgba(251, 191, 36, 0.2)', 
                borderRadius: 16, 
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem'
              }}>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                  Kullanılan: <strong style={{ color: '#e2e8f0' }}>{(usage.usedStorageBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</strong> / {(usage.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                </p>
              </div>
              <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
                Yeni dosya yükleyebilmek için:<br/>
                • Gereksiz dosyaları silin<br/>
                • Çöp kutusunu boşaltın<br/>
                • Daha büyük bir plana yükseltin
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
              <button
                onClick={() => {
                  setShowStorageFullWarning(false);
                  setShowTrash(true);
                  setShowFavorites(false);
                  setShowShared(false);
                  setCurrentFolder(null);
                  setRefreshFlag(f => f + 1);
                }}
                style={{
                  padding: '0.875rem 1.25rem',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Çöp Kutusunu Temizle
              </button>
              <button
                onClick={() => setShowStorageFullWarning(false)}
                style={{
                  padding: '0.875rem 1.25rem',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = '#cbd5e1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }} onClick={() => setShowLogoutConfirm(false)}>
          <div style={{ width: "min(420px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                margin: '0 auto 1.5rem', 
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.25))', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '2px solid rgba(239, 68, 68, 0.3)',
                boxShadow: '0 8px 32px rgba(239, 68, 68, 0.2)'
              }}>
                <svg width="36" height="36" viewBox="0 0 20 20" fill="#ef4444">
                  <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 20, marginBottom: 12, color: '#f1f5f9', fontWeight: 700 }}>Çıkış Yap</h3>
              <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
                Hesabınızdan çıkış yapmak istediğinizden emin misiniz?
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button 
                onClick={() => setShowLogoutConfirm(false)} 
                style={{ 
                  padding: "10px 24px", 
                  fontSize: 14, 
                  borderRadius: 12, 
                  background: 'rgba(148,163,184,0.1)', 
                  border: '1px solid rgba(148,163,184,0.2)', 
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148,163,184,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(148,163,184,0.1)'}
              >
                İptal
              </button>
              <button 
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }} 
                style={{ 
                  padding: "10px 24px", 
                  fontSize: 14, 
                  borderRadius: 12, 
                  background: '#ef4444', 
                  border: 'none', 
                  color: 'white', 
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {creatingFolder && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }} onClick={() => setCreatingFolder(false)}>
          <div style={{ width: "min(480px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, marginBottom: 16, color: '#f1f5f9', fontWeight: 700 }}>Yeni Klasör Oluştur</h3>
            <input 
              value={newFolderName} 
              onChange={(e) => setNewFolderName(e.target.value)} 
              placeholder="Klasör adı" 
              style={{ width: '100%', background: "rgba(30,41,59,0.8)", border: "1px solid rgba(148,163,184,0.2)", padding: "12px 16px", borderRadius: 12, fontSize: 14, color: "#f1f5f9", marginBottom: 20, outline: 'none', transition: 'all 0.2s' }} 
              onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(148,163,184,0.2)'}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setCreatingFolder(false)} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1' }}>İptal</button>
              <button onClick={handleCreateFolder} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', border: 'none', color: 'white', fontWeight: 600 }}>Oluştur</button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Settings Modal */}
      {storageModalOpen && storageInfo && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.55)', zIndex:60 }}>
          <div style={{ width:'min(720px,92%)', background:'#0f172a', border:'1px solid #334155', borderRadius:22, padding:28 }}>
            <h3 style={{ margin:0, fontSize:18, marginBottom:20 }}>Depolama Ayarları</h3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:24, marginBottom:24 }}>
              <div style={{ flex:'1 1 260px' }}>
                <h4 style={{ margin:'0 0 12px', fontSize:14 }}>Mevcut Kullanım</h4>
                <p style={{ fontSize:12, color:'#94a3b8', margin:'0 0 8px' }}>Plan: <strong>{storageInfo.plan}</strong></p>
                <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10 }}>Aktif: {formatSizeFull(storageInfo.usedStorageBytes)} / {formatSizeFull(storageInfo.storageLimitBytes)}</div>
                <div style={{ height:8, borderRadius:6, background:'#1e293b', border:'1px solid #334155', overflow:'hidden', marginBottom:16 }}>
                  <div style={{ width:`${formatPercent(storageInfo.usedStorageBytes, storageInfo.storageLimitBytes)}%`, height:'100%', background:'linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa)' }} />
                </div>
                <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10 }}>Çöp: {formatSizeFull(storageInfo.trashStorageBytes)} / {formatSizeFull(storageInfo.trashLimitBytes)}</div>
                <div style={{ height:8, borderRadius:6, background:'#1e293b', border:'1px solid #334155', overflow:'hidden', marginBottom:12 }}>
                  <div style={{ width:`${formatPercent(storageInfo.trashStorageBytes, storageInfo.trashLimitBytes)}%`, height:'100%', background:'linear-gradient(90deg,#f87171,#fb7185,#f43f5e)' }} />
                </div>
                <p style={{ fontSize:11, color:'#64748b', marginTop:0 }}>
                  {autoDeleteTrashDays === 0
                    ? 'Çöp kutusundaki dosyalar otomatik olarak silinmeyecektir.'
                    : `Çöp kutusundaki dosyalar ${autoDeleteTrashDays} gün sonra otomatik silinir.`
                  }
                </p>
                <button onClick={()=>{ setStorageModalOpen(false); setShowEmptyTrashConfirm(true); }} className='btn-secondary' style={{ padding:'6px 14px', fontSize:12, borderRadius:999, marginTop:8 }}>Çöp Kutusunu Boşalt</button>
              </div>
              <div style={{ flex:'1 1 340px' }}>
                <h4 style={{ margin:'0 0 12px', fontSize:14 }}>Plan Seçimi</h4>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { key:'FREE', title:'Free', storage:'1 GB', trash:'1 GB' },
                    { key:'PRO', title:'Pro', storage:'100 GB', trash:'10 GB' },
                    { key:'BUSINESS', title:'Business', storage:'1 TB', trash:'50 GB' },
                  ].map(p => (
                    <label key={p.key} style={{ display:'flex', alignItems:'center', gap:12, background:'#1e293b', border:'1px solid #334155', padding:'10px 14px', borderRadius:12, cursor:'pointer' }}>
                      <input type='radio' name='plan' value={p.key} checked={selectedPlan===p.key} onChange={()=>setSelectedPlan(p.key)} />
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <span style={{ fontSize:13 }}>{p.title}</span>
                        <span style={{ fontSize:11, color:'#94a3b8' }}>Depolama: {p.storage} • Çöp: {p.trash}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:20 }}>
                  <button onClick={()=>setStorageModalOpen(false)} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999 }}>Kapat</button>
                  <button onClick={handlePlanSave} disabled={planUpdating} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999, background:'#1e293b' }}>
                    {planUpdating ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }}>
          <div style={{ width: "min(480px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin: 0, fontSize: 18, marginBottom: 8, color: '#f1f5f9', fontWeight: 700 }}>Dosyayı Yeniden Adlandır</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 0, marginBottom: 16 }}>Mevcut ad: <strong style={{ color: '#cbd5e1' }}>{renameTarget.filename}</strong></p>
            <input 
              value={renameValue} 
              onChange={(e)=>setRenameValue(e.target.value)} 
              placeholder="Yeni dosya adı" 
              style={{ width: "100%", background: "rgba(30,41,59,0.8)", border: "1px solid rgba(148,163,184,0.2)", padding: "12px 16px", borderRadius: 12, fontSize: 14, color: "#f1f5f9", marginBottom: 20, outline: 'none' }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(148,163,184,0.2)'}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={()=>setRenameTarget(null)} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1' }}>İptal</button>
              <button onClick={confirmRename} disabled={fileActionLoading[renameTarget.id]?.rename} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', border: 'none', color: 'white', fontWeight: 600 }}>
                {fileActionLoading[renameTarget.id]?.rename ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Download Confirm Modal */}
      {downloadTarget && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }}>
          <div style={{ width: "min(420px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin: 0, fontSize: 16, marginBottom: 12 }}>İndirme Onayı</h3>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 0, marginBottom: 16 }}>
              <strong>{downloadTarget.filename}</strong> dosyasını cihazına indirmek istiyor musun?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={()=>setDownloadTarget(null)} className="btn-secondary" style={{ padding: "8px 18px", fontSize: 12, borderRadius: 999 }}>Vazgeç</button>
              <button onClick={()=>{handleDownload(downloadTarget); setDownloadTarget(null);}} disabled={fileActionLoading[downloadTarget.id]?.download} className="btn-secondary" style={{ padding: "8px 18px", fontSize: 12, borderRadius: 999 }}>
                {fileActionLoading[downloadTarget.id]?.download ? "İndiriliyor..." : "İndir"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Share Modal - Yeni Tasarım */}
      {shareTarget && !showStopConfirm && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50, padding: 20 }}>
          <div style={{
            width: 'min(480px, 90%)',
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto',
            background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#8b5cf6' }}>
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>
                  {shareTarget.shareToken ? 'Paylaşımı Düzenle' : 'Dosya Paylaş'}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  <strong style={{ color: '#c4b5fd' }}>{shareTarget.filename}</strong>
                </p>
              </div>
            </div>

            {/* Zaten Paylaşılıyor Uyarısı */}
            {shareTarget.shareToken && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#fbbf24', flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', marginBottom: 2 }}>
                    Bu dosya zaten paylaşılıyor
                  </div>
                  <div style={{ fontSize: 11, color: '#fcd34d' }}>
                    Aşağıdan mevcut paylaşım ayarlarını düzenleyebilir veya paylaşımı durdurabilirsiniz.
                  </div>
                </div>
              </div>
            )}

            {/* Süre Seçim Modu */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Geçerlilik Süresi:
              </div>
              
              {/* Mod Seçici */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => setShareExpiryMode("hours")}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: shareExpiryMode === "hours" 
                      ? '1.5px solid rgba(139, 92, 246, 0.5)' 
                      : '1.5px solid rgba(148, 163, 184, 0.2)',
                    background: shareExpiryMode === "hours"
                      ? 'rgba(139, 92, 246, 0.15)'
                      : 'rgba(30, 41, 59, 0.5)',
                    color: shareExpiryMode === "hours" ? '#c4b5fd' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  ⏱️ Saat ile
                </button>
                <button
                  onClick={() => setShareExpiryMode("datetime")}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: shareExpiryMode === "datetime" 
                      ? '1.5px solid rgba(139, 92, 246, 0.5)' 
                      : '1.5px solid rgba(148, 163, 184, 0.2)',
                    background: shareExpiryMode === "datetime"
                      ? 'rgba(139, 92, 246, 0.15)'
                      : 'rgba(30, 41, 59, 0.5)',
                    color: shareExpiryMode === "datetime" ? '#c4b5fd' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  📅 Tarih ile
                </button>
              </div>

              {/* Saat Modu */}
              {shareExpiryMode === "hours" && (
                <>
                  <input
                    type="number"
                    min="1"
                    max="8760"
                    placeholder="Süre girin (saat cinsinden)"
                    value={shareExpiry === 'unlimited' ? '' : shareExpiry === '1h' ? '1' : shareExpiry === '1d' ? '24' : shareExpiry === '7d' ? '168' : shareExpiry}
                    onChange={(e) => {
                      const hours = e.target.value;
                      setShareExpiry(hours || 'unlimited');
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(30, 41, 59, 0.5)',
                      border: '1.5px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: 10,
                      color: '#e2e8f0',
                      fontSize: 13,
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                      e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                      e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                    }}
                  />
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 0 }}>
                    Boş bırakırsanız süresiz olacak. Maksimum 8760 saat (1 yıl)
                  </p>
                </>
              )}

              {/* Tarih/Saat Modu */}
              {shareExpiryMode === "datetime" && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Tarih</label>
                    <input
                      type="date"
                      value={shareExpiryDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setShareExpiryDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1.5px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: 10,
                        color: '#e2e8f0',
                        fontSize: 13,
                        outline: 'none',
                        transition: 'all 0.2s',
                        colorScheme: 'dark'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Saat</label>
                    <input
                      type="time"
                      value={shareExpiryTime}
                      onChange={(e) => setShareExpiryTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1.5px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: 10,
                        color: '#e2e8f0',
                        fontSize: 13,
                        outline: 'none',
                        transition: 'all 0.2s',
                        colorScheme: 'dark'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* İzin Seçimi */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                </svg>
                Paylaşım İzni:
              </div>
              <select
                value={sharePermission}
                onChange={(e) => {
                  const newPerm = e.target.value as "VIEW" | "DOWNLOAD" | "EDIT";
                  // Mevcut paylaşım varsa API'yi çağır, yoksa sadece state güncelle
                  if (shareTarget?.shareToken) {
                    handlePermissionChange(newPerm);
                  } else {
                    setSharePermission(newPerm);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1.5px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                }}
              >
                <option value="VIEW" style={{ background: '#1e293b', color: '#e2e8f0' }}>👁️ Sadece Görüntüleme</option>
                <option value="DOWNLOAD" style={{ background: '#1e293b', color: '#e2e8f0' }}>📥 Görüntüleme ve İndirme</option>
                <option value="EDIT" style={{ background: '#1e293b', color: '#e2e8f0' }}>✏️ Tüm İzinler (Düzenleme dahil)</option>
              </select>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                {sharePermission === 'VIEW' && '• Alıcı dosyayı sadece görüntüleyebilir, indiremez'}
                {sharePermission === 'DOWNLOAD' && '• Alıcı dosyayı görüntüleyebilir ve indirebilir'}
                {sharePermission === 'EDIT' && '• Alıcı dosyayı görüntüleyebilir, indirebilir ve düzenleyebilir'}
              </p>
            </div>

            {/* Paylaşım Linki */}
            {shareModalLink && (
              <div style={{ 
                marginBottom: 20,
                padding: '14px 16px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 12
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                  </svg>
                  Paylaşım Linki
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: 'center' }}>
                  <div style={{ 
                    flex: 1, 
                    padding: '8px 12px', 
                    background: 'rgba(30, 41, 59, 0.6)', 
                    borderRadius: 8, 
                    fontSize: 12, 
                    color: '#94a3b8',
                    wordBreak: 'break-all',
                    border: '1px solid rgba(148, 163, 184, 0.2)'
                  }}>
                    {shareModalLink}
                  </div>
                  <button 
                    onClick={async ()=>{ 
                      try { 
                        await navigator.clipboard.writeText(shareModalLink); 
                        setCopied(true); 
                        setTimeout(()=>setCopied(false),2500); 
                      } catch{} 
                    }} 
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      borderRadius: 8,
                      background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      border: copied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(99, 102, 241, 0.4)',
                      color: copied ? '#6ee7b7' : '#a5b4fc',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!copied) {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                      }
                    }}
                  >
                    {copied ? '✓ Kopyalandı' : 'Kopyala'}
                  </button>
                </div>

                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: 8, fontSize: 11, color: '#94a3b8' }}>
                  <div style={{ marginBottom: 4 }}>İzin: <strong style={{ color: '#c4b5fd' }}>{shareInfo?.permission ?? String(sharePermission)}</strong></div>
                  <div>Geçerlilik: <strong style={{ color: '#c4b5fd' }}>{shareInfo?.expiresAt ? formatDate(shareInfo.expiresAt) : (shareExpiry === 'unlimited' ? 'Sınırsız' : String(shareExpiry))}</strong></div>
                </div>

                {shareStatsLoading ? (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 10 }}>İstatistikler yükleniyor...</div>
                ) : shareStats ? (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', background: 'rgba(30, 41, 59, 0.5)', padding: 10, borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.2)' }}>
                    <div>Bu link <strong style={{ color: '#c4b5fd' }}>{shareStats.shareOpenCount}</strong> kez açıldı.</div>
                    <div>Son açılma: <strong style={{ color: '#c4b5fd' }}>{shareStats.shareLastOpenedAt ? formatDate(shareStats.shareLastOpenedAt) : '—'}</strong></div>
                    {shareStats.logs && shareStats.logs.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 4 }}>Son erişimler:</div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10 }}>
                          {shareStats.logs.slice(0,3).map((l:any, idx:number) => (
                            <li key={idx} style={{ marginBottom: 2 }}>{formatDate(l.openedAt)} {l.ipAddress ? `• ${l.ipAddress}` : l.userAgent ? `• ${String(l.userAgent).split(' ')[0]}` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: shareModalLink ? 'flex-end' : 'space-between', flexWrap: 'wrap' }}>
              {!shareModalLink && (
                <button 
                  onClick={()=>{setShareTarget(null); setShareModalLink(null);}} 
                  style={{
                    padding: '10px 20px',
                    fontSize: 13,
                    borderRadius: 10,
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                  }}
                >
                  İptal Et
                </button>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                {shareModalLink ? (
                  <button 
                    onClick={()=>{setShareTarget(null); setShareModalLink(null);}} 
                    style={{
                      padding: '10px 20px',
                      fontSize: 13,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                    }}
                  >
                    Kapat
                  </button>
                ) : (
                  <button 
                    onClick={generateShareLink} 
                    disabled={shareGenerating}
                    style={{
                      padding: '10px 20px',
                      fontSize: 13,
                      borderRadius: 10,
                      background: shareGenerating ? 'rgba(139, 92, 246, 0.1)' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      border: 'none',
                      color: shareGenerating ? '#a78bfa' : 'white',
                      cursor: shareGenerating ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: shareGenerating ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.4)',
                      opacity: shareGenerating ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!shareGenerating) {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!shareGenerating) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                      }
                    }}
                  >
                    {shareGenerating ? "Oluşturuluyor..." : (shareTarget.shareToken ? "Paylaşımı Güncelle" : "Link Oluştur")}
                  </button>
                )}
              </div>
            </div>
            <style jsx>{`
              /* Paylaşım modalinde layout ve spacing finetune edildi */
              .share-modal-card {
                width: min(520px, 92%);
                max-width: 520px;
                background: #0f172a;
                border: 1px solid #334155;
                border-radius: 18px;
                padding: 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
              }
              .share-controls { display: flex; gap: 20px; justify-content: space-between; align-items: flex-start; }
              .share-block { flex: 1 1 240px; }
              .block-title { font-size: 14px; font-weight: 500; color: #94a3b8; opacity: 0.85; margin-bottom: 6px; }
              .radio-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
              .radio-row.expiry-row { justify-content: space-between; gap: 16px; }
              .radio-row.permission-row { gap: 10px; }
              .radio-item { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
              .radio-item input[type="radio"] { accent-color: #f472b6; }
              .share-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
              @media (max-width: 640px) {
                .share-controls { flex-direction: column; }
                .share-block { width: 100%; }
                .share-footer { flex-direction: column-reverse; }
                .share-footer button { width: 100%; }
              }
            `}</style>
          </div>
        </div>
      )}
      
      {/* Paylaşımı Kapat Onay Modalı */}
      {showStopConfirm && shareTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)' }}>
          <div style={{ width:'min(420px,92%)', background:'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', backdropFilter:'blur(20px)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:24, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color:'#f1f5f9', fontSize:18, margin:0, marginBottom:12, fontWeight:700 }}>Paylaşımı Kapat</h3>
            <p style={{ color:'#94a3b8', fontSize:13, marginTop:0, marginBottom:20 }}>
              <strong style={{ color:'#cbd5e1' }}>{shareTarget.filename}</strong> dosyasının paylaşımını kapatmak istediğinizden emin misiniz? <span style={{ color:'#f1f5f9', fontWeight:600 }}>Link artık çalışmayacak ve erişim kayıtları silinecek.</span>
            </p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
              <button type="button" onClick={()=>{setShowStopConfirm(false); setShareTarget(null);}} disabled={isStoppingShare} className="btn-secondary" style={{ padding:'10px 20px', borderRadius:12, fontSize:13, background:'rgba(148,163,184,0.1)', border:'1px solid rgba(148,163,184,0.2)', color:'#cbd5e1', opacity: isStoppingShare?0.6:1 }}>İptal</button>
              <button type="button" onClick={handleConfirmStopShare} disabled={isStoppingShare} className="btn-secondary" style={{ padding:'10px 20px', borderRadius:12, fontSize:13, background:'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border:'none', color:'#fff', fontWeight:600, opacity: isStoppingShare?0.8:1 }}>
                {isStoppingShare ? 'Kapatılıyor...' : 'Evet, Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete (Move to Trash) Confirm Modal */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50 }}>
          <div style={{ width: "min(420px,90%)", background: "linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin: 0, fontSize: 18, marginBottom: 12, color: '#f1f5f9', fontWeight: 700 }}>Silme Onayı</h3>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 0, marginBottom: 20 }}><strong style={{ color: '#cbd5e1' }}>{deleteTarget.filename}</strong> dosyasını çöp kutusuna taşımak istiyor musun?</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={()=>setDeleteTarget(null)} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1' }}>İptal</button>
              <button onClick={confirmDelete} disabled={fileActionLoading[deleteTarget.id]?.delete} className="btn-secondary" style={{ padding: "10px 20px", fontSize: 14, borderRadius: 12, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'none', color: 'white', fontWeight: 600 }}>
                {fileActionLoading[deleteTarget.id]?.delete ? "Taşınıyor..." : "Taşı"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Permanent Delete Modal */}
      {permanentDeleteTarget && (
        <div style={{ position: "fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex:50 }}>
          <div style={{ width:"min(420px,90%)", background:"linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:24, padding:28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Kalıcı Silme</h3>
            <p style={{ fontSize:12, color:"#94a3b8", marginTop:0, marginBottom:16 }}><strong>{permanentDeleteTarget.filename}</strong> dosyasını kalıcı olarak silmek istiyor musun? Bu işlem geri alınamaz.</p>
            <div style={{ display:"flex", gap:12, justifyContent:"flex-end" }}>
              <button onClick={()=>setPermanentDeleteTarget(null)} className="btn-secondary" style={{ padding:"8px 18px", fontSize:12, borderRadius:999 }}>İptal</button>
              <button onClick={confirmPermanentDelete} className="btn-secondary" style={{ padding:"8px 18px", fontSize:12, borderRadius:999, borderColor:"rgba(248,113,113,0.7)", color:"#fecaca" }}>Kalıcı Sil</button>
            </div>
          </div>
        </div>
      )}
      {/* Permanent Delete Folder Modal */}
      {permanentDeleteFolderTarget && (
        <div style={{ position: "fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex:50 }}>
          <div style={{ width:"min(420px,90%)", background:"linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:24, padding:28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Kalıcı Silme</h3>
            <p style={{ fontSize:12, color:"#94a3b8", marginTop:0, marginBottom:16 }}><strong>{permanentDeleteFolderTarget.name}</strong> klasörünü ve tüm içeriğini kalıcı olarak silmek istiyor musun? Bu işlem geri alınamaz.</p>
            <div style={{ display:"flex", gap:12, justifyContent:"flex-end" }}>
              <button onClick={()=>setPermanentDeleteFolderTarget(null)} className="btn-secondary" style={{ padding:"8px 18px", fontSize:12, borderRadius:999 }}>İptal</button>
              <button onClick={confirmPermanentDeleteFolder} className="btn-secondary" style={{ padding:"8px 18px", fontSize:12, borderRadius:999, borderColor:"rgba(248,113,113,0.7)", color:"#fecaca" }}>Kalıcı Sil</button>
            </div>
          </div>
        </div>
      )}
      {/* Versions Modal */}
      {versionTarget && (
        <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex:50 }}>
          <div style={{ width:"min(520px,92%)", background:"linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:24, padding:28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Versiyonlar - {versionTarget.filename}</h3>
            {versionLoading && <p style={{ fontSize:12, color:"#94a3b8" }}>Yükleniyor...</p>}
            {!versionLoading && versionsList.length===0 && <p style={{ fontSize:12, color:"#94a3b8" }}>Hiç eski versiyon yok.</p>}
            {!versionLoading && versionsList.length>0 && (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:12 }}>
                <thead><tr style={{ color:"#94a3b8" }}><th style={{ textAlign:"left", padding:"4px" }}>Versiyon</th><th style={{ textAlign:"left", padding:"4px" }}>Boyut</th><th style={{ textAlign:"left", padding:"4px" }}>Tarih</th><th style={{ textAlign:"right", padding:"4px" }}>İşlem</th></tr></thead>
                <tbody>
                  {versionsList.map(v => (
                    <tr key={v.id}>
                      <td style={{ padding:"4px" }}>v{v.version}</td>
                      <td style={{ padding:"4px" }}>{formatSize(v.sizeBytes)}</td>
                      <td style={{ padding:"4px" }}>{formatDate(v.createdAt)}</td>
                      <td style={{ padding:"4px", textAlign:"right" }}>
                        <button onClick={()=>doRestoreVersion(v.version)} className="btn-secondary" style={{ padding:"4px 10px", fontSize:11, borderRadius:999 }}>Geri Yükle</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:12 }}>
              <button onClick={()=>setVersionTarget(null)} className="btn-secondary" style={{ padding:"8px 18px", fontSize:12, borderRadius:999 }}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Share Modal */}
      {folderShareTarget && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 50, padding: 20 }}>
          <div style={{
            width: 'min(480px, 90%)',
            background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 24,
            padding: 28,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#8b5cf6' }}>
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 18, marginBottom: 4, color: '#f1f5f9', fontWeight: 700 }}>Klasör Paylaş</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  <strong style={{ color: '#c4b5fd' }}>{folderShareTarget.name}</strong>
                </p>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 20, padding: '10px 14px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#a78bfa' }}>
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Klasördeki dosyalar paylaşılacak (alt klasörler hariç)
            </p>

            {/* Süre Girişi */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Süre (saat):
              </div>
              <input
                type="number"
                min="1"
                max="8760"
                placeholder="Süre girin (saat cinsinden)"
                value={folderShareExpiry === 'unlimited' ? '' : folderShareExpiry === '1h' ? '1' : folderShareExpiry === '1d' ? '24' : folderShareExpiry === '7d' ? '168' : folderShareExpiry}
                onChange={(e) => {
                  const hours = e.target.value;
                  setFolderShareExpiry(hours || 'unlimited');
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1.5px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                }}
              />
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 0 }}>
                Boş bırakırsanız süresiz olacak. Maksimum 8760 saat (1 yıl)
              </p>
            </div>

            {/* İzin Seçimi */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
                  <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                </svg>
                İzin:
              </div>
              <select
                value={folderSharePermission}
                onChange={(e) => setFolderSharePermission(e.target.value as "VIEW" | "DOWNLOAD")}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1.5px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                  e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                }}
              >
                <option value="VIEW" style={{ background: '#1e293b', color: '#e2e8f0' }}>Sadece görüntüleme</option>
                <option value="DOWNLOAD" style={{ background: '#1e293b', color: '#e2e8f0' }}>Sadece indirme</option>
                <option value="VIEW_DOWNLOAD" style={{ background: '#1e293b', color: '#e2e8f0' }}>Görüntüleme ve indirme</option>
                <option value="FULL" style={{ background: '#1e293b', color: '#e2e8f0' }}>Tüm izinler (görüntüleme, indirme, düzenleme)</option>
              </select>
            </div>

            {/* Paylaşım Linki */}
            {folderShareLink && (
              <div style={{ 
                marginBottom: 20,
                padding: '14px 16px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 12
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                  </svg>
                  Paylaşım Linki
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: 'center' }}>
                  <div style={{ 
                    flex: 1, 
                    padding: '8px 12px', 
                    background: 'rgba(30, 41, 59, 0.6)', 
                    borderRadius: 8, 
                    fontSize: 12, 
                    color: '#94a3b8',
                    wordBreak: 'break-all',
                    border: '1px solid rgba(148, 163, 184, 0.2)'
                  }}>
                    {folderShareLink}
                  </div>
                  <button 
                    onClick={async ()=>{ 
                      try { 
                        await navigator.clipboard.writeText(folderShareLink); 
                        setCopied(true); 
                        setTimeout(()=>setCopied(false),2500); 
                      } catch{} 
                    }} 
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      borderRadius: 8,
                      background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      border: copied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(99, 102, 241, 0.4)',
                      color: copied ? '#6ee7b7' : '#a5b4fc',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!copied) {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                      }
                    }}
                  >
                    {copied ? '✓ Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button 
                onClick={()=>{setFolderShareTarget(null); setFolderShareLink(null);}} 
                style={{
                  padding: '10px 20px',
                  fontSize: 13,
                  borderRadius: 10,
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(148, 163, 184, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                }}
              >
                Kapat
              </button>
              <button 
                onClick={generateFolderShareLink} 
                disabled={folderShareGenerating}
                style={{
                  padding: '10px 20px',
                  fontSize: 13,
                  borderRadius: 10,
                  background: folderShareGenerating ? 'rgba(139, 92, 246, 0.1)' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  color: folderShareGenerating ? '#a78bfa' : 'white',
                  cursor: folderShareGenerating ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  boxShadow: folderShareGenerating ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.4)',
                  opacity: folderShareGenerating ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!folderShareGenerating) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!folderShareGenerating) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                  }
                }}
              >
                {folderShareGenerating ? "Oluşturuluyor..." : "Link Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Context Menu */}
      {fileContextMenu && (() => {
        const file = files.find(f => f.id === fileContextMenu.fileId);
        if (!file) return null;
        return (
          <>
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
              onClick={() => setFileContextMenu(null)}
            />
            <div 
              ref={fileContextMenuRef}
              style={{
                position: 'fixed',
                left: Math.min(fileContextMenu.x, window.innerWidth - 200),
                top: Math.min(fileContextMenu.y, window.innerHeight - 400),
                background: 'rgba(15,23,42,0.98)',
                border: '1px solid rgba(148,163,184,0.3)',
                borderRadius: 12,
                padding: '8px',
                zIndex: 50,
                minWidth: '200px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(12px)'
              }}
            >
              {/* İndir */}
              <button
                onClick={() => {
                  handleDownload(file);
                  setFileContextMenu(null);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                İndir
              </button>

              {/* Görüntüle */}
              <button
                onClick={async () => {
                  setFileContextMenu(null);
                  handleView(file);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
                Görüntüle
              </button>

              {/* Yeniden Adlandır */}
              <button
                onClick={() => {
                  setRenameTarget(file);
                  setRenameValue(file.filename);
                  setFileContextMenu(null);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                  <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                </svg>
                Yeniden Adlandır
              </button>

              {/* Sürümler */}
              <button
                onClick={() => {
                  setVersionsTarget(file);
                  setFileContextMenu(null);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Sürümler
              </button>

              <div style={{ height: 1, background: 'rgba(148,163,184,0.2)', margin: '6px 0' }} />

              {/* Paylaş */}
              {!showHidden && (
                <button
                  onClick={() => {
                    setShareTarget(file);
                    setFileContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#c4b5fd',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                  </svg>
                  Paylaş
                </button>
              )}

              {/* Ekiple Paylaş */}
              {!showHidden && (
                <button
                  onClick={() => {
                    openTeamShare(file);
                    setFileContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#6ee7b7',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                  Ekiple Paylaş
                </button>
              )}

              {/* Favorilere Ekle/Çıkar */}
              {!showHidden && (
                <button
                  onClick={async () => {
                    await handleToggleFavorite(file);
                    setFileContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#fbbf24',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(251, 191, 36, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '16px' }}>{file.isFavorite ? '★' : '☆'}</span>
                  {file.isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                </button>
              )}

              <div style={{ height: 1, background: 'rgba(148,163,184,0.2)', margin: '6px 0' }} />

              {/* Gizle / Görünür Yap */}
              {!showTrash && (
                <button
                  onClick={async () => {
                    try {
                      await toggleFileHidden(file.id);
                      showToast(showHidden ? "Dosya görünür yapıldı" : "Dosya gizlendi", 'success');
                      setRefreshFlag(f => f + 1);
                    } catch (err: any) {
                      showToast(err.message || "İşlem başarısız", 'error');
                    }
                    setFileContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: showHidden ? '#86efac' : '#c4b5fd',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = showHidden ? 'rgba(34, 197, 94, 0.15)' : 'rgba(139, 92, 246, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '14px' }}>{showHidden ? '👁️' : '🔒'}</span>
                  {showHidden ? 'Görünür Yap' : 'Gizle'}
                </button>
              )}

              {/* Çöp Kutusuna Taşı */}
              <button
                onClick={() => {
                  setDeleteTarget(file);
                  setFileContextMenu(null);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fca5a5',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Çöp Kutusuna Taşı
              </button>
            </div>
          </>
        );
      })()}

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
            onClick={() => setFolderContextMenu(null)}
          />
          <div 
            style={{
              position: 'fixed',
              left: folderContextMenu.x,
              top: folderContextMenu.y,
              background: 'rgba(15,23,42,0.98)',
              border: '1px solid rgba(148,163,184,0.3)',
              borderRadius: 12,
              padding: '8px',
              zIndex: 50,
              minWidth: '180px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
            }}
          >
            {showTrash ? (
              // Çöp kutusundayken sadece geri yükle ve kalıcı sil
              <>
                <button
                  onClick={async () => {
                    const folder = folders.find(f => f.id === folderContextMenu.folderId);
                    if (folder) {
                      try {
                        await restoreFolder(folder.id);
                        showToast("Klasör geri yüklendi", 'success');
                        setRefreshFlag(f => f + 1);
                        const acc = await getAccountStorage();
                        if (acc) setStorageInfo(acc);
                      } catch (err: any) {
                        showToast(err.message || "Klasör geri yüklenemedi", 'error');
                      }
                    }
                    setFolderContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#22c55e',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Geri Yükle
                </button>
                <button
                  onClick={() => {
                    const folder = folders.find(f => f.id === folderContextMenu.folderId);
                    if (folder) {
                      setPermanentDeleteFolderTarget(folder);
                    }
                    setFolderContextMenu(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Kalıcı Sil
                </button>
              </>
            ) : (
              // Normal menü
              <>
            <button
              onClick={() => {
                const folder = folders.find(f => f.id === folderContextMenu.folderId);
                if (folder) {
                  handleOpenFolder(folder);
                }
                setFolderContextMenu(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              Klasörü Aç
            </button>
            <button
              onClick={() => {
                const folder = folders.find(f => f.id === folderContextMenu.folderId);
                if (folder) {
                  openFolderRename(folder);
                }
                setFolderContextMenu(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Yeniden Adlandır
            </button>
            <button
              onClick={() => {
                const folder = folders.find(f => f.id === folderContextMenu.folderId);
                if (folder) {
                  openFolderShare(folder);
                }
                setFolderContextMenu(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139,92,246,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
              </svg>
              Klasörü Paylaş
            </button>
            <button
              onClick={async () => {
                const folder = folders.find(f => f.id === folderContextMenu.folderId);
                if (folder) {
                  try {
                    await toggleFolderHidden(folder.id);
                    showToast(showHidden ? "Klasör görünür yapıldı" : "Klasör gizlendi", 'success');
                    setRefreshFlag(f=>f+1);
                  } catch (err: any) {
                    showToast(err.message || (showHidden ? "Klasör görünür yapılamadı" : "Klasör gizlenemedi"), 'error');
                  }
                }
                setFolderContextMenu(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: showHidden ? '#22c55e' : '#8b5cf6',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = showHidden ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {showHidden ? (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              )}
              {showHidden ? 'Klasörü Görünür Yap' : 'Klasörü Gizle'}
            </button>
            <button
              onClick={() => {
                const folder = folders.find(f => f.id === folderContextMenu.folderId);
                if (folder) {
                  openFolderDelete(folder);
                }
                setFolderContextMenu(null);
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                fontSize: '13px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Klasörü Sil
            </button>
            </>
            )}
          </div>
        </>
      )}
      
      {/* Versions Modal (versionsTarget) */}
      {versionsTarget && (
        <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex:50 }}>
          <div style={{ width:"min(580px,92%)", background:"linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)", backdropFilter: "blur(20px)", border:"1px solid rgba(148,163,184,0.2)", borderRadius:24, padding:28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin:0, fontSize:18, marginBottom:16, color:"#f1f5f9", fontWeight:700 }}>Dosya Sürümleri</h3>
            <p style={{ fontSize:13, color:"#94a3b8", marginTop:0, marginBottom:16 }}>
              <strong style={{ color:"#cbd5e1" }}>{versionsTarget.filename}</strong>
            </p>
            
            {versionLoading && <p style={{ fontSize:13, color:"#94a3b8", padding:20, textAlign:"center" }}>Sürümler yükleniyor...</p>}
            
            {!versionLoading && (
              <div style={{ maxHeight:400, overflowY:"auto" }}>
                {/* Güncel Sürüm - Asıl dosyanın kendisi */}
                <div style={{ 
                  background:"rgba(34,197,94,0.1)", 
                  border:"1px solid rgba(34,197,94,0.3)", 
                  borderRadius:12, 
                  padding:16, 
                  marginBottom:12 
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:14, fontWeight:600, color:"#86efac" }}>Güncel Sürüm</span>
                      <span style={{ 
                        fontSize:11, 
                        padding:"2px 8px", 
                        background:"rgba(34,197,94,0.2)", 
                        border:"1px solid rgba(34,197,94,0.4)",
                        borderRadius:999, 
                        color:"#86efac" 
                      }}>
                        AKTİF
                      </span>
                    </div>
                    <span style={{ fontSize:13, color:"#94a3b8" }}>{formatSize(versionsTarget.sizeBytes)}</span>
                  </div>
                  <p style={{ fontSize:12, color:"#94a3b8", margin:0 }}>
                    Son güncelleme: {formatDate(versionsTarget.updatedAt || versionsTarget.createdAt)}
                  </p>
                </div>

                {/* Eski Sürümler - Tüm FileVersion kayıtları */}
                {versionsList.length === 0 ? (
                  <p style={{ fontSize:13, color:"#94a3b8", padding:20, textAlign:"center", background:"rgba(15,23,42,0.5)", borderRadius:12 }}>
                    Henüz eski sürüm bulunmuyor
                  </p>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <p style={{ fontSize:12, color:"#94a3b8", fontWeight:600, marginBottom:4 }}>Eski Sürümler</p>
                    {versionsList.map((v, idx) => (
                      <div key={v.id} style={{ 
                        background:"rgba(15,23,42,0.6)", 
                        border:"1px solid rgba(148,163,184,0.1)", 
                        borderRadius:12, 
                        padding:12,
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"space-between"
                      }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:13, fontWeight:600, color:"#cbd5e1" }}>Sürüm {versionsList.length - idx}</span>
                            <span style={{ fontSize:12, color:"#94a3b8" }}>• {formatSize(v.sizeBytes)}</span>
                          </div>
                          <p style={{ fontSize:11, color:"#94a3b8", margin:0 }}>
                            {formatDate(v.createdAt)}
                          </p>
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          <button 
                            onClick={()=>doRestoreVersion(v.version)} 
                            style={{ 
                              padding:"6px 14px", 
                              fontSize:12, 
                              borderRadius:8,
                              background:"rgba(139,92,246,0.15)",
                              border:"1px solid rgba(139,92,246,0.3)",
                              color:"#c4b5fd",
                              cursor:"pointer",
                              fontWeight:600,
                              transition:"all 0.2s"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(139,92,246,0.25)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(139,92,246,0.15)";
                            }}
                          >
                            Geri Yükle
                          </button>
                          <button 
                            onClick={()=>setDeleteVersionConfirm({ versionId: v.id, version: v.version })} 
                            style={{ 
                              padding:"6px 14px", 
                              fontSize:12, 
                              borderRadius:8,
                              background:"rgba(239,68,68,0.15)",
                              border:"1px solid rgba(239,68,68,0.3)",
                              color:"#fca5a5",
                              cursor:"pointer",
                              fontWeight:600,
                              transition:"all 0.2s"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(239,68,68,0.25)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div style={{ display:"flex", justifyContent:"flex-end", gap:12, marginTop:20 }}>
              <button 
                onClick={()=>setVersionsTarget(null)} 
                style={{ 
                  padding:"10px 20px", 
                  fontSize:14, 
                  borderRadius:12,
                  background:"rgba(148,163,184,0.1)",
                  border:"1px solid rgba(148,163,184,0.2)",
                  color:"#cbd5e1",
                  cursor:"pointer",
                  fontWeight:600,
                  transition:"all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(148,163,184,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(148,163,184,0.1)";
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Folder Rename Modal */}
      {folderRenameTarget && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex:50 }}>
          <div style={{ width:'min(420px,90%)', background:'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', backdropFilter: 'blur(20px)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:24, padding:28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Klasörü Yeniden Adlandır</h3>
            <p style={{ fontSize:12, color:'#94a3b8', marginTop:0, marginBottom:12 }}>Mevcut ad: <strong>{folderRenameTarget.name}</strong></p>
            <input value={folderRenameValue} onChange={e=>setFolderRenameValue(e.target.value)} placeholder='Yeni klasör adı' style={{ width:'100%', background:'#1e293b', border:'1px solid #334155', padding:'10px 12px', borderRadius:10, fontSize:13, color:'#f1f5f9', marginBottom:16 }} />
            <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
              <button onClick={()=>setFolderRenameTarget(null)} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999 }}>İptal</button>
              <button onClick={confirmFolderRename} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999 }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
      {/* Folder Delete Modal */}
      {folderDeleteTarget && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex:50 }}>
          <div style={{ width:'min(440px,90%)', background:'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', backdropFilter: 'blur(20px)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:24, padding:28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Klasörü Sil</h3>
            <p style={{ fontSize:12, color:'#94a3b8', marginTop:0, marginBottom:16 }}><strong>{folderDeleteTarget.name}</strong> klasörü ve içindeki tüm alt klasör ve dosyalar çöp kutusuna taşınacak. Daha sonra geri yükleyebilirsin. Devam etmek istiyor musun?</p>
            <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
              <button onClick={()=>setFolderDeleteTarget(null)} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999 }}>İptal</button>
              <button onClick={confirmFolderDelete} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999, borderColor:'rgba(248,113,113,0.7)', color:'#fecaca' }}>Çöp Kutusuna Taşı</button>
            </div>
          </div>
        </div>
      )}
      {/* Empty Trash Confirm Modal */}
      {showEmptyTrashConfirm && (
        <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex:70 }}>
          <div style={{ width:'min(460px,90%)', background:'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', backdropFilter: 'blur(20px)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:24, padding:28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin:0, fontSize:16, marginBottom:12 }}>Çöp Kutusunu Boşalt</h3>
            <p style={{ fontSize:12, color:'#94a3b8', marginTop:0, marginBottom:18 }}>
              Çöp kutusundaki tüm dosyaları kalıcı olarak silmek üzeresin. Bu işlem geri alınamaz. Devam etmek istiyor musun?
            </p>
            <div style={{ display:'flex', gap:12, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button onClick={()=>setShowEmptyTrashConfirm(false)} disabled={emptyingTrash} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999 }}>Vazgeç</button>
              <button onClick={handleEmptyTrash} disabled={emptyingTrash} className='btn-secondary' style={{ padding:'8px 18px', fontSize:12, borderRadius:999, borderColor:'rgba(248,113,113,0.7)', color:'#fecaca', background: emptyingTrash? '#1e293b': undefined }}>
                {emptyingTrash ? 'Boşaltılıyor...' : 'Evet, Boşalt'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Etkinlik Temizleme Onay Modalı */}
      {showClearActivitiesConfirm && (
        <div 
          onClick={() => !clearingActivities && setShowClearActivitiesConfirm(false)}
          style={{ 
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(0,0,0,0.7)', 
            backdropFilter: 'blur(8px)', 
            zIndex: 9999 
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: 'min(420px, 90%)', 
              background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
              backdropFilter: 'blur(20px)', 
              border: '1px solid rgba(148,163,184,0.2)', 
              borderRadius: 24, 
              padding: 28, 
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)' 
            }}
          >
            {/* Başlık */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ 
                width: 48, 
                height: 48, 
                background: 'rgba(239, 68, 68, 0.15)', 
                borderRadius: 12, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#ffffff' }}>
                  Etkinlik Geçmişini Temizle
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                  {activities.length} etkinlik silinecek
                </p>
              </div>
            </div>
            
            {/* Uyarı Mesajı */}
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: 12, 
              padding: 16, 
              marginBottom: 24 
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="#f87171" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: '#fecaca', fontWeight: 500 }}>
                    Bu işlem geri alınamaz!
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: '#fca5a5', marginTop: 6, lineHeight: 1.5 }}>
                    Tüm etkinlik geçmişiniz (dosya paylaşımları, indirmeler, yüklemeler vb.) kalıcı olarak silinecektir.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Butonlar */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowClearActivitiesConfirm(false)} 
                disabled={clearingActivities}
                style={{ 
                  padding: '10px 20px', 
                  fontSize: 14, 
                  fontWeight: 500,
                  borderRadius: 10, 
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: clearingActivities ? 'not-allowed' : 'pointer',
                  opacity: clearingActivities ? 0.5 : 1,
                  transition: 'all 0.2s'
                }}
              >
                İptal
              </button>
              <button 
                onClick={confirmClearActivities} 
                disabled={clearingActivities}
                style={{ 
                  padding: '10px 20px', 
                  fontSize: 14, 
                  fontWeight: 600,
                  borderRadius: 10, 
                  border: 'none',
                  background: clearingActivities 
                    ? 'rgba(239, 68, 68, 0.3)' 
                    : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  cursor: clearingActivities ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: clearingActivities ? 'none' : '0 4px 15px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                {clearingActivities ? (
                  <>
                    <div style={{
                      width: 16,
                      height: 16,
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Siliniyor...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Evet, Tümünü Sil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Ekiple Paylaş Modal */}
      {teamShareTarget && (
        <div 
          onClick={() => setTeamShareTarget(null)}
          style={{ 
            position: 'fixed', 
            inset: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(0,0,0,0.7)', 
            backdropFilter: 'blur(8px)', 
            zIndex: 70 
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: 'min(480px, 90%)', 
              background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
              backdropFilter: 'blur(20px)', 
              border: '1px solid rgba(148,163,184,0.2)', 
              borderRadius: 24, 
              padding: 28, 
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                background: 'rgba(16, 185, 129, 0.15)', 
                borderRadius: '10px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="#10b981">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#ffffff' }}>
                  Ekiple Paylaş
                </h3>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8' }}>
                  {teamShareTarget.filename}
                </p>
              </div>
            </div>

            {userTeams.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem 1rem', 
                background: 'rgba(30, 41, 59, 0.5)', 
                borderRadius: '12px',
                border: '1px dashed rgba(148, 163, 184, 0.2)'
              }}>
                <svg width="48" height="48" viewBox="0 0 20 20" fill="rgba(148, 163, 184, 0.3)" style={{ margin: '0 auto 1rem' }}>
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                </svg>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                  Henüz bir ekibe üye değilsiniz veya dosya paylaşma yetkiniz yok.
                </p>
                <button
                  onClick={() => {
                    setTeamShareTarget(null);
                    router.push('/files/team');
                  }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Ekip Oluştur
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.8125rem', 
                    fontWeight: 500, 
                    color: '#94a3b8', 
                    marginBottom: '0.5rem' 
                  }}>
                    Ekip Seç
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '10px',
                      color: '#e2e8f0',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Bir ekip seçin...</option>
                    {userTeams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.role === 'OWNER' ? 'Sahip' : team.role === 'ADMIN' ? 'Yönetici' : 'Editör'})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ 
                  padding: '1rem', 
                  background: 'rgba(16, 185, 129, 0.1)', 
                  borderRadius: '10px', 
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  marginBottom: '1.5rem'
                }}>
                  <p style={{ 
                    margin: 0, 
                    fontSize: '0.8125rem', 
                    color: '#6ee7b7',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    Dosya ekibin tüm üyelerine görünür olacaktır.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setTeamShareTarget(null)} 
                    disabled={teamShareLoading}
                    style={{ 
                      padding: '0.625rem 1.25rem', 
                      fontSize: '0.875rem', 
                      borderRadius: '10px',
                      background: 'rgba(148, 163, 184, 0.1)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      color: '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    İptal
                  </button>
                  <button 
                    onClick={handleShareWithTeam} 
                    disabled={!selectedTeamId || teamShareLoading}
                    style={{ 
                      padding: '0.625rem 1.25rem', 
                      fontSize: '0.875rem', 
                      borderRadius: '10px',
                      background: !selectedTeamId || teamShareLoading ? 'rgba(16, 185, 129, 0.3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: !selectedTeamId || teamShareLoading ? '#6ee7b7' : 'white',
                      fontWeight: 600,
                      cursor: !selectedTeamId || teamShareLoading ? 'not-allowed' : 'pointer',
                      opacity: !selectedTeamId || teamShareLoading ? 0.7 : 1
                    }}
                  >
                    {teamShareLoading ? 'Paylaşılıyor...' : 'Ekiple Paylaş'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
