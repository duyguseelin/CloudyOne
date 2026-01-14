"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  getStoredUser, 
  clearAuth, 
  listTeamMembers, 
  inviteTeamMember, 
  cancelTeamInvite, 
  removeTeamMember,
  updateTeamMemberRole,
  listTeamFiles,
  deleteTeamFile,
  deleteTeamFolder,
  createTeamFolder,
  uploadTeamFile,
  listMyTeams,
  leaveTeam,
  getTeamFileDownloadUrl,
  getTeamFileViewUrl,
  listFileComments,
  addFileComment,
  deleteFileComment,
  getPendingTeamInvites,
  acceptTeamInvite,
  declineTeamInvite
} from "../../../lib/api";
import { getMasterKey, b64ToU8, u8ToB64, aesGcmDecrypt } from "../../../lib/crypto";
import Sidebar from "../../../components/Sidebar";
import "../../globals.css";

type TeamMember = {
  id: string;
  odSer?: string;
  email: string;
  name?: string;
  role: 'VIEWER' | 'DOWNLOADER' | 'MANAGER' | 'ADMIN' | 'EDITOR' | 'MEMBER';
  status: 'active' | 'invited';
  joinedAt?: string;
  expiresAt?: string;
};

// Rol yetkileri
type Permission = 'view' | 'download' | 'upload' | 'delete' | 'manage' | 'comment';
const rolePermissions: Record<string, Permission[]> = {
  'VIEWER': ['view', 'comment', 'upload'],
  'MEMBER': ['view', 'download', 'comment', 'upload'],
  'EDITOR': ['view', 'download', 'upload', 'delete', 'comment'],
  'OWNER': ['view', 'download', 'upload', 'delete', 'manage', 'comment']
};

const hasPermission = (role: string, action: Permission): boolean => {
  return rolePermissions[role]?.includes(action) || false;
};

// Yorum tipi
type FileComment = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    profilePhoto?: string;
  };
};

type TeamFile = {
  id: string;
  filename: string;
  originalName?: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: string;
  // Şifreleme bilgileri
  isEncrypted?: boolean;
  encryptionVersion?: string;
  cipherIv?: string;
  metaNameEnc?: string;
  metaNameIv?: string;
  // Ekip DEK bilgileri (ekip üyeleri için)
  teamDek?: string;
  teamDekIv?: string;
};

type TeamFolder = {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
};

type JoinedTeam = {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  owner: string;
  role: string;
  joinedAt: string;
};

