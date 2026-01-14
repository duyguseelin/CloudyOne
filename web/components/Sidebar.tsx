"use client";

import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import { getAccountStorage, clearAuth, getActivities, markActivitiesAsRead, deleteActivity } from "../lib/api";

// Etkinlik tipi
type ActivityItem = {
  id: string;
  type: 'upload' | 'download' | 'share' | 'delete' | 'rename' | 'restore' | 'folder_create' | 'move' | 'login' | 'logout' | 'file_upload' | 'file_delete' | 'file_share' | 'file_download' | 'file_move' | 'share_view' | 'file_request_created' | 'file_request_expired' | 'file_request_upload' | 'team_file_upload' | 'team_file_delete' | 'team_folder_create' | 'team_folder_delete' | 'team_file_comment' | 'team_file_download' | 'team_member_joined' | 'team_member_left' | 'team_invite_sent';
  fileName: string | null;
  folderName?: string | null;
  fileId?: string;
  description?: string;
  details?: string | null;
  actorName?: string;
  teamName?: string | null;
  timestamp: string;
  createdAt?: string;
  isRead: boolean;
};

interface SidebarProps {
  user: any;
  onLogout?: () => void;
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Storage state
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [usage, setUsage] = useState<{ usedStorageBytes: number; storageLimitBytes: number } | null>(null);
  

  
  // Etkinlik Paneli
  const [showActivityPanel, setShowActivityPanel] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  
  // Logout confirm
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  


  // Storage yükle
  useEffect(() => {
    loadStorage();
  }, []);

  const loadStorage = async () => {
    try {
      const data = await getAccountStorage();
      if (data) {
        setStorageInfo(data);
        setUsage({
          usedStorageBytes: data.usedStorageBytes || 0,
          storageLimitBytes: data.storageLimitBytes || 1
        });
      }
    } catch (err) {
      console.error("Storage info yüklenemedi:", err);
    }
  };

