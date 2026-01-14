const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

// Uyum için hem eski hem yeni anahtarlar
const TOKEN_KEYS = ["cloudyone_token", "token"] as const;
const USER_KEYS = ["cloudyone_user", "user"] as const;

type Options = RequestInit & { auth?: boolean };

function getStoredToken() {
  if (typeof window === "undefined") return null;
  
  // Önce hangi storage kullanıldığını kontrol et
  const authStorage = localStorage.getItem("authStorage");
  const storage = authStorage === "session" ? sessionStorage : localStorage;
  
  for (const key of TOKEN_KEYS) {
    const v = storage.getItem(key);
    if (v) return v;
  }
  
  // Fallback: her iki storage'ı da kontrol et
  for (const key of TOKEN_KEYS) {
    const v = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (v) return v;
  }
  return null;
}

export async function apiFetch(
  path: string,
  options: Options = {},
  withAuth?: boolean
) {
  const url = `${API_BASE}${path}`;
  const shouldAttachAuth = withAuth ?? options.auth ?? false;
  const token = shouldAttachAuth ? getStoredToken() : null;

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...((options.headers as any) || {}),
  };
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = "Bir hata oluştu.";
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
      if (data?.error) message += ` (${data.error})`;
      console.error("API Error:", { status: res.status, data });
    } catch (e) {
      console.error("API Error (parse failed):", { status: res.status, statusText: res.statusText });
    }
    throw new Error(message);
  }

  try {
    return await res.json();
  } catch {
    return null as any;
  }
}

export function setAuth(token: string, user: any) {
  if (typeof window === "undefined") return;
  // Her iki isimle de yaz
  TOKEN_KEYS.forEach((k) => localStorage.setItem(k, token));
  USER_KEYS.forEach((k) => localStorage.setItem(k, JSON.stringify(user)));
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  // Her iki storage'dan da temizle
  TOKEN_KEYS.forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  USER_KEYS.forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  localStorage.removeItem("authStorage");
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  
  // Önce hangi storage kullanıldığını kontrol et
  const authStorage = localStorage.getItem("authStorage");
  const storage = authStorage === "session" ? sessionStorage : localStorage;
  
  for (const k of USER_KEYS) {
    const raw = storage.getItem(k);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {}
  }
  
  // Fallback: her iki storage'ı da kontrol et
  for (const k of USER_KEYS) {
    const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {}
  }
  return null;
}

// Paylaşılan dosyalar endpoint'i (401 ayrıştırmalı)
export async function fetchSharedFiles(token?: string) {
  const tk = token || getStoredToken();
  const res = await fetch(`${API_BASE}/files/shared`, {
    method: "GET",
    headers: tk ? { Authorization: `Bearer ${tk}` } : {},
  });

  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    throw new Error("SHARED_FILES_ERROR");
  }
  return res.json();
}

// --- Ek API helper'ları ---
// Dosya silme
export async function deleteFile(id: string) {
  return apiFetch(`/files/${id}`, { method: "DELETE" }, true);
}

// Dosya yeniden adlandırma (PUT veya PATCH kullanılabilir)
export async function renameFile(id: string, newName: string) {
  return apiFetch(`/files/${id}`, { method: "PATCH", body: JSON.stringify({ name: newName }) }, true);
}

// Paylaşım linki oluşturma
export type ShareRequest = { expiresIn?: number | "1h" | "1d" | "7d" | "unlimited"; permission?: "DOWNLOAD" | "VIEW" };
export type EncryptionInfo = {
  isEncrypted: boolean;
  edek: string | null;      // Encrypted DEK (master key ile şifreli)
  edekIv: string | null;    // DEK için IV
  cipherIv: string | null;  // Dosya içeriği için IV
  metaNameEnc: string | null; // Şifreli dosya adı
  metaNameIv: string | null;  // Dosya adı için IV
};
export type ShareResponse = { 
  shareUrl: string; 
  share: { permission: "DOWNLOAD" | "VIEW" | "EDIT"; expiresAt: string | null };
  encryptionInfo?: EncryptionInfo | null;
};
export async function shareFile(id: string, body: ShareRequest = {}) {
  return apiFetch(`/files/${id}/share`, { method: "POST", body: JSON.stringify(body) }, true) as Promise<ShareResponse>;
}