type PendingInvite = {
  id: string;
  email: string;
  teamId: string;
  teamName: string;
  teamDescription?: string;
  invitedBy: string;
  inviterName?: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export default function TeamPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);
  const [teamName, setTeamName] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'members' | 'files' | 'joined' | 'incoming'>('members');
  
  // Dahil olunan ekipler
  const [joinedTeams, setJoinedTeams] = useState<JoinedTeam[]>([]);
  const [selectedJoinedTeam, setSelectedJoinedTeam] = useState<JoinedTeam | null>(null);
  const [joinedTeamFiles, setJoinedTeamFiles] = useState<TeamFile[]>([]);
  const [joinedTeamFolders, setJoinedTeamFolders] = useState<TeamFolder[]>([]);
  const [joinedCurrentFolderId, setJoinedCurrentFolderId] = useState<string | null>(null);
  const [joinedFilesLoading, setJoinedFilesLoading] = useState(false);
  
  // Gelen ekip davetleri
  const [incomingInvites, setIncomingInvites] = useState<PendingInvite[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState<string | null>(null);
  const [decliningInvite, setDecliningInvite] = useState<string | null>(null);
  
  // Email'den gelen davet modal
  const [showEmailInviteModal, setShowEmailInviteModal] = useState(false);
  const [emailInvite, setEmailInvite] = useState<PendingInvite | null>(null);
  
  // Ekip dosyaları state
  const [teamFiles, setTeamFiles] = useState<TeamFile[]>([]);
  const [teamFolders, setTeamFolders] = useState<TeamFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'VIEWER' | 'MEMBER' | 'EDITOR' | 'OWNER'>('VIEWER');
  const [filesLoading, setFilesLoading] = useState(false);
  
  // Klasör oluşturma
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Dosya yükleme
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  // Dosya işlemleri state'leri
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  
  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'VIEWER' | 'MEMBER' | 'EDITOR'>('VIEWER');
  const [inviting, setInviting] = useState(false);
  
  // Yorum Modal states
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [commentsFile, setCommentsFile] = useState<TeamFile | null>(null);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  
  // Delete Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder', id: string, name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Toast
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
  const toastIdRef = useRef(0);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const loadTeamData = async () => {
    try {
      const data = await listTeamMembers();
      setTeamName(data.teamName || "");
      setTeamId(data.teamId || "");
      setTeamMembers(data.members || []);
      setPendingInvites(data.pendingInvites || []);
      
      // Ekip dosyalarını yükle
      if (data.teamId) {
        loadTeamFiles(data.teamId);
      }
      
      // Dahil olunan ekipleri yükle
      loadJoinedTeams();
      
      // Gelen daveti yükle
      loadIncomingInvites();
    } catch (err) {
      console.error("Ekip verileri yüklenemedi:", err);
    }
  };
  
  const loadJoinedTeams = async () => {
    try {
      const data = await listMyTeams();
      setJoinedTeams(data.member || []);
    } catch (err) {
      console.error("Dahil olunan ekipler yüklenemedi:", err);
    }
  };
  
  const loadIncomingInvites = async () => {
    setIncomingLoading(true);
    try {
      const data = await getPendingTeamInvites();
      setIncomingInvites(data.invites || []);
    } catch (err) {
      console.error("Gelen daveti yüklenemedi:", err);
      setIncomingInvites([]);
    } finally {
      setIncomingLoading(false);
    }
  };
  
  const loadJoinedTeamFiles = async (tId: string, folderId?: string | null) => {
    setJoinedFilesLoading(true);
    try {
      const data = await listTeamFiles(tId, folderId || undefined);
      setJoinedTeamFiles(data.files || []);
      setJoinedTeamFolders(data.folders || []);
    } catch (err) {
      console.error("Ekip dosyaları yüklenemedi:", err);
    } finally {
      setJoinedFilesLoading(false);
    }
  };

  const loadTeamFiles = async (tId?: string, folderId?: string | null) => {
    const targetTeamId = tId || teamId;
    if (!targetTeamId) return;
    
    setFilesLoading(true);
    try {
      const data = await listTeamFiles(targetTeamId, folderId || undefined);
      setTeamFiles(data.files || []);
      setTeamFolders(data.folders || []);
      setUserRole(data.userRole || 'VIEWER');
    } catch (err) {
      console.error("Ekip dosyaları yüklenemedi:", err);
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(stored);
    
    // Ekip verilerini yükle
    loadTeamData().finally(() => {
      setLoading(false);
      
      // Login'den gelen invite token'ı kontrol et
      const inviteToken = localStorage.getItem('inviteToken');
      if (inviteToken) {
        localStorage.removeItem('inviteToken');
        // Modal göster ve invite'ı yükle
        setShowEmailInviteModal(true);
      }
    });
  }, [router]);
  
  // Email invite modal açılırsa pending invite'ları yükle
  useEffect(() => {
    if (showEmailInviteModal && !emailInvite && incomingInvites.length === 0) {
      (async () => {
        await loadIncomingInvites();
      })();
    }
  }, [showEmailInviteModal, emailInvite]);
  
  // incomingInvites yüklenirse ve modal açıksa göster
  useEffect(() => {
    if (showEmailInviteModal && incomingInvites.length > 0 && !emailInvite) {
      setEmailInvite(incomingInvites[0]);
    }
  }, [incomingInvites, showEmailInviteModal, emailInvite]);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      showToast("E-posta adresi gerekli", "error");
      return;
    }

    // E-posta validasyonu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      showToast("Geçerli bir e-posta adresi girin", "error");
      return;
    }
    
    setInviting(true);
    try {
      const result = await inviteTeamMember(inviteEmail, inviteRole);
      showToast(result.message || `${inviteEmail} adresine davet gönderildi`, "success");
      setInviteEmail("");
      setShowInviteModal(false);
      // Listeyi yenile
      loadTeamData();
    } catch (err: any) {
      let errorMessage = err.message || "Davet gönderilemedi";
      
      // Hata tipine göre mesaj özelleştir
      if (err.message?.includes("403") || err.message?.includes("Yetkisiz") || err.message?.includes("Forbidden")) {
        errorMessage = "Davet göndermek için yetkiniz yok. Lütfen sayfayı yenileyip tekrar deneyin veya çıkış yapıp giriş yapınız.";
      } else if (err.message?.includes("farklı")) {
        errorMessage = "Davet farklı bir e-posta adresine gönderilmiş olabilir. Lütfen o e-postaya giriş yapınız.";
      } else if (err.message?.includes("zaten")) {
        errorMessage = errorMessage; // Olduğu gibi bırak
      } else {
        errorMessage = errorMessage + " Lütfen e-posta adresini kontrol edip tekrar deneyin.";
      }
      
      showToast(errorMessage, "error");
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await cancelTeamInvite(inviteId);
      showToast("Davet iptal edildi", "success");
      loadTeamData();
    } catch (err: any) {
      showToast(err.message || "Davet iptal edilemedi", "error");
    }
  };

  const handleAcceptIncomingInvite = async (inviteId: string) => {
    setAcceptingInvite(inviteId);
    try {
      const invite = incomingInvites.find(i => i.id === inviteId);
      if (!invite) {
        showToast("Davet bulunamadı", "error");
        return;
      }
      
      // Token'ı kullanarak daveti kabul et
      await acceptTeamInvite(invite.id);
      showToast(`${invite.teamName} ekibine başarıyla katıldınız!`, "success");
      
      // Listeyi yenile
      loadIncomingInvites();
      loadJoinedTeams();
    } catch (err: any) {
      showToast(err.message || "Davet kabul edilemedi", "error");
    } finally {
      setAcceptingInvite(null);
    }
  };

  const handleDeclineIncomingInvite = async (inviteId: string) => {
    setDecliningInvite(inviteId);
    try {
      const invite = incomingInvites.find(i => i.id === inviteId);
      if (!invite) {
        showToast("Davet bulunamadı", "error");
        return;
      }
      
      // Daveti reddet
      await declineTeamInvite(inviteId);
      showToast(`${invite.teamName} ekibine katılma isteği reddedildi`, "success");
      
      // Listeyi yenile
      loadIncomingInvites();
    } catch (err: any) {
      showToast(err.message || "Davet reddedilemedi", "error");
    } finally {
      setDecliningInvite(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Bu üyeyi ekipten çıkarmak istediğinize emin misiniz?")) return;
    
    try {
      await removeTeamMember(memberId);
      showToast("Üye ekipten çıkarıldı", "success");
      loadTeamData();
    } catch (err: any) {
      showToast(err.message || "Üye çıkarılamadı", "error");
    }
  };

  const handleRoleChange = async (memberId: string, newRole: 'VIEWER' | 'MEMBER' | 'EDITOR') => {
    try {
      await updateTeamMemberRole(memberId, newRole);
      showToast("Rol güncellendi", "success");
      loadTeamData();
    } catch (err: any) {
      showToast(err.message || "Rol güncellenemedi", "error");
    }
  };

  // Yorum fonksiyonları
  const openCommentsModal = async (file: TeamFile) => {
    setCommentsFile(file);
    setShowCommentsModal(true);
    setCommentsLoading(true);
    try {
      const data = await listFileComments(file.id);
      setComments(data.comments || []);
    } catch (err: any) {
      showToast(err.message || "Yorumlar yüklenemedi", "error");
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !commentsFile) return;
    
    setAddingComment(true);
    try {
      const data = await addFileComment(commentsFile.id, newComment.trim());
      setComments(prev => [data.comment, ...prev]);
      setNewComment('');
      showToast("Yorum eklendi", "success");
    } catch (err: any) {
      showToast(err.message || "Yorum eklenemedi", "error");
    } finally {
      setAddingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;
    
    try {
      await deleteFileComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      showToast("Yorum silindi", "success");
    } catch (err: any) {
      showToast(err.message || "Yorum silinemedi", "error");
    }
  };

  // Ekip dosyası silme
  const handleDeleteFile = (fileId: string) => {
    const file = [...teamFiles, ...joinedTeamFiles].find(f => f.id === fileId);
    setDeleteTarget({ 
      type: 'file', 
      id: fileId, 
      name: file?.filename || 'Dosya' 
    });
    setShowDeleteModal(true);
  };

  // Ekip klasörü silme
  const handleDeleteFolder = (folderId: string) => {
    const folder = [...teamFolders, ...joinedTeamFolders].find(f => f.id === folderId);
    setDeleteTarget({ 
      type: 'folder', 
      id: folderId, 
      name: folder?.name || 'Klasör' 
    });
    setShowDeleteModal(true);
  };

  // Silme işlemini gerçekleştir
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'file') {
        await deleteTeamFile(deleteTarget.id);
        showToast("Dosya silindi", "success");
      } else {
        await deleteTeamFolder(deleteTarget.id);
        showToast("Klasör silindi", "success");
      }
      
      // Aktif sekmeye göre doğru veriyi yükle
      if (activeTab === 'joined' && selectedJoinedTeam) {
        loadTeamFiles(selectedJoinedTeam.id, currentFolderId);
      } else {
        loadTeamFiles(teamId, currentFolderId);
      }
      
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (err: any) {
      showToast(err.message || "Silinemedi", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Dosya indirme
  const handleDownloadFile = async (file: TeamFile) => {
    try {
      showToast("İndirme başlatılıyor...", "success");
      
      // Şifreli ekip dosyası için client-side decrypt
      if (file.isEncrypted && file.teamDek && file.cipherIv) {
        const url = await getTeamFileDownloadUrl(file.id);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Dosya indirilemedi");
        
        const encryptedData = new Uint8Array(await response.arrayBuffer());
        const dek = b64ToU8(file.teamDek);
        const iv = b64ToU8(file.cipherIv);
        
        // Client-side decrypt
        const decryptedData = await aesGcmDecrypt(encryptedData, dek, iv);
        
        // Dosya adını çöz
        let filename = file.filename;
        if (file.metaNameEnc && file.metaNameIv) {
          const nameBytes = b64ToU8(file.metaNameEnc);
          const nameIv = b64ToU8(file.metaNameIv);
          const decryptedName = await aesGcmDecrypt(nameBytes, dek, nameIv);
          filename = new TextDecoder().decode(decryptedName);
        } else if (file.originalName) {
          filename = file.originalName;
        }
        
        // Blob oluştur ve indir
        const blob = new Blob([Buffer.from(decryptedData)], { type: file.mimeType || 'application/octet-stream' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        
        showToast("Dosya indirildi", "success");
      } else {
        // Şifresiz dosya - doğrudan indir
        const url = await getTeamFileDownloadUrl(file.id);
        
        // Fetch yaparak dosyayı indir
        const response = await fetch(url);
        if (!response.ok) throw new Error("Dosya indirilemedi");
        
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = file.originalName || file.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        
        showToast("Dosya indirildi", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Dosya indirilemedi", "error");
    }
  };

  // Dosya önizleme
  const handlePreviewFile = async (file: TeamFile) => {
    try {
      const url = await getTeamFileViewUrl(file.id);
      setPreviewUrl(url);
      setSelectedFile(file);
      setShowPreviewModal(true);
    } catch (err: any) {
      showToast(err.message || "Dosya önizlenemedi", "error");
    }
  };

  // Dosya türüne göre önizleme yapılabilir mi kontrol et
  const canPreview = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || 
           mimeType === 'application/pdf' ||
           mimeType.startsWith('video/') ||
           mimeType.startsWith('audio/') ||
           mimeType.startsWith('text/');
  };

  // Yeni klasör oluştur
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      showToast("Klasör adı gerekli", "error");
      return;
    }
    try {
      // Dahil olunan ekip için mi yoksa kendi ekibimiz için mi kontrol et
      const targetTeamId = selectedJoinedTeam ? selectedJoinedTeam.id : teamId;
      const targetFolderId = selectedJoinedTeam ? joinedCurrentFolderId : currentFolderId;
      
      await createTeamFolder(targetTeamId, newFolderName.trim(), targetFolderId || undefined);
      showToast("Klasör oluşturuldu", "success");
      setNewFolderName('');
      setShowNewFolderModal(false);
      
      // İlgili listeyi yenile
      if (selectedJoinedTeam) {
        loadJoinedTeamFiles(targetTeamId, targetFolderId);
      } else {
        loadTeamFiles(targetTeamId, targetFolderId);
      }
    } catch (err: any) {
      showToast(err.message || "Klasör oluşturulamadı", "error");
    }
  };

  // Dosya yükle
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Dahil olunan ekip için mi yoksa kendi ekibimiz için mi kontrol et
    const targetTeamId = selectedJoinedTeam ? selectedJoinedTeam.id : teamId;
    const targetFolderId = selectedJoinedTeam ? joinedCurrentFolderId : currentFolderId;
    
    if (!targetTeamId) return;
    
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadTeamFile(targetTeamId, files[i], targetFolderId || undefined);
      }
      showToast(`${files.length} dosya yüklendi`, "success");
      
      // İlgili listeyi yenile
      if (selectedJoinedTeam) {
        loadJoinedTeamFiles(targetTeamId, targetFolderId);
      } else {
        loadTeamFiles(targetTeamId, targetFolderId);
      }
    } catch (err: any) {
      showToast(err.message || "Dosya yüklenemedi", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Dosyaları yükle (buton ile)
  const handleUploadFiles = async (files: File[]) => {
    if (!files || files.length === 0 || !teamId) return;
    
    setUploading(true);
    try {
      for (const file of files) {
        await uploadTeamFile(teamId, file, currentFolderId || undefined);
      }
      showToast(`${files.length} dosya yüklendi`, "success");
      loadTeamFiles(teamId, currentFolderId);
    } catch (err: any) {
      showToast(err.message || "Dosya yüklenemedi", "error");
    } finally {
      setUploading(false);
    }
  };

  // Klasöre gir
  const handleOpenFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    loadTeamFiles(teamId, folderId);
  };

  // Üst klasöre git
  const handleGoBack = () => {
    setCurrentFolderId(null);
    loadTeamFiles(teamId, null);
  };

  // Dosya boyutunu formatla
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Tarih formatla
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Kullanıcının düzenleme yetkisi var mı?
  const canEdit = userRole === 'OWNER' || userRole === 'EDITOR';

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Admin';
      case 'EDITOR': return 'Editör';
      case 'MEMBER': return 'Yardımcı';
      case 'VIEWER': return 'Görüntüleyici';
      default: return role;
    }
  };

  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'EDITOR': return { background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd' };
      case 'MEMBER': return { background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' };
      case 'VIEWER': return { background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' };
      default: return { background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' };
    }
  };

  // Tüm üyeleri birleştir (aktif + bekleyen)
  const allMembers = [
    ...teamMembers.map(m => ({ ...m, status: 'active' as const })),
    ...pendingInvites.map(i => ({ ...i, status: 'invited' as const }))
  ];

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
      
      {/* Global Gizli file input - Tüm sekmelerden erişilebilir */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        style={{ display: 'none' }}
      />

      {/* Main Content */}
      <main className="files-main" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.25rem' }}>
              Ekip Yönetimi
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              {teamName || 'Ekibiniz'}
            </p>
          </div>
          
          {activeTab === 'members' ? (
            <button 
              onClick={() => setShowInviteModal(true)}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                transition: 'all 0.2s'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
              </svg>
              Ekip Üyesi Davet Et
            </button>
          ) : canEdit && (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {/* Dosya Yükle butonu */}
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  background: uploading 
                    ? 'rgba(99, 102, 241, 0.5)' 
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {uploading ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    Dosya Yükle
                  </>
                )}
              </button>
              
              {/* Yeni Klasör butonu */}
              <button 
                onClick={() => setShowNewFolderModal(true)}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                </svg>
                Yeni Klasör
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          marginBottom: '1.5rem',
          background: 'rgba(30, 41, 59, 0.5)',
          padding: '0.375rem',
          borderRadius: '12px',
          width: 'fit-content',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab('members')}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'members' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
              color: activeTab === 'members' ? 'white' : '#94a3b8',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              Üyeler ({allMembers.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'files' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              color: activeTab === 'files' ? 'white' : '#94a3b8',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              Dosyalar ({teamFiles.length + teamFolders.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('joined')}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'joined' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
              color: activeTab === 'joined' ? 'white' : '#94a3b8',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              Dahil Olduğum Ekipler ({joinedTeams.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('incoming')}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === 'incoming' ? 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)' : 'transparent',
              color: activeTab === 'incoming' ? 'white' : '#94a3b8',
              whiteSpace: 'nowrap',
              position: 'relative'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.5 3A1.5 1.5 0 001 4.5v.006c0 .596.34 1.11.846 1.386l.415.233a1.5 1.5 0 001.437 0l.415-.233C3.66 5.606 4 5.092 4 4.506v-.006A1.5 1.5 0 002.5 3zM10.5 3A1.5 1.5 0 009 4.5v.006c0 .596.34 1.11.846 1.386l.415.233a1.5 1.5 0 001.437 0l.415-.233C11.66 5.606 12 5.092 12 4.506v-.006A1.5 1.5 0 0010.5 3zM16 4.5v.006c0 .596.34 1.11.846 1.386l.415.233a1.5 1.5 0 001.437 0l.415-.233C19.66 5.606 20 5.092 20 4.506v-.006A1.5 1.5 0 0018.5 3a1.5 1.5 0 00-1.5 1.5zM.846 7.386C.34 7.61 0 8.124 0 8.72v.006A1.5 1.5 0 001.5 10.226h17a1.5 1.5 0 001.5-1.5v-.006c0-.596-.34-1.11-.846-1.386l-.415-.233a1.5 1.5 0 00-1.437 0l-.415.233C17.34 7.61 17 8.124 17 8.72v.006a1 1 0 11-2 0v-.006c0-.596-.34-1.11-.846-1.386l-.415-.233a1.5 1.5 0 00-1.437 0l-.415.233C12.34 7.61 12 8.124 12 8.72v.006a1 1 0 11-2 0v-.006c0-.596-.34-1.11-.846-1.386l-.415-.233a1.5 1.5 0 00-1.437 0l-.415.233zM10 15.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
              </svg>
              Gelen İstekler ({incomingInvites.length})
              {incomingInvites.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}>
                  {incomingInvites.length}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* TAB İÇERİĞİ: Üyeler */}
        {activeTab === 'members' && (
          <>
        {/* Empty State or Team List */}
        {allMembers.length === 0 ? (
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
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '2rem',
              position: 'relative'
            }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-5px',
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(5, 150, 105, 0.3) 100%)',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="#6ee7b7">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.75rem' }}>
              Henüz ekip üyesi yok
            </h2>
            
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              Ekip üyelerinizi davet ederek dosyalarınızı paylaşabilir, 
              birlikte çalışabilir ve verimliliğinizi artırabilirsiniz.
            </p>
            
            <button 
              onClick={() => setShowInviteModal(true)}
              style={{ 
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
              </svg>
              İlk Ekip Üyeni Davet Et
            </button>
          </div>
        ) : (
          /* Team Members List */
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Üye</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rol</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Durum</th>
                  <th style={{ padding: '1rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {allMembers.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '50%', 
                          background: member.status === 'invited' 
                            ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
                            : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          fontWeight: 600,
                          color: 'white'
                        }}>
                          {(member.name || member.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, color: '#ffffff' }}>{member.name || member.email}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      {member.status === 'active' ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as 'VIEWER' | 'MEMBER' | 'EDITOR')}
                          style={{ 
                            padding: '0.375rem 0.75rem',
                            paddingRight: '2rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            border: 'none',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                            backgroundPosition: 'right 0.5rem center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '1rem',
                            ...getRoleStyle(member.role)
                          }}
                        >
                          <option value="EDITOR" style={{ background: '#1e293b', color: '#fff' }}>Editör</option>
                          <option value="MEMBER" style={{ background: '#1e293b', color: '#fff' }}>Yardımcı</option>
                          <option value="VIEWER" style={{ background: '#1e293b', color: '#fff' }}>Görüntüleyici</option>
                        </select>
                      ) : (
                        <span style={{ 
                          padding: '0.375rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          opacity: 0.6,
                          ...getRoleStyle(member.role)
                        }}>
                          {member.role === 'EDITOR' ? 'Editör' : member.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: member.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                        color: member.status === 'active' ? '#6ee7b7' : '#fcd34d'
                      }}>
                        {member.status === 'active' ? 'Aktif' : 'Davet Edildi'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <button 
                        style={{ 
                          padding: '0.5rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          color: '#fca5a5'
                        }}
                        onClick={() => {
                          if (member.status === 'invited') {
                            handleCancelInvite(member.id);
                          } else {
                            handleRemoveMember(member.id);
                          }
                        }}
                        title={member.status === 'invited' ? 'Daveti iptal et' : 'Üyeyi çıkar'}
                      >
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </>
        )}

        {/* TAB İÇERİĞİ: Dosyalar */}
        {activeTab === 'files' && (
          <div>
            {/* Üst Bar: Geri butonu ve Aksiyon butonları */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {currentFolderId && (
                <button
                  onClick={handleGoBack}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    fontSize: '0.875rem',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Üst Klasöre Git
                </button>
              )}
              
              {/* Aksiyon Butonları - Sadece ekip oluşturulmuşsa ve yetkisi varsa */}
              {teamId && (userRole === 'MEMBER' || userRole === 'EDITOR') && (
                <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
                </div>
              )}
            </div>

            {filesLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                <p>Dosyalar yükleniyor...</p>
              </div>
            ) : teamFiles.length === 0 && teamFolders.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '4rem 2rem',
                background: 'rgba(30, 41, 59, 0.3)',
                borderRadius: '16px',
                border: '1px dashed rgba(148, 163, 184, 0.2)'
              }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  background: 'rgba(16, 185, 129, 0.1)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem'
                }}>
                  <svg width="40" height="40" viewBox="0 0 20 20" fill="#10b981">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Henüz ekip dosyası yok
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Dosyalarım sayfasından dosyaları ekiple paylaşabilirsiniz
                </p>
              </div>
            ) : (
              <div style={{ 
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '16px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Ad</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Ekleyen</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Boyut</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Tarih</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Klasörler */}
                    {teamFolders.map(folder => (
                      <tr 
                        key={`folder-${folder.id}`}
                        style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <button
                            onClick={() => handleOpenFolder(folder.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#e2e8f0'
                            }}
                          >
                            <div style={{ 
                              width: '36px', 
                              height: '36px', 
                              background: 'rgba(251, 191, 36, 0.15)',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="#fbbf24">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                              </svg>
                            </div>
                            <span style={{ fontWeight: 500 }}>{folder.name}</span>
                          </button>
                        </td>
                        <td style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>{folder.createdBy}</td>
                        <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>—</td>
                        <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatDate(folder.createdAt)}</td>
                        <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteFolder(folder.id)}
                              title="Klasörü sil"
                              style={{
                                padding: '0.375rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '6px',
                                color: '#fca5a5',
                                cursor: 'pointer'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Dosyalar */}
                    {teamFiles.map(file => (
                      <tr 
                        key={`file-${file.id}`}
                        style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '1rem 1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              width: '36px', 
                              height: '36px', 
                              background: 'rgba(99, 102, 241, 0.15)',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="#818cf8">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{file.filename}</span>
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>{file.uploadedBy}</td>
                        <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatFileSize(file.sizeBytes)}</td>
                        <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatDate(file.createdAt)}</td>
                        <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {/* Yorum butonu - herkes için */}
                            <button
                              onClick={() => openCommentsModal(file)}
                              title="Yorumlar"
                              style={{
                                padding: '0.375rem',
                                background: 'rgba(168, 85, 247, 0.1)',
                                border: '1px solid rgba(168, 85, 247, 0.2)',
                                borderRadius: '6px',
                                color: '#c4b5fd',
                                cursor: 'pointer'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                              </svg>
                            </button>
                            
                            {/* İndir butonu - indirme yetkisi olanlar (DOWNLOADER, MANAGER, ADMIN, OWNER) */}
                            {hasPermission(userRole, 'download') && (
                              <button
                                onClick={() => handleDownloadFile(file)}
                                title="İndir"
                                style={{
                                  padding: '0.375rem',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.2)',
                                  borderRadius: '6px',
                                  color: '#6ee7b7',
                                  cursor: 'pointer'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            
                            {/* Önizle butonu - desteklenen dosyalar için, herkes görüntüleyebilir */}
                            {canPreview(file.mimeType) && (
                              <button
                                onClick={() => handlePreviewFile(file)}
                                title="Önizle"
                                style={{
                                  padding: '0.375rem',
                                  background: 'rgba(99, 102, 241, 0.1)',
                                  border: '1px solid rgba(99, 102, 241, 0.2)',
                                  borderRadius: '6px',
                                  color: '#a5b4fc',
                                  cursor: 'pointer'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                            

                            
                            {/* Sil butonu - silme yetkisi olanlar (MANAGER, ADMIN) */}
                            {hasPermission(userRole, 'delete') && (
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                title="Sil"
                                style={{
                                  padding: '0.375rem',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.2)',
                                  borderRadius: '6px',
                                  color: '#fca5a5',
                                  cursor: 'pointer'
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB İÇERİĞİ: Dahil Olduğum Ekipler */}
        {activeTab === 'joined' && (
          <div>
            {joinedTeams.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '4rem 2rem',
                background: 'rgba(30, 41, 59, 0.3)',
                borderRadius: '16px',
                border: '1px dashed rgba(148, 163, 184, 0.2)'
              }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.5rem'
                }}>
                  <svg width="40" height="40" viewBox="0 0 20 20" fill="#f59e0b">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Henüz bir ekibe dahil değilsiniz
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                  Bir ekibe davet edildiğinizde burada görünecek
                </p>
              </div>
            ) : !selectedJoinedTeam ? (
              /* Ekip Listesi */
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '1rem'
              }}>
                {joinedTeams.map(team => (
                  <div 
                    key={team.id}
                    onClick={() => {
                      setSelectedJoinedTeam(team);
                      setJoinedCurrentFolderId(null);
                      loadJoinedTeamFiles(team.id, null);
                    }}
                    style={{ 
                      background: 'rgba(30, 41, 59, 0.5)',
                      borderRadius: '16px',
                      border: '1px solid rgba(148, 163, 184, 0.1)',
                      padding: '1.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.2) 100%)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <svg width="24" height="24" viewBox="0 0 20 20" fill="#fbbf24">
                          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem' }}>
                          {team.name}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                          Sahip: {team.owner}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                          <span style={{ 
                            padding: '0.25rem 0.5rem',
                            background: team.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.15)' : team.role === 'EDITOR' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            borderRadius: '4px',
                            color: team.role === 'ADMIN' ? '#fca5a5' : team.role === 'EDITOR' ? '#6ee7b7' : '#a5b4fc'
                          }}>
                            {team.role === 'ADMIN' ? 'Admin' : team.role === 'EDITOR' ? 'Editör' : 'Görüntüleyici'}
                          </span>
                          <span style={{ color: '#64748b' }}>
                            {team.memberCount} üye
                          </span>
                        </div>
                      </div>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="#64748b">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Seçili Ekibin Dosyaları */
              <div>
                {/* Üst Bar: Geri Butonu ve Ekip Adı */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem', 
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '12px',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <button
                    onClick={() => {
                      if (joinedCurrentFolderId) {
                        setJoinedCurrentFolderId(null);
                        loadJoinedTeamFiles(selectedJoinedTeam.id, null);
                      } else {
                        setSelectedJoinedTeam(null);
                        setJoinedTeamFiles([]);
                        setJoinedTeamFolders([]);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 1rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fbbf24',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    {joinedCurrentFolderId ? 'Üst Klasör' : 'Ekip Listesi'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24', margin: 0 }}>
                      {selectedJoinedTeam.name}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                      Rolünüz: {selectedJoinedTeam.role === 'EDITOR' ? 'Editör' : selectedJoinedTeam.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                    </p>
                  </div>
                  
                  {/* Aksiyon Butonları - Editör ve MEMBER için */}
                  {(selectedJoinedTeam.role === 'MEMBER' || selectedJoinedTeam.role === 'EDITOR') && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                    </div>
                  )}
                  
                  {/* Ekipten Çık Butonu */}
                  <button
                    onClick={async () => {
                      if (window.confirm(`${selectedJoinedTeam.name} ekibinden ayrılmak istediğinize emin misiniz?`)) {
                        try {
                          await leaveTeam(selectedJoinedTeam.id);
                          showToast(`${selectedJoinedTeam.name} ekibinden başarıyla ayrıldınız`, "success");
                          setSelectedJoinedTeam(null);
                          loadJoinedTeams();
                        } catch (err: any) {
                          showToast(err.message || "Ekipten çıkılamadı", "error");
                        }
                      }
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.3) 100%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%)';
                    }}
                  >
                    Ekipten Çık
                  </button>
                </div>

                {/* Dosya/Klasör Listesi */}
                {joinedFilesLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
                    <p>Dosyalar yükleniyor...</p>
                  </div>
                ) : joinedTeamFiles.length === 0 && joinedTeamFolders.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem',
                    background: 'rgba(30, 41, 59, 0.3)',
                    borderRadius: '12px',
                    border: '1px dashed rgba(148, 163, 184, 0.2)'
                  }}>
                    <p style={{ color: '#94a3b8' }}>Bu ekipte henüz dosya yok</p>
                  </div>
                ) : (
                  <div style={{ 
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: '16px',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    overflow: 'hidden'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
                          <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Ad</th>
                          <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Ekleyen</th>
                          <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Boyut</th>
                          <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Tarih</th>
                          <th style={{ padding: '1rem 1.25rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Klasörler */}
                        {joinedTeamFolders.map(folder => (
                          <tr 
                            key={`jfolder-${folder.id}`}
                            style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)', cursor: 'pointer' }}
                            onClick={() => {
                              setJoinedCurrentFolderId(folder.id);
                              loadJoinedTeamFiles(selectedJoinedTeam.id, folder.id);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '1rem 1.25rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ 
                                  width: '36px', 
                                  height: '36px', 
                                  background: 'rgba(251, 191, 36, 0.15)',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <svg width="18" height="18" viewBox="0 0 20 20" fill="#fbbf24">
                                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                  </svg>
                                </div>
                                <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{folder.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>{folder.createdBy}</td>
                            <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>—</td>
                            <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatDate(folder.createdAt)}</td>
                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>—</td>
                          </tr>
                        ))}
                        
                        {/* Dosyalar */}
                        {joinedTeamFiles.map(file => (
                          <tr 
                            key={`jfile-${file.id}`}
                            style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.05)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148, 163, 184, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '1rem 1.25rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ 
                                  width: '36px', 
                                  height: '36px', 
                                  background: 'rgba(99, 102, 241, 0.15)',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <svg width="18" height="18" viewBox="0 0 20 20" fill="#818cf8">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                  </svg>
                                </div>
                                <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{file.filename}</span>
                              </div>
                            </td>
                            <td style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>{file.uploadedBy}</td>
                            <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatFileSize(file.sizeBytes)}</td>
                            <td style={{ padding: '1rem 1.25rem', color: '#64748b', fontSize: '0.875rem' }}>{formatDate(file.createdAt)}</td>
                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                {/* Yorum butonu - herkes için */}
                                <button
                                  onClick={() => openCommentsModal(file)}
                                  title="Yorumlar"
                                  style={{
                                    padding: '0.375rem',
                                    background: 'rgba(168, 85, 247, 0.1)',
                                    border: '1px solid rgba(168, 85, 247, 0.2)',
                                    borderRadius: '6px',
                                    color: '#c4b5fd',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                
                                {/* İndir butonu - indirme yetkisi olanlar */}
                                {selectedJoinedTeam && hasPermission(selectedJoinedTeam.role, 'download') && (
                                  <button
                                    onClick={() => handleDownloadFile(file)}
                                    title="İndir"
                                    style={{
                                      padding: '0.375rem',
                                      background: 'rgba(16, 185, 129, 0.1)',
                                      border: '1px solid rgba(16, 185, 129, 0.2)',
                                      borderRadius: '6px',
                                      color: '#6ee7b7',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                                
                                {/* Önizle butonu */}
                                {canPreview(file.mimeType) && (
                                  <button
                                    onClick={() => handlePreviewFile(file)}
                                    title="Önizle"
                                    style={{
                                      padding: '0.375rem',
                                      background: 'rgba(99, 102, 241, 0.1)',
                                      border: '1px solid rgba(99, 102, 241, 0.2)',
                                      borderRadius: '6px',
                                      color: '#a5b4fc',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                                

                                
                                {/* Sil butonu - silme yetkisi olanlar (MANAGER, ADMIN) */}
                                {selectedJoinedTeam && hasPermission(selectedJoinedTeam.role, 'delete') && (
                                  <button
                                    onClick={() => handleDeleteFile(file.id)}
                                    title="Sil"
                                    style={{
                                      padding: '0.375rem',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.2)',
                                      borderRadius: '6px',
                                      color: '#fca5a5',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB İÇERİĞİ: Gelen İstekler */}
        {activeTab === 'incoming' && (
          <div>
            {incomingLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                <div style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                </div>
                <p>Gelen davetler yükleniyor...</p>
              </div>
            ) : incomingInvites.length === 0 ? (
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
                  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 63, 94, 0.15) 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '2rem'
                }}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="1.5">
                    <path d="M18 8A6 6 0 0 0 6 8m16 0a8 8 0 1 0-16 0m16 0v3m0-3l-2 2m2-2l2 2M6 8v3M6 8L4 10m2-2l-2-2" />
                  </svg>
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.75rem' }}>
                  Henüz gelen davet yok
                </h2>

                <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                  Ekip sahipleri size davet gönderdiğinde burada görünecektir.
                  Daveti kabul ederek ekip dosyalarına erişebilirsiniz.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                {incomingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(236, 72, 153, 0.2)',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      alignItems: 'center',
                      gap: '2rem',
                      padding: '1.5rem'
                    }}
                  >
                    {/* Sol - Ekip Bilgisi */}
                    <div>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ffffff', margin: '0 0 0.5rem 0' }}>
                        {invite.teamName}
                      </h3>
                      <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
                        {invite.teamDescription || 'Açıklama yok'}
                      </p>
                      
                      {/* Davet Detayları */}
                      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                            Davet Eden
                          </p>
                          <p style={{ color: '#ffffff', fontSize: '0.875rem', margin: '0' }}>
                            {invite.inviterName || invite.invitedBy}
                          </p>
                        </div>
                        
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                            Rolünüz
                          </p>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.375rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc'
                          }}>
                            {invite.role === 'EDITOR' ? 'Editör' : invite.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                          </span>
                        </div>
                        
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                            İzinler
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#cbd5e1' }}>
                            {invite.role === 'VIEWER' && '👁️ Görüntüle'}
                            {invite.role === 'MEMBER' && '👁️ Görüntüle, 📥 İndir, 📝 Yorum'}
                            {invite.role === 'EDITOR' && '👁️ Görüntüle, 📥 İndir, ⬆️ Yükle, 🗑️ Sil, 📝 Yorum'}
                          </div>
                        </div>
                        
                        <div>
                          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.25rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                            Süresi
                          </p>
                          <p style={{ color: '#fcd34d', fontSize: '0.8rem', margin: '0' }}>
                            ⏱️ {new Date(invite.expiresAt).toLocaleDateString('tr-TR')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Orta - Separator */}
                    <div style={{
                      width: '1px',
                      height: '100%',
                      background: 'rgba(236, 72, 153, 0.2)',
                      minHeight: '80px'
                    }} />

                    {/* Sağ - Butonlar */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      minWidth: '140px'
                    }}>
                      <button
                        onClick={() => handleAcceptIncomingInvite(invite.id)}
                        disabled={acceptingInvite === invite.id}
                        style={{
                          padding: '0.75rem 1rem',
                          background: acceptingInvite === invite.id
                            ? 'rgba(16, 185, 129, 0.4)'
                            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          border: 'none',
                          borderRadius: '10px',
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: acceptingInvite === invite.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {acceptingInvite === invite.id ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Kabul Ediliyor...
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Kabul Et
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDeclineIncomingInvite(invite.id)}
                        disabled={decliningInvite === invite.id}
                        style={{
                          padding: '0.75rem 1rem',
                          background: decliningInvite === invite.id
                            ? 'rgba(239, 68, 68, 0.4)'
                            : 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: '10px',
                          color: decliningInvite === invite.id ? '#fca5a5' : '#ef4444',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          cursor: decliningInvite === invite.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {decliningInvite === invite.id ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Red Ediliyor...
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Red Et
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Email Invite Modal */}
      {showEmailInviteModal && emailInvite && (
        <div 
          onClick={() => setShowEmailInviteModal(false)}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              borderRadius: '24px',
              padding: '3rem',
              width: '100%',
              maxWidth: '500px',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(236, 72, 153, 0.2)'
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{
                width: '120px',
                height: '120px',
                background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                fontSize: '3rem'
              }}>
                🎉
              </div>
              
              <h2 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.5rem 0' }}>
                Ekip Daveti Aldınız!
              </h2>
              
              <p style={{ fontSize: '1rem', color: '#94a3b8', margin: '0' }}>
                <strong style={{ color: '#ffffff' }}>{emailInvite.inviterName || emailInvite.invitedBy}</strong> sizi{' '}
                <strong style={{ color: '#ffffff' }}>{emailInvite.teamName}</strong> ekibine davet ediyor
              </p>
            </div>

            {/* Davet Detayları */}
            <div style={{
              background: 'rgba(236, 72, 153, 0.1)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              borderRadius: '16px',
              padding: '1.5rem',
              marginBottom: '2rem',
              textAlign: 'left'
            }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                  📋 Ekip Açıklaması
                </p>
                <p style={{ color: '#e2e8f0', fontSize: '0.95rem', margin: '0' }}>
                  {emailInvite.teamDescription || 'Açıklama bulunmamaktadır'}
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                  👤 Rolünüz
                </p>
                <span style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc'
                }}>
                  {emailInvite.role === 'EDITOR' ? '✏️ Editör' : emailInvite.role === 'MEMBER' ? '👥 Yardımcı' : '👁️ Görüntüleyici'}
                </span>
              </div>

              <div style={{ marginBottom: '0' }}>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem 0', textTransform: 'uppercase', fontWeight: 600 }}>
                  🔐 İzinler
                </p>
                <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {emailInvite.role === 'VIEWER' && (
                    <p style={{ margin: '0' }}>👁️ Dosyaları Görüntüle</p>
                  )}
                  {emailInvite.role === 'MEMBER' && (
                    <>
                      <p style={{ margin: '0.25rem 0' }}>👁️ Dosyaları Görüntüle</p>
                      <p style={{ margin: '0.25rem 0' }}>📥 Dosya İndir</p>
                      <p style={{ margin: '0.25rem 0' }}>💬 Yorum Yap</p>
                    </>
                  )}
                  {emailInvite.role === 'EDITOR' && (
                    <>
                      <p style={{ margin: '0.25rem 0' }}>👁️ Dosyaları Görüntüle</p>
                      <p style={{ margin: '0.25rem 0' }}>📥 Dosya İndir</p>
                      <p style={{ margin: '0.25rem 0' }}>⬆️ Dosya Yükle</p>
                      <p style={{ margin: '0.25rem 0' }}>🗑️ Dosya Sil</p>
                      <p style={{ margin: '0.25rem 0' }}>💬 Yorum Yap</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Soru */}
            <p style={{ fontSize: '1.125rem', fontWeight: 600, color: '#ffffff', marginBottom: '2rem' }}>
              Bu ekibe üye olmak ister misiniz?
            </p>

            {/* Butonlar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem'
            }}>
              <button
                onClick={() => {
                  setShowEmailInviteModal(false);
                }}
                style={{
                  padding: '1rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  (e.target as any).style.background = 'rgba(239, 68, 68, 0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.target as any).style.background = 'rgba(239, 68, 68, 0.1)';
                }}
              >
                Hayır, Teşekkürler
              </button>

              <button
                onClick={() => {
                  setShowEmailInviteModal(false);
                  handleAcceptIncomingInvite(emailInvite.id);
                }}
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)'
                }}
                onMouseEnter={(e) => {
                  (e.target as any).style.transform = 'translateY(-2px)';
                  (e.target as any).style.boxShadow = '0 15px 35px rgba(16, 185, 129, 0.4)';
                }}
                onMouseLeave={(e) => {
                  (e.target as any).style.transform = 'translateY(0)';
                  (e.target as any).style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.3)';
                }}
              >
                Evet, Kabul Et! ✨
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Klasör Modal */}
      {showNewFolderModal && (
        <div 
          onClick={() => setShowNewFolderModal(false)}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '20px',
              padding: '2rem',
              width: '100%',
              maxWidth: '400px'
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', marginBottom: '1.5rem' }}>
              Yeni Klasör
            </h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Klasör adı"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '10px',
                color: '#e2e8f0',
                fontSize: '0.9rem',
                marginBottom: '1.5rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewFolderModal(false)}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button
                onClick={handleCreateFolder}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div 
          onClick={() => setShowInviteModal(false)}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: 'min(480px, 100%)',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '24px',
              padding: '2rem',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ 
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="#a78bfa">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                  Ekip Üyesi Davet Et
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                  E-posta ile davet gönderin
                </p>
              </div>
            </div>
            
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                E-posta Adresi
              </label>
              <input 
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="ornek@email.com"
                style={{ 
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInvite();
                }}
              />
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                Rol
              </label>
              <select 
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                style={{ 
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="VIEWER" style={{ background: '#1e293b' }}>Görüntüleyici</option>
                <option value="MEMBER" style={{ background: '#1e293b' }}>Yardımcı</option>
                <option value="EDITOR" style={{ background: '#1e293b' }}>Editör</option>
              </select>
            </div>

            <div style={{ 
              padding: '0.75rem 1rem', 
              background: 'rgba(59, 130, 246, 0.1)', 
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '10px',
              marginBottom: '1.5rem'
            }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#93c5fd' }}>
                📧 Davet e-postası gönderilecek. Davet 7 gün geçerlidir.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowInviteModal(false)}
                style={{ 
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button 
                onClick={handleInvite}
                disabled={inviting}
                style={{ 
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: inviting ? 'not-allowed' : 'pointer',
                  opacity: inviting ? 0.7 : 1
                }}
              >
                {inviting ? 'Gönderiliyor...' : 'Davet Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Önizleme Modal */}
      {showPreviewModal && selectedFile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60
        }}>
          <div style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            display: 'flex',
            gap: '0.75rem'
          }}>
            <button
              onClick={() => handleDownloadFile(selectedFile)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              İndir
            </button>
            <button
              onClick={() => setShowPreviewModal(false)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'rgba(148, 163, 184, 0.2)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '10px',
                color: '#e2e8f0',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              ✕ Kapat
            </button>
          </div>
          
          <div style={{
            maxWidth: '90vw',
            maxHeight: '85vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {selectedFile.mimeType?.startsWith('image/') && (
              <img 
                src={previewUrl} 
                alt={selectedFile.filename}
                style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            )}
            {selectedFile.mimeType === 'application/pdf' && (
              <iframe 
                src={previewUrl} 
                style={{ width: '80vw', height: '85vh', border: 'none', borderRadius: '8px' }}
              />
            )}
            {selectedFile.mimeType?.startsWith('video/') && (
              <video 
                src={previewUrl} 
                controls 
                style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '8px' }}
              />
            )}
            {selectedFile.mimeType?.startsWith('audio/') && (
              <audio src={previewUrl} controls style={{ width: '400px' }} />
            )}
          </div>
          
          <p style={{ 
            position: 'absolute', 
            bottom: '1.5rem', 
            color: '#94a3b8', 
            fontSize: '0.9rem' 
          }}>
            {selectedFile.filename}
          </p>
        </div>
      )}

      {/* Yorumlar Modal */}
      {showCommentsModal && commentsFile && (
        <div 
          onClick={() => { setShowCommentsModal(false); setCommentsFile(null); setComments([]); }}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'rgba(15, 23, 42, 0.98)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '20px',
              padding: '2rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                💬 Yorumlar
              </h3>
              <button
                onClick={() => { setShowCommentsModal(false); setCommentsFile(null); setComments([]); }}
                style={{
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  color: '#94a3b8'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
              📁 {commentsFile.filename}
            </p>

            {/* Yorum Ekleme */}
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Yorumunuzu yazın..."
                maxLength={1000}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  minHeight: '80px',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{newComment.length}/1000</span>
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addingComment}
                  style={{
                    padding: '0.5rem 1rem',
                    background: !newComment.trim() || addingComment ? 'rgba(99, 102, 241, 0.3)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: !newComment.trim() || addingComment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {addingComment ? 'Gönderiliyor...' : 'Gönder'}
                </button>
              </div>
            </div>

            {/* Yorumlar Listesi */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px' }}>
              {commentsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  <div className="animate-spin" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem', border: '2px solid rgba(139, 92, 246, 0.3)', borderTopColor: '#8b5cf6', borderRadius: '50%' }}></div>
                  Yorumlar yükleniyor...
                </div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <p>Henüz yorum yok</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>İlk yorumu siz ekleyin!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {comments.map(comment => (
                    <div 
                      key={comment.id}
                      style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        borderRadius: '12px',
                        padding: '1rem',
                        border: '1px solid rgba(148, 163, 184, 0.1)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            {comment.user.name?.charAt(0).toUpperCase() || comment.user.email?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>
                              {comment.user.name || comment.user.email}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                              {new Date(comment.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        {comment.user.id === user?.id && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.25rem',
                              cursor: 'pointer',
                              color: '#fca5a5'
                            }}
                            title="Yorumu sil"
                          >
                            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div 
          onClick={() => setShowDeleteModal(false)}
          style={{ 
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
              borderRadius: '20px',
              padding: '2rem',
              width: '100%',
              maxWidth: '420px',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ 
              width: '64px',
              height: '64px',
              margin: '0 auto 1.5rem',
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="32" height="32" viewBox="0 0 20 20" fill="#fca5a5">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem', textAlign: 'center' }}>
              {deleteTarget.type === 'file' ? 'Dosya Sil' : 'Klasör Sil'}
            </h3>
            
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '1.5rem', textAlign: 'center', lineHeight: 1.6 }}>
              <strong>"{deleteTarget.name}"</strong> {deleteTarget.type === 'file' ? 'dosyası' : 'klasörü'} silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1
                }}
              >
                İptal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
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
      <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', zIndex: 100 }}>
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

      <style jsx global>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