  // Dışarı tıklama kontrolleri
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activityPanelRef.current && !activityPanelRef.current.contains(event.target as Node)) {
        setShowActivityPanel(false);
      }
    };
    
    if (showActivityPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActivityPanel]);

  // Etkinlikleri API'den yükle
  const loadActivities = async (page: number = 1, reset: boolean = false) => {
    if (activitiesLoading) return;
    setActivitiesLoading(true);
    try {
      const response = await getActivities();
      const activitiesData = response?.activities || [];
      
      // API'den gelen verileri ActivityItem formatına dönüştür
      const formattedActivities: ActivityItem[] = activitiesData.map((item: any) => {
        // Metadata'yı parse et
        let metadata: any = null;
        if (item.metadata) {
          try {
            metadata = typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata;
          } catch (e) {
            metadata = null;
          }
        }
        
        // FILE_REQUEST_UPLOAD için özel detay
        let details = item.details || null;
        if (item.type === 'FILE_REQUEST_UPLOAD' && metadata) {
          const uploaderInfo = metadata.uploaderName || metadata.uploaderEmail || 'Anonim';
          const requestTitle = metadata.requestTitle || 'Dosya İsteği';
          details = `"${requestTitle}" isteğine ${uploaderInfo} tarafından yüklendi`;
        }
        
        return {
          id: item.id,
          type: item.type || 'upload',
          fileName: item.fileName || null,
          folderName: item.folderName || null,
          description: item.description || '',
          details: details,
          actorName: item.actorName || null,
          teamName: item.teamName || metadata?.teamName || null,
          timestamp: item.createdAt || new Date().toISOString(),
          isRead: item.isRead ?? true,
        };
      });
      
      setActivities(formattedActivities);
      setUnreadCount(formattedActivities.filter((a: ActivityItem) => !a.isRead).length);
      setHasMoreActivities(false); // API tek seferde tüm verileri dönüdürüyor
    } catch (error) {
      console.error('Etkinlikler yüklenemedi:', error);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markActivitiesAsRead();
      setActivities(prev => prev.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Etkinlikler okundu olarak işaretlenemedi:', error);
    }
  };

  const handleDeleteActivity = async (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteActivity(activityId);
      setActivities(prev => {
        const updated = prev.filter(a => a.id !== activityId);
        setUnreadCount(updated.filter(a => !a.isRead).length);
        return updated;
      });
    } catch (error) {
      console.error('Etkinlik silinemedi:', error);
    }
  };

  const handleActivityScroll = () => {
    if (!activityScrollRef.current || activitiesLoading || !hasMoreActivities) return;
    const { scrollTop, scrollHeight, clientHeight } = activityScrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      loadActivities(activitiesPage + 1);
    }
  };

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

  const getActivityIcon = (type: ActivityItem['type']): { icon: React.ReactNode; color: string; bg: string } => {
    const icons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
      upload: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      file_upload: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      download: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' },
      file_download: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' },
      share: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
      file_share: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
      share_view: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' },
      delete: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
      file_delete: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
      rename: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
      restore: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' },
      folder_create: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" /></svg>, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' },
      file_move: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" /></svg>, color: '#64748b', bg: 'rgba(100, 116, 139, 0.2)' },
      move: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" /></svg>, color: '#64748b', bg: 'rgba(100, 116, 139, 0.2)' },
      login: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      logout: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>, color: '#64748b', bg: 'rgba(100, 116, 139, 0.2)' },
      file_request_created: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' },
      file_request_expired: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
      file_request_upload: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" /><path d="M9 13h2v5a1 1 0 11-2 0v-5z" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      // Ekip etkinlikleri
      team_file_upload: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      team_file_delete: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
      team_folder_create: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>, color: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' },
      team_folder_delete: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
      team_file_comment: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' },
      team_file_download: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' },
      team_member_joined: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>, color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' },
      team_member_left: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" /></svg>, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
      team_invite_sent: { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.2)' },
    };
    return icons[type] || { icon: <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="6" /></svg>, color: '#64748b', bg: 'rgba(100, 116, 139, 0.2)' };
  };

  const getActivityMessage = (type: string): string => {
    const messages: Record<string, string> = {
      upload: 'Dosya yüklendi',
      file_upload: 'Dosya yüklendi',
      download: 'Dosya indirildi',
      file_download: 'Dosya indirildi',
      share: 'Dosya paylaşıldı',
      file_share: 'Dosya paylaşıldı',
      share_view: 'Paylaşılan dosya görüntülendi',
      delete: 'Dosya silindi',
      file_delete: 'Dosya silindi',
      rename: 'Dosya yeniden adlandırıldı',
      restore: 'Dosya geri yüklendi',
      folder_create: 'Klasör oluşturuldu',
      file_move: 'Dosya taşındı',
      move: 'Dosya taşındı',
      login: 'Giriş yapıldı',
      logout: 'Çıkış yapıldı',
      file_request_created: 'Dosya isteği oluşturuldu',
      file_request_expired: 'Dosya isteğinin süresi doldu',
      file_request_upload: 'Dosya isteğine yükleme yapıldı',
      // Ekip etkinlikleri
      team_file_upload: 'Ekibe dosya yüklendi',
      team_file_delete: 'Ekip dosyası silindi',
      team_folder_create: 'Ekip klasörü oluşturuldu',
      team_folder_delete: 'Ekip klasörü silindi',
      team_file_comment: 'Dosyaya yorum yapıldı',
      team_file_download: 'Ekip dosyası indirildi',
      team_member_joined: 'Ekibe yeni üye katıldı',
      team_member_left: 'Üye ekipten ayrıldı',
      team_invite_sent: 'Ekip daveti gönderildi',
    };
    return messages[type] || type;
  };

  useEffect(() => {
    if (showActivityPanel && activities.length === 0) {
      loadActivities(1, true);
    }
    // Panel açıldığında okunmamış varsa okundu işaretle
    if (showActivityPanel && unreadCount > 0) {
      markAllAsRead();
    }
  }, [showActivityPanel]);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Grafik için kompakt format - sayı ve birim ayrı
  const formatSizeCompact = (bytes: number): { value: string; unit: string } => {
    if (bytes === 0) return { value: '0', unit: 'B' };
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return { value: value.toString(), unit: sizes[i] };
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    clearAuth();
    if (onLogout) onLogout();
    router.replace('/login');
  };

  // Aktif sayfa kontrolü
  const isActive = (path: string) => pathname === path;
  const isFilesPage = pathname === '/files';

  return (
    <>
    <aside className="files-sidebar">
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
        <div style={{ width: '36px', height: '36px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>☁️</div>
        <span>CloudyOne</span>
      </div>
      
      {/* Navigation */}
      <nav className="sidebar-nav">
        <button className={`sidebar-nav-item ${isFilesPage ? 'active' : ''}`} onClick={() => router.push('/files')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" /></svg>
          <span>Dosyalarım</span>
        </button>
        
        <button className="sidebar-nav-item" onClick={() => router.push('/files?filter=favorites')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
          <span>Favoriler</span>
        </button>
        
        <button className="sidebar-nav-item" onClick={() => router.push('/files?filter=shared')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
          <span>Paylaşılanlar</span>
        </button>
        
        <button className="sidebar-nav-item" onClick={() => router.push('/files?filter=hidden')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" /><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
          <span>Gizli</span>
        </button>
        
        <button className="sidebar-nav-item" onClick={() => router.push('/files?filter=trash')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span>Çöp Kutusu</span>
        </button>
        
        {/* Modüller */}
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '0.75rem' }}>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0.75rem', marginBottom: '0.5rem', display: 'block' }}>Modüller</span>
          
          <button className={`sidebar-nav-item ${isActive('/files/gallery') ? 'active' : ''}`} onClick={() => router.push('/files/gallery')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
            <span>Fotoğraflar</span>
          </button>
          
          <button className={`sidebar-nav-item ${isActive('/files/requests') ? 'active' : ''}`} onClick={() => router.push('/files/requests')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            <span>Dosya İstekleri</span>
          </button>
          
          <button className={`sidebar-nav-item ${isActive('/files/mobile') ? 'active' : ''}`} onClick={() => router.push('/files/mobile')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" /></svg>
            <span>Mobil Uygulama</span>
          </button>
          
          <button className={`sidebar-nav-item ${isActive('/files/team') ? 'active' : ''}`} onClick={() => router.push('/files/team')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
            <span>Ekip Yönetimi</span>
          </button>
          
          {/* Hızlı Transfer */}
          <button
            className={`sidebar-nav-item ${isActive('/transfer') ? 'active' : ''}`}
            onClick={() => router.push('/transfer')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
            <span>Hızlı Transfer</span>
          </button>
        </div>
      </nav>
      
      {/* Depolama Grafiği */}
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
        
        // Kategori bilgileri
        const categoryBytes = storageInfo?.categoryBytes || { image: 0, media: 0, document: 0, other: 0 };
        const categoryCounts = storageInfo?.categoryCounts || { image: 0, media: 0, document: 0, other: 0 };
        const hiddenCount = storageInfo?.hiddenFilesCount || 0;
        const hiddenBytes = storageInfo?.hiddenFilesBytes || 0;
        
        const circumference = 2 * Math.PI * 80;
        
        const imagePercent = limitBytes > 0 ? (categoryBytes.image / limitBytes) * 100 : 0;
        const mediaPercent = limitBytes > 0 ? (categoryBytes.media / limitBytes) * 100 : 0;
        const documentPercent = limitBytes > 0 ? (categoryBytes.document / limitBytes) * 100 : 0;
        const otherPercent = limitBytes > 0 ? (categoryBytes.other / limitBytes) * 100 : 0;
        const hiddenPercent = limitBytes > 0 ? (hiddenBytes / limitBytes) * 100 : 0;
        
        const imageDash = (imagePercent / 100) * circumference;
        const mediaDash = (mediaPercent / 100) * circumference;
        const documentDash = (documentPercent / 100) * circumference;
        const otherDash = (otherPercent / 100) * circumference;
        const hiddenDash = (hiddenPercent / 100) * circumference;
        
        const imageOffset = -circumference / 4;
        const mediaOffset = imageOffset - imageDash;
        const documentOffset = mediaOffset - mediaDash;
        const otherOffset = documentOffset - documentDash;
        const hiddenOffset = otherOffset - otherDash;
        
        return (
          <div className="storage-chart-widget">
            <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#e0e7ff' }}>
                Depolama Detayı
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                {formatSize(usedBytes)} / {formatSize(limitBytes)}
              </p>
            </div>
            <div className="storage-chart-circle">
              <svg viewBox="0 0 200 200" className="storage-svg">
                <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="20" />
                {imageDash > 0 && <circle cx="100" cy="100" r="80" fill="none" stroke="#f97316" strokeWidth="20" strokeDasharray={`${imageDash} ${circumference}`} strokeDashoffset={imageOffset} strokeLinecap="butt" />}
                {mediaDash > 0 && <circle cx="100" cy="100" r="80" fill="none" stroke="#eab308" strokeWidth="20" strokeDasharray={`${mediaDash} ${circumference}`} strokeDashoffset={mediaOffset} strokeLinecap="butt" />}
                {documentDash > 0 && <circle cx="100" cy="100" r="80" fill="none" stroke="#3b82f6" strokeWidth="20" strokeDasharray={`${documentDash} ${circumference}`} strokeDashoffset={documentOffset} strokeLinecap="butt" />}
                {otherDash > 0 && <circle cx="100" cy="100" r="80" fill="none" stroke="#a855f7" strokeWidth="20" strokeDasharray={`${otherDash} ${circumference}`} strokeDashoffset={otherOffset} strokeLinecap="butt" />}
                {hiddenDash > 0 && <circle cx="100" cy="100" r="80" fill="none" stroke="#6366f1" strokeWidth="20" strokeDasharray={`${hiddenDash} ${circumference}`} strokeDashoffset={hiddenOffset} strokeLinecap="butt" />}
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
                <span className="category-name">Resimler {categoryCounts.image > 0 && `(${categoryCounts.image})`}</span>
                <span className="category-percent">{formatSize(categoryBytes.image)}</span>
              </div>
              <div className="storage-category">
                <div className="category-color" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}></div>
                <span className="category-name">Dokümanlar {categoryCounts.document > 0 && `(${categoryCounts.document})`}</span>
                <span className="category-percent">{formatSize(categoryBytes.document)}</span>
              </div>
              <div className="storage-category">
                <div className="category-color" style={{ background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' }}></div>
                <span className="category-name">Diğer {categoryCounts.other > 0 && `(${categoryCounts.other})`}</span>
                <span className="category-percent">{formatSize(categoryBytes.other)}</span>
              </div>
              <div className="storage-category">
                <div className="category-color" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' }}></div>
                <span className="category-name">Çöp Kutusu</span>
                <span className="category-percent">{formatSize(storageInfo?.trashStorageBytes || 0)}</span>
              </div>
              <div className="storage-category">
                <div className="category-color" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}></div>
                <span className="category-name">Gizli {hiddenCount > 0 && `(${hiddenCount})`}</span>
                <span className="category-percent">{formatSize(hiddenBytes)}</span>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Footer */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', justifyContent: 'center' }}>
          <button 
            onClick={() => router.push('/settings')}
            className="sidebar-nav-item"
            style={{ justifyContent: 'center', padding: 0, borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center' }}
          >
            <div className="user-avatar" style={{ margin: 0, width: '48px', height: '48px', borderRadius: '50%', fontSize: '1rem' }}>
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
          </button>
          
          {/* Bildirim/Etkinlik Butonu */}
          <button 
            onClick={() => setShowActivityPanel(!showActivityPanel)}
            className="sidebar-nav-item"
            style={{ 
              justifyContent: 'center', 
              padding: '0.625rem',
              background: showActivityPanel ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)',
              border: showActivityPanel ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              position: 'relative'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#a78bfa' }}>
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            {/* Okunmamış sayacı */}
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '16px',
                height: '16px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                borderRadius: '50%',
                fontSize: '0.6rem',
                fontWeight: 700,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(15, 23, 42, 0.9)'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            className="sidebar-nav-item"
            style={{ 
              justifyContent: 'center', 
              padding: '0.625rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '50%',
              width: '48px',
              height: '48px'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      
    </aside>
    
    {/* Etkinlik Paneli - Portal ile body'ye render edilir */}
    {showActivityPanel && typeof document !== 'undefined' && ReactDOM.createPortal(
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
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.1)',
            zIndex: 2147483647,
            overflow: 'hidden',
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
                <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, color: '#f1f5f9' }}>
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
                justifyContent: 'center'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          {/* Okunmamış Badge ve Temizle Butonu */}
          {unreadCount > 0 && (
            <div style={{
              padding: '0.75rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
              background: 'rgba(139, 92, 246, 0.05)'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 500 }}>
                {unreadCount} okunmamış bildirim
              </span>
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
                  cursor: 'pointer'
                }}
              >
                Tümünü Okundu İşaretle
              </button>
            </div>
          )}
          
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
          >
            {activities.length === 0 && !activitiesLoading ? (
              <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
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
                {activities.map((activity) => {
                  const { icon, color, bg } = getActivityIcon(activity.type);
                  return (
                    <div 
                      key={activity.id}
                      style={{
                        padding: '0.875rem 1rem',
                        margin: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        background: activity.isRead ? 'transparent' : 'rgba(139, 92, 246, 0.08)',
                        border: activity.isRead ? '1px solid transparent' : '1px solid rgba(139, 92, 246, 0.15)',
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: color
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0,
                          fontSize: '0.8125rem',
                          color: '#e2e8f0',
                          lineHeight: 1.4
                        }}>
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{activity.description || getActivityMessage(activity.type)}</span>
                          {activity.fileName && (
                            <>
                              {' '}
                              <span style={{ 
                                color: '#94a3b8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'inline-block',
                                maxWidth: '200px',
                                verticalAlign: 'bottom'
                              }}>{activity.fileName}</span>
                            </>
                          )}
                        </p>
                        {activity.details && (
                          <p style={{
                            margin: '0.25rem 0 0',
                            fontSize: '0.6875rem',
                            color: '#64748b'
                          }}>
                            {activity.details}
                          </p>
                        )}
                        <p style={{
                          margin: '0.25rem 0 0',
                          fontSize: '0.6875rem',
                          color: '#64748b'
                        }}>
                          {formatActivityTime(activity.timestamp)}
                        </p>
                      </div>
                      {/* Silme butonu */}
                      <button
                        onClick={(e) => handleDeleteActivity(activity.id, e)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginLeft: '8px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Etkinliği sil"
                      >
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {!activity.isRead && (
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          flexShrink: 0,
                          marginTop: '0.5rem'
                        }} />
                      )}
                    </div>
                  );
                })}
                {activitiesLoading && (
                  <div style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      margin: '0 auto',
                      border: '2px solid rgba(139, 92, 246, 0.2)',
                      borderTopColor: '#8b5cf6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
      document.body
    )}
    
    {/* Logout Modal - Portal ile body'ye render edilir */}
    {showLogoutConfirm && typeof document !== 'undefined' && ReactDOM.createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483647 }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.98)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '20px', padding: '2rem', maxWidth: '320px', width: '90%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', zIndex: 2147483647 }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 600, color: '#e2e8f0' }}>Çıkış Yap</h3>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Hesabınızdan çıkış yapmak istediğinize emin misiniz?</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '10px', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>İptal</button>
            <button onClick={handleLogout} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>Çıkış Yap</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
