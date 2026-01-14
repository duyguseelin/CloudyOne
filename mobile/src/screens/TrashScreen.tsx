import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { FileItem, FolderItem } from '../types';
import { colors, borderRadius, fontSize, spacing } from '../constants/theme';
import { storage } from '../utils/storage';
import { getMasterKey } from '../crypto';

const TrashScreen: React.FC = () => {
  const navigation = useNavigation();
  const [trashFiles, setTrashFiles] = useState<FileItem[]>([]);
  const [trashFolders, setTrashFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState(30);

  useFocusEffect(
    useCallback(() => {
      loadTrash();
      loadPreferences();
    }, [])
  );

  const loadPreferences = async () => {
    const days = await storage.getTrashAutoDeleteDays();
    setAutoDeleteDays(days);
  };

  const loadTrash = async () => {
    try {
      setLoading(true);
      const response = await api.getTrash();
      
      // Şifrelenmiş dosya adlarını çöz
      const decryptedFiles = await Promise.all(
        (response.files || []).map(async (file: FileItem) => {
          if (file.isEncrypted && (file as any).metaNameEnc && (file as any).metaNameIv) {
            try {
              const masterKey = getMasterKey();
              const { decryptFilename } = await import('../crypto/encrypt');
              const { base64ToBytes } = await import('../crypto/kdf');
              
              const metaNameIv = base64ToBytes((file as any).metaNameIv);
              const decryptedName = await decryptFilename(masterKey, metaNameIv, (file as any).metaNameEnc);
              
              return { ...file, filename: decryptedName, originalName: decryptedName };
            } catch (error) {
              console.warn('Dosya adı çözülemedi:', file.id, error);
              return { ...file, filename: '🔒 Şifreli Dosya' };
            }
          }
          return file;
        })
      );
      
      setTrashFiles(decryptedFiles);
      setTrashFolders(response.folders || []);
    } catch (error) {
      console.error('Çöp kutusu yüklenemedi:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Dosya geri yükleme
  const handleRestoreFile = async (fileId: string) => {
    try {
      await api.restoreFile(fileId);
      loadTrash();
      Alert.alert('Başarılı', 'Dosya geri yüklendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Geri yükleme başarısız');
    }
  };

  // Klasör geri yükleme
  const handleRestoreFolder = async (folderId: string) => {
    try {
      await api.restoreFolder(folderId);
      loadTrash();
      Alert.alert('Başarılı', 'Klasör geri yüklendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Geri yükleme başarısız');
    }
  };

  // Dosya kalıcı silme
  const handlePermanentDeleteFile = (fileId: string, filename: string) => {
    Alert.alert(
      'Kalıcı Silme',
      `"${filename}" dosyası kalıcı olarak silinecek. Bu işlem geri alınamaz!`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kalıcı Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.permanentDelete(fileId);
              loadTrash();
              Alert.alert('Başarılı', 'Dosya kalıcı olarak silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Silme işlemi başarısız');
            }
          },
        },
      ]
    );
  };

  // Klasör kalıcı silme
  const handlePermanentDeleteFolder = (folderId: string, folderName: string) => {
    Alert.alert(
      'Kalıcı Silme',
      `"${folderName}" klasörü ve içindeki tüm dosyalar kalıcı olarak silinecek. Bu işlem geri alınamaz!`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kalıcı Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.permanentDeleteFolder(folderId);
              loadTrash();
              Alert.alert('Başarılı', 'Klasör kalıcı olarak silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Silme işlemi başarısız');
            }
          },
        },
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (trashFiles.length === 0) return;
    
    Alert.alert(
      'Çöp Kutusunu Boşalt',
      'Tüm dosyalar kalıcı olarak silinecek. Bu işlem geri alınamaz!',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Boşalt',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.emptyTrash();
              setTrashFiles([]);
              setTrashFolders([]);
              Alert.alert('Başarılı', 'Çöp kutusu boşaltıldı');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  const getFileIcon = (mimeType: string | null | undefined): keyof typeof Ionicons.glyphMap => {
    if (!mimeType) return 'document-outline';
    if (mimeType.startsWith('image/')) return 'image-outline';
    if (mimeType.startsWith('video/')) return 'videocam-outline';
    if (mimeType.includes('pdf')) return 'document-text-outline';
    return 'document-outline';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDaysRemaining = (deletedAt: string | undefined, updatedAt: string | undefined, createdAt: string): number => {
    // Klasörler için deletedAt yok, updatedAt kullan (silme zamanı)
    const deleted = new Date(deletedAt || updatedAt || createdAt);
    const now = new Date();
    const diffTime = autoDeleteDays - Math.floor((now.getTime() - deleted.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffTime);
  };

  // Klasör render
  const renderFolderItem = (item: FolderItem) => {
    const daysRemaining = getDaysRemaining(item.deletedAt, item.updatedAt, item.createdAt);
    
    return (
      <View style={styles.trashCard}>
        <View style={styles.trashItemHeader}>
          <View style={[styles.itemIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Ionicons name="folder" size={24} color={colors.primary} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.trashMeta}>
              <Text style={styles.itemMeta}>Klasör</Text>
              <View style={[styles.daysTag, daysRemaining <= 7 && styles.daysTagDanger]}>
                <Ionicons name="time-outline" size={12} color={daysRemaining <= 7 ? colors.error : colors.warning} />
                <Text style={[styles.daysText, daysRemaining <= 7 && styles.daysTextDanger]}>
                  {daysRemaining} gün
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.trashActions}>
          <TouchableOpacity 
            style={[styles.trashActionBtn, styles.restoreBtn]}
            onPress={() => handleRestoreFolder(item.id)}
          >
            <Ionicons name="refresh" size={18} color={colors.success} />
            <Text style={[styles.trashActionText, { color: colors.success }]}>Geri Yükle</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.trashActionBtn, styles.deleteBtn]}
            onPress={() => handlePermanentDeleteFolder(item.id, item.name)}
          >
            <Ionicons name="trash" size={18} color={colors.error} />
            <Text style={[styles.trashActionText, { color: colors.error }]}>Kalıcı Sil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Dosya render
  const renderFileItem = (item: FileItem) => {
    const daysRemaining = getDaysRemaining(item.deletedAt, item.updatedAt, item.createdAt);
    
    return (
      <View style={styles.trashCard}>
        <View style={styles.trashItemHeader}>
          <View style={[styles.itemIcon, { backgroundColor: `${colors.error}20` }]}>
            <Ionicons name={getFileIcon(item.mimeType)} size={24} color={colors.error} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{item.filename}</Text>
            <View style={styles.trashMeta}>
              <Text style={styles.itemMeta}>{formatFileSize(item.sizeBytes)}</Text>
              <View style={[styles.daysTag, daysRemaining <= 7 && styles.daysTagDanger]}>
                <Ionicons name="time-outline" size={12} color={daysRemaining <= 7 ? colors.error : colors.warning} />
                <Text style={[styles.daysText, daysRemaining <= 7 && styles.daysTextDanger]}>
                  {daysRemaining} gün
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.trashActions}>
          <TouchableOpacity 
            style={[styles.trashActionBtn, styles.restoreBtn]}
            onPress={() => handleRestoreFile(item.id)}
          >
            <Ionicons name="refresh" size={18} color={colors.success} />
            <Text style={[styles.trashActionText, { color: colors.success }]}>Geri Yükle</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.trashActionBtn, styles.deleteBtn]}
            onPress={() => handlePermanentDeleteFile(item.id, item.filename)}
          >
            <Ionicons name="trash" size={18} color={colors.error} />
            <Text style={[styles.trashActionText, { color: colors.error }]}>Kalıcı Sil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const totalItems = trashFiles.length + trashFolders.length;

  // Section data hazırla - klasörler ve dosyalar
  const sections: { title: string; data: any[]; type: 'folder' | 'file' }[] = [];
  if (trashFolders.length > 0) {
    sections.push({
      title: 'Klasörler',
      data: trashFolders,
      type: 'folder',
    });
  }
  if (trashFiles.length > 0) {
    sections.push({
      title: 'Dosyalar',
      data: trashFiles,
      type: 'file',
    });
  }

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
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Çöp Kutusu</Text>
            {totalItems > 0 && (
              <Text style={styles.headerSubtitle}>{totalItems} öğe</Text>
            )}
          </View>
          {totalItems > 0 ? (
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={handleEmptyTrash}
            >
              <Text style={styles.emptyButtonText}>Boşalt</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {/* Warning */}
        {totalItems > 0 && (
          <View style={styles.warningCard}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={styles.warningText}>
              Dosyalar {autoDeleteDays} gün sonra otomatik olarak kalıcı silinir
            </Text>
          </View>
        )}

        {/* Trash List */}
        {totalItems > 0 ? (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item, section }) => 
              section.type === 'folder' 
                ? renderFolderItem(item as FolderItem)
                : renderFileItem(item as FileItem)
            }
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Ionicons 
                  name={title === 'Klasörler' ? 'folder-outline' : 'document-outline'} 
                  size={16} 
                  color={colors.textMuted} 
                />
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadTrash();
            }}
            stickySectionHeadersEnabled={false}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="trash-outline" size={64} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Çöp Kutusu Boş</Text>
            <Text style={styles.emptyText}>Silinen dosya ve klasörleriniz burada görünecek</Text>
          </View>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.error}20`,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.error,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.warning}15`,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.warning,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  trashCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  trashItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  trashMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  daysTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.warning}20`,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  daysTagDanger: {
    backgroundColor: `${colors.error}20`,
  },
  daysText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.warning,
  },
  daysTextDanger: {
    color: colors.error,
  },
  trashActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trashActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  restoreBtn: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  deleteBtn: {},
  trashActionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default TrashScreen;
