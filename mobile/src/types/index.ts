export interface User {
  id: string;
  email: string;
  name?: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  storageLimitBytes: number;
  usedStorageBytes: number;
  createdAt: string;
  role?: 'user' | 'admin';
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  avatarUrl?: string;
  profilePhoto?: string;
}

export interface FileItem {
  id: string;
  filename: string;
  originalName: string;
  sizeBytes: number;
  size: number;
  mimeType: string | null;
  extension?: string | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  folderId?: string | null;
  isFavorite?: boolean;
  isDeleted?: boolean;
  isHidden?: boolean;
  isEncrypted?: boolean;
  // Şifreli dosya metadata'sı (client-side decrypt için)
  metaNameEnc?: string | null;
  metaNameIv?: string | null;
  cipherIv?: string | null;
  edek?: string | null;
  edekIv?: string | null;
  // Hızlı transfer gönderen bilgileri
  receivedFromEmail?: string | null;
  receivedFromName?: string | null;
  receivedAt?: string | null;
}

export interface FolderItem {
  id: string;
  name: string;
  parentFolderId?: string | null;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  fileCount?: number;
  totalSize?: number;
  isFavorite?: boolean;
  isDeleted?: boolean;
}

export type Folder = FolderItem;

export interface FilesResponse {
  files: FileItem[];
  folders: FolderItem[];
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: User;
}

export interface ApiError {
  error: string;
  message?: string;
}

export interface StorageInfo {
  plan: string;
  storageLimitBytes: number;
  trashLimitBytes: number;
  usedStorageBytes: number;
  trashStorageBytes: number;
  percentActive: number;
  percentTrash: number;
  usedStorage: number;
  totalStorage: number;
  categoryBytes: {
    image: number;
    media: number;
    document: number;
    other: number;
  };
  categoryCounts: {
    image: number;
    media: number;
    document: number;
    other: number;
  };
  hiddenFilesCount: number;
  hiddenFilesBytes: number;
}

export interface ActivityItem {
  id: string;
  type: 'upload' | 'download' | 'share' | 'delete' | 'rename' | 'restore' | 'folder_create' | 'move' | 'favorite';
  description: string;
  fileName?: string;
  fileId?: string;
  folderId?: string;
  folderName?: string;
  actorName?: string;
  actorEmail?: string;
  timestamp?: string;
  createdAt: string;
  isRead?: boolean;
  metadata?: {
    oldName?: string;
    newName?: string;
    sharedWith?: string;
    targetFolder?: string;
  };
}
