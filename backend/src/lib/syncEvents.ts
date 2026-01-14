// backend/src/lib/syncEvents.ts
import { emitToUser } from "./websocket";

export type SyncEventType = 
  | "file:uploaded"
  | "file:deleted"
  | "file:renamed"
  | "file:restored"
  | "file:moved"
  | "file:shared"
  | "file:unshared"
  | "file:favorite"
  | "file:unfavorite"
  | "file:hidden"
  | "file:unhidden"
  | "folder:created"
  | "folder:deleted"
  | "folder:renamed"
  | "folder:moved"
  | "folder:restored"
  | "folder:favorite"
  | "folder:unfavorite"
  | "folder:hidden"
  | "folder:unhidden"
  | "storage:updated"
  | "activity:new";

export interface SyncEvent {
  type: SyncEventType;
  timestamp: string;
  data: any;
}

/**
 * Kullanıcıya senkronizasyon eventi gönderir
 */
export function sendSyncEvent(userId: string, type: SyncEventType, data: any) {
  const event: SyncEvent = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
  
  emitToUser(userId, "sync", event);
}

/**
 * Dosya yükleme eventi
 */
export function notifyFileUploaded(userId: string, file: any) {
  sendSyncEvent(userId, "file:uploaded", {
    fileId: file.id,
    filename: file.filename,
    folderId: file.folderId,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
  });
}

/**
 * Dosya silme eventi
 */
export function notifyFileDeleted(userId: string, fileId: string, folderId?: string | null) {
  sendSyncEvent(userId, "file:deleted", {
    fileId,
    folderId,
  });
}

/**
 * Dosya yeniden adlandırma eventi
 */
export function notifyFileRenamed(userId: string, fileId: string, newFilename: string, folderId?: string | null) {
  sendSyncEvent(userId, "file:renamed", {
    fileId,
    filename: newFilename,
    folderId,
  });
}

/**
 * Dosya geri yükleme eventi
 */
export function notifyFileRestored(userId: string, fileId: string, folderId?: string | null) {
  sendSyncEvent(userId, "file:restored", {
    fileId,
    folderId,
  });
}

/**
 * Dosya taşıma eventi
 */
export function notifyFileMoved(userId: string, fileId: string, oldFolderId: string | null, newFolderId: string | null) {
  sendSyncEvent(userId, "file:moved", {
    fileId,
    oldFolderId,
    newFolderId,
  });
}

/**
 * Dosya paylaşım eventi
 */
export function notifyFileShared(userId: string, fileId: string, shareToken: string) {
  sendSyncEvent(userId, "file:shared", {
    fileId,
    shareToken,
  });
}

/**
 * Dosya paylaşım iptal eventi
 */
export function notifyFileUnshared(userId: string, fileId: string) {
  sendSyncEvent(userId, "file:unshared", {
    fileId,
  });
}

/**
 * Dosya favori eventi
 */
export function notifyFileFavorite(userId: string, fileId: string, isFavorite: boolean) {
  sendSyncEvent(userId, isFavorite ? "file:favorite" : "file:unfavorite", {
    fileId,
  });
}

/**
 * Dosya gizleme eventi
 */
export function notifyFileHidden(userId: string, fileId: string, isHidden: boolean) {
  sendSyncEvent(userId, isHidden ? "file:hidden" : "file:unhidden", {
    fileId,
  });
}

/**
 * Klasör oluşturma eventi
 */
export function notifyFolderCreated(userId: string, folder: any) {
  sendSyncEvent(userId, "folder:created", {
    folderId: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
  });
}

/**
 * Klasör silme eventi
 */
export function notifyFolderDeleted(userId: string, folderId: string, parentFolderId?: string | null) {
  sendSyncEvent(userId, "folder:deleted", {
    folderId,
    parentFolderId,
  });
}

/**
 * Klasör yeniden adlandırma eventi
 */
export function notifyFolderRenamed(userId: string, folderId: string, newName: string) {
  sendSyncEvent(userId, "folder:renamed", {
    folderId,
    name: newName,
  });
}

/**
 * Klasör geri yükleme eventi
 */
export function notifyFolderRestored(userId: string, folderId: string, parentFolderId?: string | null) {
  sendSyncEvent(userId, "folder:restored", {
    folderId,
    parentFolderId,
  });
}

/**
 * Klasör favori eventi
 */
export function notifyFolderFavorite(userId: string, folderId: string, isFavorite: boolean) {
  sendSyncEvent(userId, isFavorite ? "folder:favorite" : "folder:unfavorite", {
    folderId,
  });
}

/**
 * Depolama güncelleme eventi
 */
export function notifyStorageUpdated(userId: string, storageInfo: any) {
  sendSyncEvent(userId, "storage:updated", storageInfo);
}

/**
 * Yeni aktivite eventi
 */
export function notifyNewActivity(userId: string, activity: any) {
  sendSyncEvent(userId, "activity:new", activity);
}