// Mevcut paylaşımı güncelle (izin/süre değişikliği - token değişmez)
export type UpdateShareRequest = { permission?: "VIEW" | "DOWNLOAD" | "EDIT"; expiresIn?: string | number };
export async function updateShare(id: string, body: UpdateShareRequest) {
  return apiFetch(`/files/${id}/share`, { method: "PUT", body: JSON.stringify(body) }, true) as Promise<ShareResponse>;
}

export type ShareStatsLog = { openedAt: string; ipAddress?: string | null; userAgent?: string | null };
export type ShareStatsResponse = { shareOpenCount: number; shareLastOpenedAt: string | null; logs: ShareStatsLog[] };
export async function getShareStats(id: string) {
  return apiFetch(`/files/${id}/share-stats`, { method: "GET" }, true) as Promise<ShareStatsResponse>;
}

// Not: R2 signed URL redirect nedeniyle fetch tabanlı indirme CORS'a takılıyor.
// Artık dosya indirme/görüntüleme için frontend'de window.open kullanılıyor.

// Favoriler
export async function listFavorites() {
  return apiFetch(`/files/favorites`, { method: "GET" }, true);
}
export async function toggleFavoriteFile(id: string, favorite: boolean) {
  return apiFetch(`/files/${id}/favorite`, { method: "POST", body: JSON.stringify({ favorite }) }, true);
}
// Çöp kutusu
export async function listTrash(folderId?: string | null) {
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
  return apiFetch(`/files/trash${query}`, { method: "GET" }, true);
}
export async function restoreFile(id: string) {
  return apiFetch(`/files/${id}/restore`, { method: "POST" }, true);
}
export async function permanentDeleteFile(id: string) {
  return apiFetch(`/files/${id}/permanent`, { method: "DELETE" }, true);
}
// Versiyonlar
export async function listVersions(id: string) {
  return apiFetch(`/files/${id}/versions`, { method: "GET" }, true);
}
export async function restoreVersion(id: string, version: number) {
  return apiFetch(`/files/${id}/restore-version`, { method: "POST", body: JSON.stringify({ version }) }, true);
}
export async function deleteVersion(fileId: string, versionId: number) {
  return apiFetch(`/files/${fileId}/versions/${versionId}`, { method: "DELETE" }, true);
}

// Etiketler
export async function getTags() {
  return apiFetch(`/files/tags`, { method: "GET" }, true);
}
export async function createTag(name: string) {
  return apiFetch(`/files/tags`, { method: "POST", body: JSON.stringify({ name }) }, true);
}
export async function deleteTag(tagId: number) {
  return apiFetch(`/files/tags/${tagId}`, { method: "DELETE" }, true);
}
export async function setFileTags(fileId: string, tags: string[]) {
  return apiFetch(`/files/${fileId}/tags`, { method: "POST", body: JSON.stringify({ tags }) }, true);
}

// Klasör güncelleme (yeniden adlandırma / taşıma)
export async function updateFolder(id: string, name: string) {
  return apiFetch(`/files/folders/${id}`, { method: "PUT", body: JSON.stringify({ name }) }, true);
}

// Klasör silme
export async function deleteFolder(id: string) {
  return apiFetch(`/files/folders/${id}`, { method: "DELETE" }, true);
}

export async function restoreFolder(id: string) {
  return apiFetch(`/files/folders/${id}/restore`, { method: "POST" }, true);
}

export async function permanentDeleteFolder(id: string) {
  return apiFetch(`/files/folders/${id}/permanent`, { method: "DELETE" }, true);
}

export async function toggleFolderFavorite(id: string) {
  return apiFetch(`/files/folders/${id}/toggle-favorite`, { method: "POST" }, true);
}

