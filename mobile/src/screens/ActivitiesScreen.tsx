import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { api } from '../services/api';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

interface Activity {
  id: string;
  type: string;
  description: string;
  fileName: string | null;
  details: string | null;
  createdAt: string;
  ipAddress?: string | null;
  isRead: boolean;
}

interface ActivitiesScreenProps {
  onActivitiesRead?: () => void;
}

const ActivitiesScreen: React.FC<ActivitiesScreenProps> = ({ onActivitiesRead }) => {
  const navigation = useNavigation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
    }, [])
  );

  const loadActivities = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const response = await api.getActivities();
      const activitiesData = response?.activities || [];
      const unread = response?.unreadCount || 0;
      
      // Map ActivityItem to Activity format
      const mappedActivities: Activity[] = Array.isArray(activitiesData) 
        ? activitiesData.map((item: any) => {
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
            let details = (item as any).details || null;
            if (item.type === 'FILE_REQUEST_UPLOAD' && metadata) {
              const uploaderInfo = metadata.uploaderName || metadata.uploaderEmail || 'Anonim';
              const requestTitle = metadata.requestTitle || 'Dosya İsteği';
              details = `"${requestTitle}" - ${uploaderInfo}`;
            }
            
            return {
              id: item.id,
              type: item.type,
              description: item.description || item.type,
              fileName: item.fileName || null,
              details: details,
              createdAt: item.createdAt,
              ipAddress: (item as any).ipAddress || null,
              isRead: item.isRead ?? true,
            };
          })
        : [];
      setActivities(mappedActivities);
      setUnreadCount(unread);
      
      // Sayfa açıldığında okunmamış etkinlikleri okundu olarak işaretle
      if (unread > 0) {
        markAllAsRead();
      }
    } catch (error) {
      console.error('Etkinlikler yüklenemedi:', error);
      setActivities([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.markAllActivitiesAsRead();
      setActivities(prev => prev.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
      // Tab bar badge'ini güncelle
      if (onActivitiesRead) {
        onActivitiesRead();
      }
    } catch (error) {
      console.error('Etkinlikler okundu olarak işaretlenemedi:', error);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await api.deleteActivity(activityId);
      setActivities(prev => prev.filter(a => a.id !== activityId));
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Etkinlik silinemedi');
    }
  };

  const handleClearActivities = () => {
    if (activities.length === 0) return;
    
    Alert.alert(
      'Etkinlikleri Temizle',
      'Tüm etkinlik geçmişiniz silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.clearActivities();
              setActivities([]);
              Alert.alert('Başarılı', 'Etkinlik geçmişi temizlendi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  const getActivityIcon = (type: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    const iconMap: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
      'login': { name: 'log-in', color: colors.success },
      'logout': { name: 'log-out', color: colors.textMuted },
      'upload': { name: 'cloud-upload', color: colors.success },
      'file_upload': { name: 'cloud-upload', color: colors.success },
      'download': { name: 'cloud-download', color: colors.info },
      'file_download': { name: 'cloud-download', color: colors.info },
      'share': { name: 'share-social', color: colors.secondary },
      'file_share': { name: 'share-social', color: colors.secondary },
      'share_view': { name: 'eye', color: colors.info },
      'unshare': { name: 'share-social-outline', color: colors.warning },
      'delete': { name: 'trash', color: colors.error },
      'file_delete': { name: 'trash', color: colors.error },
      'rename': { name: 'pencil', color: colors.warning },
      'restore': { name: 'refresh', color: colors.info },
      'folder_create': { name: 'folder-open', color: colors.secondary },
      'file_move': { name: 'swap-horizontal', color: colors.textMuted },
      'move': { name: 'swap-horizontal', color: colors.textMuted },
      'security': { name: 'shield-checkmark', color: colors.warning },
      'warning': { name: 'warning', color: colors.error },
      'file_request_created': { name: 'cloud-upload-outline', color: colors.info },
      'file_request_expired': { name: 'time', color: colors.warning },
      'file_request_upload': { name: 'cloud-done', color: colors.success },
    };
    return iconMap[type] || { name: 'ellipse', color: colors.textMuted };
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderActivity = ({ item }: { item: Activity }) => {
    const icon = getActivityIcon(item.type);
    
    return (
      <View style={[styles.activityCard, !item.isRead && styles.activityCardUnread]}>
        <View style={[styles.activityIcon, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name} size={22} color={icon.color} />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {item.description}
          </Text>
          {item.fileName && (
            <Text style={styles.activityFileName} numberOfLines={1}>
              {item.fileName}
            </Text>
          )}
          {item.details && (
            <Text style={styles.activityText} numberOfLines={1}>
              {item.details}
            </Text>
          )}
        </View>
        <View style={styles.activityRight}>
          <Text style={styles.activityTime}>{formatDate(item.createdAt)}</Text>
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => handleDeleteActivity(item.id)}
          >
            <Ionicons name="close" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
      <LinearGradient
        colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Etkinlikler</Text>
          <View style={styles.headerRight}>
            {activities.length > 0 && (
              <TouchableOpacity onPress={handleClearActivities} style={styles.clearButton}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={activities}
            keyExtractor={(item) => item.id}
            renderItem={renderActivity}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadActivities(true)}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyText}>Etkinlik yok</Text>
                <Text style={styles.emptySubtext}>
                  Dosya işlemleriniz burada görünecek
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDarker,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.error}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  activityCardUnread: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  activityTitle: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  activityFileName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.primary,
    marginBottom: 2,
  },
  activityText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  activityTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${colors.error}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default ActivitiesScreen;
