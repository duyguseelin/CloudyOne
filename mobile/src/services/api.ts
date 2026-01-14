import { API_BASE_URL } from '../constants/config';
import { storage } from '../utils/storage';
import { AuthResponse, User, FileItem, FolderItem, ApiError, StorageInfo, ActivityItem } from '../types';

// Export API_BASE for use in other files
export const API_BASE = API_BASE_URL;

class ApiService {
  private baseUrl = API_BASE_URL;

  private async getHeaders(includeAuth = true): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (includeAuth) {
      const token = await storage.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      // 401 ise token yenilemeyi dene
      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Token yenilendi, isteği tekrarla
          throw new Error('TOKEN_REFRESHED');
        }
      }
      
      let errorMessage = 'Bir hata oluştu';
      try {
        const errorData: ApiError = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: await this.getHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    
    const data = await this.handleResponse<any>(response);
    
    // Backend 'token' olarak dönüyor, biz 'accessToken' olarak saklıyoruz
    // Ancak 2FA aktifse requires2FA: true ve temp2FAToken gelir, gerçek token gelmez
    if (!data.requires2FA) {
      if (data.token && typeof data.token === 'string') {
        await storage.setAccessToken(data.token);
      }
      if (data.refreshToken && typeof data.refreshToken === 'string') {
        await storage.setRefreshToken(data.refreshToken);
      }
      if (data.user && typeof data.user === 'object') {
        await storage.setUserData(JSON.stringify(data.user));
      }
    }
    
    return data;
  }

  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: await this.getHeaders(false),
      body: JSON.stringify({ email, password, name }),
    });
    
    const data = await this.handleResponse<any>(response);
    
    if (data.token && typeof data.token === 'string') {
      await storage.setAccessToken(data.token);
    }
    if (data.user && typeof data.user === 'object') {
      await storage.setUserData(JSON.stringify(data.user));
    }
    
    return {
      token: data.token,
      user: data.user
    };
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: await this.getHeaders(),
      });
    } catch {}
    await storage.clearAll();
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.accessToken && typeof data.accessToken === 'string') {
        await storage.setAccessToken(data.accessToken);
      }
      if (data.refreshToken && typeof data.refreshToken === 'string') {
        await storage.setRefreshToken(data.refreshToken);
      }

      return true;
    } catch {
      return false;
    }
  }

  // User
  async getMe(): Promise<User> {
    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ user: User }>(response);
    return data.user;
  }

  async getStorage(): Promise<StorageInfo> {
    const response = await fetch(`${this.baseUrl}/account/storage`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<StorageInfo>(response);
  }

  // Files
  async getFiles(folderId?: string | null): Promise<{ files: FileItem[]; folders: FolderItem[] }> {
    const url = folderId 
      ? `${this.baseUrl}/files?folderId=${folderId}`
      : `${this.baseUrl}/files`;
    
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: FileItem[]; folders: FolderItem[] }>(response);
  }

  async getFolder(folderId: string): Promise<FolderItem | null> {
    try {
      const response = await fetch(`${this.baseUrl}/files/folders/${folderId}`, {
        headers: await this.getHeaders(),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.folder || data;
    } catch {
      return null;
    }
  }

  async uploadFile(uri: string, filename: string, mimeType?: string, folderId?: string | null, isHidden?: boolean): Promise<FileItem> {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: filename,
      type: mimeType || 'application/octet-stream',
    } as any);
    
    if (folderId) {
      formData.append('folderId', folderId);
    }
    
    if (isHidden) {
      formData.append('isHidden', 'true');
    }

    const token = await storage.getAccessToken();
    const response = await fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    return this.handleResponse<FileItem>(response);
  }

  async getToken(): Promise<string | null> {
    return await storage.getAccessToken();
  }

  async createShareLink(
    fileId: string, 
    options?: { expiresIn?: string | number; permission?: 'VIEW' | 'DOWNLOAD' | 'EDIT' }
  ): Promise<{ shareUrl: string; share?: { permission: string; expiresAt: string | null } }> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/share`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({
        expiresIn: options?.expiresIn || '1d',
        permission: options?.permission || 'DOWNLOAD'
      }),
    });
    return this.handleResponse<{ shareUrl: string; share?: { permission: string; expiresAt: string | null } }>(response);
  }

  async stopShare(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/unshare`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async renameFile(fileId: string, newName: string): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify({ name: newName }),
    });
    const result = await this.handleResponse<{ file: FileItem }>(response);
    return result.file;
  }

  async moveFile(fileId: string, targetFolderId: string | null): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify({ folderId: targetFolderId }),
    });
    const result = await this.handleResponse<{ file: FileItem }>(response);
    return result.file;
  }

  async renameFolder(folderId: string, newName: string): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify({ name: newName }),
    });
    return this.handleResponse<FolderItem>(response);
  }

  async toggleFavorite(fileId: string, isFavorite?: boolean): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/favorite`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ favorite: isFavorite !== undefined ? !isFavorite : true }),
    });
    const result = await this.handleResponse<{ file: FileItem }>(response);
    return result.file;
  }

  async uploadAvatar(uri: string): Promise<User> {
    const formData = new FormData();
    formData.append('avatar', {
      uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as any);

    const token = await storage.getAccessToken();
    const response = await fetch(`${this.baseUrl}/auth/upload-avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const result = await this.handleResponse<{ user: User }>(response);
    return result.user;
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/download-url`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ url: string }>(response);
    return data.url;
  }

  // Folders
  async getFolders(parentFolderId?: string): Promise<FolderItem[]> {
    const data = await this.getFiles(parentFolderId);
    return data.folders;
  }

  async getAllFolders(): Promise<FolderItem[]> {
    const response = await fetch(`${this.baseUrl}/files`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ files: FileItem[]; folders: FolderItem[] }>(response);
    return data.folders;
  }

  async createFolder(name: string, parentFolderId?: string, isHidden?: boolean): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ name, parentId: parentFolderId, isHidden }),
    });
    return this.handleResponse<FolderItem>(response);
  }

  async deleteFolder(folderId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async toggleFolderFavorite(folderId: string): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}/toggle-favorite`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FolderItem>(response);
  }

  async shareFolder(folderId: string, expiresIn?: string, permission?: string): Promise<{ shareUrl: string }> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}/share`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ expiresIn: expiresIn || '1d', permission: permission || 'DOWNLOAD' }),
    });
    return this.handleResponse<{ shareUrl: string }>(response);
  }

  // Favorites
  async getFavorites(): Promise<{ files: FileItem[]; folders: FolderItem[] }> {
    const response = await fetch(`${this.baseUrl}/files/favorites`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: FileItem[]; folders: FolderItem[] }>(response);
  }

  // Trash
  async getTrash(): Promise<{ files: FileItem[]; folders: FolderItem[] }> {
    const response = await fetch(`${this.baseUrl}/files/trash`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: FileItem[]; folders: FolderItem[] }>(response);
  }

  async restoreFile(fileId: string): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/restore`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FileItem>(response);
  }

  async permanentDelete(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/permanent`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  // Folder Trash Operations
  async restoreFolder(folderId: string): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}/restore`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FolderItem>(response);
  }

  async permanentDeleteFolder(folderId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}/permanent`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async emptyTrash(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/files/trash`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Shared Files
  async getSharedFiles(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/files/shared`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any[]>(response);
  }

  async revokeShare(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/share`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  // Hidden Files
  async getHiddenFiles(folderId?: string | null): Promise<{ files: FileItem[]; folders: FolderItem[] }> {
    const url = folderId 
      ? `${this.baseUrl}/files/hidden?folderId=${folderId}`
      : `${this.baseUrl}/files/hidden`;
    const response = await fetch(url, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: FileItem[]; folders: FolderItem[] }>(response);
  }

  async toggleHidden(fileId: string): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/toggle-hidden`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FileItem>(response);
  }

  async toggleFolderHidden(folderId: string): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}/toggle-hidden`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FolderItem>(response);
  }

  // File View/Download URL
  async getViewUrl(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/view`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ url: string }>(response);
    if (!data?.url) throw new Error('Görüntüleme linki alınamadı');
    return data.url;
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/download`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ url: string }>(response);
    if (!data?.url) throw new Error('İndirme linki alınamadı');
    return data.url;
  }

  // Hidden Files PIN
  async hasHiddenFilesPin(): Promise<{ hasPinSet: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/hidden-pin/has`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ hasPinSet: boolean }>(response);
  }

  async setHiddenFilesPin(pin: string): Promise<{ message: string; hasPinSet: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/hidden-pin/set`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ pin }),
    });
    return this.handleResponse<{ message: string; hasPinSet: boolean }>(response);
  }

  async verifyHiddenFilesPin(pin: string): Promise<{ valid: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/hidden-pin/verify`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ pin }),
    });
    return this.handleResponse<{ valid: boolean }>(response);
  }

  // User Profile
  async updateProfile(data: { name?: string; email?: string }): Promise<User> {
    const response = await fetch(`${this.baseUrl}/auth/update-profile`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    const result = await this.handleResponse<{ user: User }>(response);
    return result.user;
  }

  // User Preferences
  async updatePreferences(data: { trackShareLinks?: boolean; warnLargeFiles?: boolean }): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/update-preferences`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    await this.handleResponse(response);
  }

  // Email Verification
  async resendEmailVerification(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account/resend-verification`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  // Profile Photo Upload
  async uploadProfilePhoto(formData: FormData): Promise<{ profilePhoto: string }> {
    const token = await storage.getAccessToken();
    const response = await fetch(`${this.baseUrl}/auth/profile-photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return this.handleResponse<{ profilePhoto: string }>(response);
  }

  // Profile Photo Remove
  async removeProfilePhoto(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/profile-photo`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  // Change Password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await this.handleResponse(response);
  }

  // Forgot Password
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: await this.getHeaders(false),
      body: JSON.stringify({ email }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Two Factor
  async get2FAStatus(): Promise<{ enabled: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/2fa/status`, {
      method: 'GET',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ enabled: boolean }>(response);
  }

  async enable2FA(): Promise<{ qrCode: string; secret: string }> {
    const response = await fetch(`${this.baseUrl}/auth/2fa/enable`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ qrCode: string; secret: string }>(response);
  }

  async verify2FA(code: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/2fa/verify`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ code }),
    });
    return this.handleResponse<{ success: boolean }>(response);
  }

  async disable2FA(code: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/2fa/disable`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ code }),
    });
    return this.handleResponse<{ success: boolean }>(response);
  }

  // Team
  async createTeam(name: string, description?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/team/create`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ name, description }),
    });
    return this.handleResponse<any>(response);
  }

  async getMyTeams(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/team/teams`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any[]>(response);
  }

  async getTeamMembers(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/team/members`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any[]>(response);
  }

  async inviteToTeam(email: string, role: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/invite`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ email, role }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async removeTeamMember(memberId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/team/members/${memberId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async updateTeamMemberRole(memberId: string, role: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/team/members/${memberId}/role`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify({ role }),
    });
    await this.handleResponse(response);
  }

  async leaveTeam(teamId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/${teamId}/leave`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Team Files (Ekip Dosyaları)
  async getTeamFiles(teamId: string, folderId?: string): Promise<{ files: any[]; folders: any[] }> {
    const params = folderId ? `?folderId=${folderId}` : '';
    const response = await fetch(`${this.baseUrl}/api/team/${teamId}/files${params}`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: any[]; folders: any[] }>(response);
  }

  async shareFileWithTeam(fileId: string, teamId: string, encryptionData?: { teamDek: string; teamDekIv: string }): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/share-file`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ 
        fileId, 
        teamId,
        teamDek: encryptionData?.teamDek,
        teamDekIv: encryptionData?.teamDekIv
      }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async unshareFileFromTeam(fileId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/unshare-file`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ fileId }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async createTeamFolder(teamId: string, name: string, parentFolderId?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/team/folder`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ teamId, name, parentFolderId }),
    });
    return this.handleResponse<any>(response);
  }

  async uploadTeamFile(formData: FormData): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}/api/team/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        // Content-Type multipart/form-data için otomatik ayarlanır
      },
      body: formData,
    });
    return this.handleResponse<any>(response);
  }

  async deleteTeamFile(fileId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/file/${fileId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async deleteTeamFolder(folderId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/folder/${folderId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Ekip dosyası indirme URL'i al
  async getTeamFileDownloadUrl(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/download`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ url: string }>(response);
    if (!data?.url) throw new Error('İndirme linki alınamadı');
    return data.url;
  }

  // Ekip dosyası görüntüleme URL'i al
  async getTeamFileViewUrl(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/view`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ url: string }>(response);
    if (!data?.url) throw new Error('Görüntüleme linki alınamadı');
    return data.url;
  }

  // Ekip dosyası için paylaşım linki oluştur
  async shareTeamFile(fileId: string, expiresIn?: string, permission?: 'DOWNLOAD' | 'VIEW'): Promise<{ 
    shareUrl: string; 
    encryptionInfo?: {
      isEncrypted: boolean;
      edek: string | null;
      edekIv: string | null;
      cipherIv: string | null;
      metaNameEnc: string | null;
      metaNameIv: string | null;
    } | null;
  }> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/share`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ expiresIn: expiresIn || '7d', permission: permission || 'DOWNLOAD' }),
    });
    return this.handleResponse<{ 
      shareUrl: string; 
      encryptionInfo?: {
        isEncrypted: boolean;
        edek: string | null;
        edekIv: string | null;
        cipherIv: string | null;
        metaNameEnc: string | null;
        metaNameIv: string | null;
      } | null;
    }>(response);
  }

  // Ekip dosyası yeniden adlandır (ekip endpoint'i kullan)
  async renameTeamFile(fileId: string, newName: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/teams/file/${fileId}/rename`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify({ name: newName }),
    });
    return this.handleResponse<any>(response);
  }

  // Ekip dosyasını kişisel dosyalara kopyala
  async copyTeamFileToPersonal(fileId: string, folderId?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/teams/file/${fileId}/copy-to-personal`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ folderId }),
    });
    return this.handleResponse<any>(response);
  }

  async getMyTeamsWithRole(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/team/my-teams`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any[]>(response);
  }

  // Activities
  async getActivities(): Promise<{ activities: ActivityItem[], unreadCount: number }> {
    const response = await fetch(`${this.baseUrl}/api/activities`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ activities: ActivityItem[], unreadCount: number }>(response);
  }

  async clearActivities(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/account/activities`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async markAllActivitiesAsRead(): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/activities/read-all`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ success: boolean }>(response);
  }

  async deleteActivity(activityId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/activities/${activityId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ success: boolean }>(response);
  }

  // Resend email verification
  async resendVerification(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/account/resend-verification`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Change plan
  async changePlan(plan: 'FREE' | 'PRO' | 'BUSINESS'): Promise<{ message: string; plan: string }> {
    const response = await fetch(`${this.baseUrl}/account/plan`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ plan }),
    });
    return this.handleResponse<{ message: string; plan: string }>(response);
  }

  // Profile
  async getProfile(): Promise<{ user: User }> {
    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ user: User }>(response);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const response = await fetch(`${this.baseUrl}/account/storage`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<StorageInfo>(response);
  }

  async getFavoriteFolders(): Promise<{ folders: FolderItem[] }> {
    const response = await fetch(`${this.baseUrl}/files/folders/favorites`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ folders: FolderItem[] }>(response);
  }

  async permanentDeleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/permanent`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async unhideFile(fileId: string): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/unhide`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FileItem>(response);
  }

  async removeShare(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/unshare`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    await this.handleResponse(response);
  }

  async inviteTeamMember(email: string, role: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/api/team/invite`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ email, role }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  async updateFile(fileId: string, data: { originalName?: string }): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    const result = await this.handleResponse<{ file: FileItem }>(response);
    return result.file;
  }

  async updateFolder(folderId: string, data: { name?: string }): Promise<FolderItem> {
    const response = await fetch(`${this.baseUrl}/files/folders/${folderId}`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<FolderItem>(response);
  }

  // Quick Transfer
  async createTransfer(formData: FormData): Promise<{ link: string; shareLink: string }> {
    const token = await storage.getAccessToken();
    const response = await fetch(`${this.baseUrl}/files/quick-transfer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return this.handleResponse<{ link: string; shareLink: string }>(response);
  }

  async getTransferHistory(): Promise<{ transfers: any[] }> {
    const response = await fetch(`${this.baseUrl}/files/quick-transfer/history`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ transfers: any[] }>(response);
  }

  async deleteTransfer(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/quick-transfer/${id}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<void>(response);
  }

  async deleteExpiredTransfers(): Promise<{ deletedCount: number }> {
    const response = await fetch(`${this.baseUrl}/files/quick-transfer/expired`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ deletedCount: number }>(response);
  }

  // Transfer dosyasını hesaba kaydet
  async saveTransferToAccount(token: string, password?: string, folderId?: string): Promise<{ success: boolean; file: any; message: string }> {
    const response = await fetch(`${this.baseUrl}/files/quick-transfer/${token}/save`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ password, folderId }),
    });
    return this.handleResponse<{ success: boolean; file: any; message: string }>(response);
  }

  async getTransfer(code: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/transfers/${code}`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any>(response);
  }

  // File Requests (Dosya İstekleri)
  async getFileRequests(): Promise<{ requests: any[] }> {
    const response = await fetch(`${this.baseUrl}/file-requests`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ requests: any[] }>(response);
  }

  async getFileRequest(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/file-requests/${id}`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any>(response);
  }

  async createFileRequest(data: {
    title: string;
    description?: string;
    folderId?: string;
    expiresAt?: string;
    maxFileSize?: number;
    allowedTypes?: string;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/file-requests`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<any>(response);
  }

  async updateFileRequest(id: string, data: {
    title?: string;
    description?: string;
    expiresAt?: string;
    maxFileSize?: number;
    allowedTypes?: string;
  }): Promise<any> {
    const response = await fetch(`${this.baseUrl}/file-requests/${id}`, {
      method: 'PUT',
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<any>(response);
  }

  async deleteFileRequest(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/file-requests/${id}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<void>(response);
  }

  // Dosya isteğine yüklenen dosyayı kullanıcının dosyalarına kaydet
  async saveUploadedFileToFiles(uploadId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/file-requests/uploads/${uploadId}/save`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any>(response);
  }

  // Dosya isteğine yüklenen bekleyen dosyayı sil
  async deleteUploadedFile(uploadId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/file-requests/uploads/${uploadId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<void>(response);
  }

  async toggleFileRequest(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/file-requests/${id}/toggle`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<any>(response);
  }

  // Gallery (Fotoğraflar)
  async getMediaFiles(): Promise<{ files: FileItem[] }> {
    // Tüm dosyaları al ve medya olanları filtrele
    const response = await fetch(`${this.baseUrl}/files?includeAll=true`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ files: FileItem[] }>(response);
  }

  // File Versions (Sürüm Geçmişi)
  async getFileVersions(fileId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/versions`, {
      headers: await this.getHeaders(),
    });
    const data = await this.handleResponse<{ versions: any[] }>(response);
    return data.versions || [];
  }

  async restoreFileVersion(fileId: string, versionId: number): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<FileItem>(response);
  }

  // File Comments (Yorumlar)
  async updateFileComment(fileId: string, comment: string | null): Promise<FileItem> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      headers: await this.getHeaders(),
      body: JSON.stringify({ comment }),
    });
    const result = await this.handleResponse<{ file: FileItem }>(response);
    return result.file;
  }

  // Delete Account (Hesap Silme)
  async deleteAccount(password: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/account/delete`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
      body: JSON.stringify({ password }),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // File Comments (Dosya Yorumları)
  async getFileComments(fileId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/comments`, {
      method: 'GET',
      headers: await this.getHeaders(),
    });
    const result = await this.handleResponse<{ comments: any[] }>(response);
    return result.comments || [];
  }

  async addFileComment(fileId: string, comment: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/comments`, {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ comment }),
    });
    const result = await this.handleResponse<{ comment: any }>(response);
    return result.comment;
  }

  // Get Sent Invites (Gönderdiğim Davetler)
  async getSentInvites(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/teams/invites/sent`, {
      method: 'GET',
      headers: await this.getHeaders(),
    });
    const result = await this.handleResponse<{ invites: any[] }>(response);
    return result.invites || [];
  }

  // Delete Sent Invite (Gönderdiğim Daveti İptal Et)
  async deleteSentInvite(inviteId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/teams/invites/${inviteId}`, {
      method: 'DELETE',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }

  // Get Pending Invites (Bekleyen Davetler - Beni davet edenler)
  async getPendingInvites(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/teams/invites/pending`, {
      method: 'GET',
      headers: await this.getHeaders(),
    });
    const result = await this.handleResponse<{ invites: any[] }>(response);
    return result.invites || [];
  }

  // Leave Team (Ekipten Çık)
  async leaveTeam(teamId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/leave`, {
      method: 'POST',
      headers: await this.getHeaders(),
    });
    return this.handleResponse<{ message: string }>(response);
  }
}

export const api = new ApiService();

// Helper function to get token
export async function getToken(): Promise<string | null> {
  return await storage.getAccessToken();
}