export async function shareFolder(id: string, expiresIn?: string, permission?: "VIEW" | "DOWNLOAD") {
  return apiFetch(`/files/folders/${id}/share`, { 
    method: "POST", 
    body: JSON.stringify({ expiresIn, permission }) 
  }, true);
}

// Depolama / Plan
export async function getAccountStorage() {
  return apiFetch(`/account/storage`, { method: "GET" }, true);
}
export async function updatePlan(plan: string) {
  return apiFetch(`/account/plan`, { method: "POST", body: JSON.stringify({ plan }) }, true);
}
export async function emptyTrash() {
  return apiFetch(`/files/trash`, { method: "DELETE" }, true);
}

// Dosya indirme & görüntüleme imzalı URL alma
export async function getDownloadUrl(fileId: string) {
  const data = await apiFetch(`/files/${fileId}/download`, { method: "GET" }, true);
  if (!data?.url) throw new Error("İndirme linki alınamadı.");
  return data.url as string;
}
export async function getViewUrl(fileId: string) {
  const data = await apiFetch(`/files/${fileId}/view`, { method: "GET" }, true);
  if (!data?.url) throw new Error("Görüntüleme linki alınamadı.");
  return data.url as string;
}

// Gizli dosyalar
export async function listHiddenFiles(folderId?: string | null) {
  const query = folderId ? `?folderId=${folderId}` : '';
  return apiFetch(`/files/hidden${query}`, { method: "GET" }, true);
}

export async function toggleFileHidden(fileId: string) {
  return apiFetch(`/files/${fileId}/toggle-hidden`, { method: "POST" }, true);
}

export async function toggleFolderHidden(folderId: string) {
  return apiFetch(`/files/folders/${folderId}/toggle-hidden`, { method: "POST" }, true);
}

// PIN yönetimi
export async function setHiddenFilesPin(pin: string | null) {
  return apiFetch(`/auth/hidden-pin/set`, { method: "POST", body: JSON.stringify({ pin }) }, true);
}

export async function verifyHiddenFilesPin(pin: string) {
  return apiFetch(`/auth/hidden-pin/verify`, { method: "POST", body: JSON.stringify({ pin }) }, true);
}

export async function hasHiddenFilesPin() {
  return apiFetch(`/auth/hidden-pin/has`, { method: "GET" }, true);
}

// ============================================================================
// Dosya İstekleri (File Requests)
// ============================================================================

export async function listFileRequests() {
  return apiFetch(`/file-requests`, { method: "GET" }, true);
}

export async function getFileRequest(id: string) {
  return apiFetch(`/file-requests/${id}`, { method: "GET" }, true);
}

export async function createFileRequest(data: {
  title: string;
  description?: string;
  folderId?: string | null;
  expiresAt?: string | null;
  maxFileSize?: number | null;
  allowedTypes?: string | null;
}) {
  return apiFetch(`/file-requests`, { 
    method: "POST", 
    body: JSON.stringify(data) 
  }, true);
}

export async function updateFileRequest(id: string, data: {
  title?: string;
  description?: string;
  folderId?: string | null;
  expiresAt?: string | null;
  maxFileSize?: number | null;
  allowedTypes?: string | null;
  isActive?: boolean;
}) {
  return apiFetch(`/file-requests/${id}`, { 
    method: "PUT", 
    body: JSON.stringify(data) 
  }, true);
}

export async function deleteFileRequest(id: string) {
  return apiFetch(`/file-requests/${id}`, { method: "DELETE" }, true);
}

export async function toggleFileRequest(id: string) {
  return apiFetch(`/file-requests/${id}/toggle`, { method: "POST" }, true);
}

// Public (auth gerektirmeyen) - Dosya isteği bilgisi al
export async function getPublicFileRequest(token: string) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const res = await fetch(`${API_BASE}/file-requests/public/${token}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Dosya isteği alınamadı.");
  }
  return res.json();
}

// Public dosya yükleme
export async function uploadToFileRequest(token: string, file: File, uploaderName?: string, uploaderEmail?: string) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const formData = new FormData();
  formData.append("file", file);
  if (uploaderName) formData.append("uploaderName", uploaderName);
  if (uploaderEmail) formData.append("uploaderEmail", uploaderEmail);

  const res = await fetch(`${API_BASE}/file-requests/public/${token}/upload`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Dosya yüklenemedi.");
  }
  return res.json();
}

// ==========================================
// TEAM MANAGEMENT API
// ==========================================

// Ekip üyelerini listele
export async function listTeamMembers() {
  return apiFetch("/api/team/members", { method: "GET" }, true);
}

// Ekibe üye davet et
export async function inviteTeamMember(email: string, role: 'VIEWER' | 'MEMBER' | 'EDITOR' = 'VIEWER') {
  return apiFetch("/api/team/invite", {
    method: "POST",
    body: JSON.stringify({ email, role })
  }, true);
}

// Kullanıcıya gelen davet isteklerini getir
export async function getPendingTeamInvites() {
  const invites = await apiFetch("/api/team/pending-invites", { method: "GET" }, true);
  return { invites: Array.isArray(invites) ? invites : [] };
}

// Daveti iptal et
export async function cancelTeamInvite(inviteId: string) {
  return apiFetch(`/api/team/invite/${inviteId}`, { method: "DELETE" }, true);
}

// Üyeyi ekipten çıkar
export async function removeTeamMember(memberId: string) {
  return apiFetch(`/api/team/member/${memberId}`, { method: "DELETE" }, true);
}

// Üye rolünü güncelle
export async function updateTeamMemberRole(memberId: string, role: 'VIEWER' | 'MEMBER' | 'EDITOR') {
  return apiFetch(`/api/team/member/${memberId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role })
  }, true);
}

// Public: Davet bilgilerini getir (token ile)
export async function getTeamInviteByToken(token: string) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
  const res = await fetch(`${API_BASE}/api/team/invite/${token}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Davet bilgileri alınamadı.");
  }
  return res.json();
}

// Daveti kabul et
export async function acceptTeamInvite(tokenOrId: string) {
  return apiFetch(`/api/team/pending-invites/${tokenOrId}/accept`, { method: "POST" }, true);
}

// Daveti reddet
export async function declineTeamInvite(tokenOrId: string) {
  return apiFetch(`/api/team/pending-invites/${tokenOrId}/decline`, { method: "POST" }, true);
}

// Kullanıcının dahil olduğu ekipleri listele
export async function listMyTeams() {
  return apiFetch("/api/team/my-teams", { method: "GET" }, true);
}

// Ekipten çık
export async function leaveTeam(teamId: string) {
  return apiFetch(`/api/team/${teamId}/leave`, { method: "POST" }, true);
}

// ============ EKİP DOSYALARI ============

// Ekip dosyalarını listele
export async function listTeamFiles(teamId: string, folderId?: string) {
  const params = folderId ? `?folderId=${folderId}` : '';
  return apiFetch(`/api/team/${teamId}/files${params}`, { method: "GET" }, true);
}

// Ekibe doğrudan dosya yükle
export async function uploadTeamFile(teamId: string, file: File, folderId?: string): Promise<any> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
  }
  
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) {
    formData.append("folderId", folderId);
  }
  
  const res = await fetch(`${API_BASE}/api/team/${teamId}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Dosya yüklenemedi");
  }
  
  return res.json();
}

// Dosyayı ekiple paylaş
export async function shareFileWithTeam(fileId: string, teamId: string, encryptionData?: { teamDek: string; teamDekIv: string }) {
  return apiFetch("/api/team/share-file", {
    method: "POST",
    body: JSON.stringify({ 
      fileId, 
      teamId,
      teamDek: encryptionData?.teamDek,
      teamDekIv: encryptionData?.teamDekIv
    })
  }, true);
}

// Dosyayı ekipten kaldır
export async function unshareFileFromTeam(fileId: string) {
  return apiFetch("/api/team/unshare-file", {
    method: "POST",
    body: JSON.stringify({ fileId })
  }, true);
}

// Ekip klasörü oluştur
export async function createTeamFolder(teamId: string, name: string, parentFolderId?: string) {
  return apiFetch("/api/team/folder", {
    method: "POST",
    body: JSON.stringify({ teamId, name, parentFolderId })
  }, true);
}

// Ekip dosyasını sil
export async function deleteTeamFile(fileId: string) {
  return apiFetch(`/api/team/file/${fileId}`, { method: "DELETE" }, true);
}

// Ekip klasörünü sil
export async function deleteTeamFolder(folderId: string) {
  return apiFetch(`/api/team/folder/${folderId}`, { method: "DELETE" }, true);
}

// Ekip dosyası indirme URL'i al (normal dosya indirme ile aynı endpoint)
export async function getTeamFileDownloadUrl(fileId: string) {
  const data = await apiFetch(`/files/${fileId}/download`, { method: "GET" }, true);
  if (!data?.url) throw new Error("İndirme linki alınamadı.");
  return data.url as string;
}

// Ekip dosyası görüntüleme URL'i al
export async function getTeamFileViewUrl(fileId: string) {
  const data = await apiFetch(`/files/${fileId}/view`, { method: "GET" }, true);
  if (!data?.url) throw new Error("Görüntüleme linki alınamadı.");
  return data.url as string;
}

// Ekip dosyası için paylaşım linki oluştur
export async function shareTeamFile(fileId: string, options: { expiresIn?: string; permission?: "DOWNLOAD" | "VIEW" } = {}) {
  return apiFetch(`/files/${fileId}/share`, { 
    method: "POST", 
    body: JSON.stringify(options) 
  }, true) as Promise<{ shareUrl: string; share: { permission: "DOWNLOAD" | "VIEW"; expiresAt: string | null } }>;
}

// Ekip dosyası yeniden adlandır (ekip endpoint'i kullan)
export async function renameTeamFile(fileId: string, newName: string) {
  return apiFetch(`/teams/file/${fileId}/rename`, { 
    method: "PATCH", 
    body: JSON.stringify({ name: newName }) 
  }, true);
}

// Ekip dosyasını kişisel dosyalara kopyala
export async function copyTeamFileToPersonal(fileId: string, folderId?: string) {
  return apiFetch(`/teams/file/${fileId}/copy-to-personal`, { 
    method: "POST", 
    body: JSON.stringify({ folderId }) 
  }, true);
}

// Kullanıcının etkinliklerini getir
export async function getActivities() {
  return apiFetch("/api/activities", { method: "GET" }, true);
}

// Etkinlikleri temizle
export async function clearActivities() {
  return apiFetch("/account/activities", { method: "DELETE" }, true);
}

// Etkinlikleri okundu olarak işaretle
export async function markActivitiesAsRead() {
  return apiFetch("/api/activities/read-all", { method: "PATCH" }, true);
}

// Tek etkinliği sil
export async function deleteActivity(activityId: string) {
  return apiFetch(`/api/activities/${activityId}`, { method: "DELETE" }, true);
}

// ==================== DOSYA YORUMLARI ====================

// Dosya yorumlarını listele
export async function listFileComments(fileId: string) {
  return apiFetch(`/api/team/file/${fileId}/comments`, { method: "GET" }, true) as Promise<{
    comments: Array<{
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
    }>;
  }>;
}

// Dosyaya yorum ekle
export async function addFileComment(fileId: string, content: string) {
  return apiFetch(`/api/team/file/${fileId}/comments`, { 
    method: "POST",
    body: JSON.stringify({ content })
  }, true);
}

// Yorum güncelle
export async function updateFileComment(commentId: string, content: string) {
  return apiFetch(`/api/team/comment/${commentId}`, { 
    method: "PATCH",
    body: JSON.stringify({ content })
  }, true);
}

// Yorum sil
export async function deleteFileComment(commentId: string) {
  return apiFetch(`/api/team/comment/${commentId}`, { method: "DELETE" }, true);
}
