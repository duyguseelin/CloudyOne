import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { api, API_BASE } from '../services/api';
import { FileItem } from '../types';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { getMasterKey, hasMasterKey } from '../crypto';
import { downloadAndDecryptFileV3 } from '../crypto/encrypt';
import { getToken } from '../utils/storage';

type RouteParams = {
  FileDetails: {
    file: FileItem;
    folderName?: string;
  };
};

const FileDetailsScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'FileDetails'>>();
  const { file, folderName: initialFolderName } = route.params;
  
  const [downloading, setDownloading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(file.isFavorite || false);
  const [actualFolderName, setActualFolderName] = useState(initialFolderName || 'Ana Klasör');

  // Klasör adını API'dan çek
  useEffect(() => {
    const fetchFolderName = async () => {
      if (file.folderId) {
        try {
          // Tüm klasörleri al ve dosyanın klasörünü bul
          const response = await api.getFiles(null);
          const allFolders = response.folders || [];
          
          // Recursive olarak tüm alt klasörleri topla
          const findFolder = async (folderId: string): Promise<string | null> => {
            // Önce root klasörlerde ara
            const folder = allFolders.find(f => f.id === folderId);
            if (folder) return folder.name;
            
            // Alt klasörlerde ara
            for (const parentFolder of allFolders) {
              try {
                const subResponse = await api.getFiles(parentFolder.id);
                const subFolder = (subResponse.folders || []).find(f => f.id === folderId);
                if (subFolder) return subFolder.name;
              } catch (e) {
                // Alt klasör erişilemedi, devam et
              }
            }
            return null;
          };
          
          const name = await findFolder(file.folderId);
          if (name) {
            setActualFolderName(name);
          }
        } catch (error) {
          console.error('Klasör adı alınamadı:', error);
        }
      }
    };
    
    fetchFolderName();
  }, [file.folderId]);

  // Dosya boyutunu formatla
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Tarihi formatla
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Dosya türüne göre ikon
  const getFileIcon = (mimeType: string): string => {
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('video/')) return 'videocam';
    if (mimeType?.startsWith('audio/')) return 'musical-notes';
    if (mimeType?.includes('pdf')) return 'document-text';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return 'document';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return 'grid';
    if (mimeType?.includes('powerpoint') || mimeType?.includes('presentation')) return 'easel';
    if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('archive')) return 'archive';
    if (mimeType?.includes('text')) return 'document-text';
    return 'document';
  };

  // Dosya türüne göre renk
  const getFileIconColor = (mimeType: string): string => {
    if (mimeType?.startsWith('image/')) return '#10B981';
    if (mimeType?.startsWith('video/')) return '#F59E0B';
    if (mimeType?.startsWith('audio/')) return '#EC4899';
    if (mimeType?.includes('pdf')) return '#EF4444';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return '#3B82F6';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return '#22C55E';
    if (mimeType?.includes('powerpoint') || mimeType?.includes('presentation')) return '#F97316';
    if (mimeType?.includes('zip') || mimeType?.includes('rar')) return '#8B5CF6';
    return '#6B7280';
  };

  // Dosya türü adı
  const getFileTypeName = (mimeType: string): string => {
    if (mimeType?.startsWith('image/')) return 'Görsel';
    if (mimeType?.startsWith('video/')) return 'Video';
    if (mimeType?.startsWith('audio/')) return 'Ses';
    if (mimeType?.includes('pdf')) return 'PDF Belgesi';
    if (mimeType?.includes('word') || mimeType?.includes('document')) return 'Word Belgesi';
    if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return 'Excel Tablosu';
    if (mimeType?.includes('powerpoint') || mimeType?.includes('presentation')) return 'PowerPoint Sunumu';
    if (mimeType?.includes('zip')) return 'ZIP Arşivi';
    if (mimeType?.includes('rar')) return 'RAR Arşivi';
    if (mimeType?.includes('text')) return 'Metin Dosyası';
    return 'Dosya';
  };

  // Dosyayı görüntüle
  const handleView = () => {
    (navigation as any).navigate('FileViewer', { file });
  };

  // Dosyayı indir
  const handleDownload = async () => {
    try {
      setDownloading(true);
      
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Dosyayı indirmek için medya izni gerekli.');
        return;
      }

      const token = await getToken();
      if (!token) {
        Alert.alert('Hata', 'Oturum bulunamadı');
        return;
      }

      let fileUri: string;

      if (file.isEncrypted && hasMasterKey()) {
        // Şifreli dosyayı çöz - fonksiyon kendi içinde token ve API'yi alıyor
        const decryptedUri = await downloadAndDecryptFileV3(
          file.id,
          file.filename
        );
        fileUri = decryptedUri;
      } else {
        // Normal indirme
        const downloadUrl = `${API_BASE}/files/${file.id}/download`;
        const cacheDir = FileSystem.cacheDirectory;
        const tempUri = `${cacheDir}${file.filename}`;
        
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, tempUri, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (downloadResult.status !== 200) {
          throw new Error('İndirme başarısız');
        }
        fileUri = downloadResult.uri;
      }

      // Galeriye kaydet veya paylaş
      if (file.mimeType?.startsWith('image/') || file.mimeType?.startsWith('video/')) {
        await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert('Başarılı', 'Dosya galeriye kaydedildi');
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Başarılı', 'Dosya indirildi');
        }
      }
    } catch (error: any) {
      console.error('İndirme hatası:', error);
      Alert.alert('Hata', error.message || 'Dosya indirilemedi');
    } finally {
      setDownloading(false);
    }
  };

  // Favorilere ekle/çıkar
  const handleToggleFavorite = async () => {
    try {
      await api.toggleFavorite(file.id, isFavorite);
      setIsFavorite(!isFavorite);
      Alert.alert('', isFavorite ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İşlem başarısız');
    }
  };

  // Paylaş
  const handleShare = () => {
    // FilesScreen'deki paylaşım modal'ını açmak için geri dön
    navigation.goBack();
    // Alternatif olarak burada da paylaşım modal'ı açılabilir
  };

  const iconColor = getFileIconColor(file.mimeType || '');

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
          <Text style={styles.headerTitle}>Dosya Detayları</Text>
          <TouchableOpacity 
            style={styles.favoriteButton}
            onPress={handleToggleFavorite}
          >
            <Ionicons 
              name={isFavorite ? "star" : "star-outline"} 
              size={24} 
              color={isFavorite ? "#F59E0B" : colors.textMuted} 
            />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Dosya İkonu ve Adı */}
          <View style={styles.fileHeader}>
            <View style={[styles.fileIconLarge, { backgroundColor: `${iconColor}20` }]}>
              <Ionicons name={getFileIcon(file.mimeType || '') as any} size={48} color={iconColor} />
              {file.isEncrypted && (
                <View style={styles.encryptedBadge}>
                  <Ionicons name="lock-closed" size={14} color="#10B981" />
                </View>
              )}
            </View>
            <Text style={styles.fileName} numberOfLines={2}>{file.filename}</Text>
            <Text style={styles.fileType}>{getFileTypeName(file.mimeType || '')}</Text>
          </View>

          {/* Detay Kartları */}
          <View style={styles.detailsContainer}>
            {/* Boyut */}
            <View style={styles.detailCard}>
              <View style={styles.detailIcon}>
                <Ionicons name="server-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Boyut</Text>
                <Text style={styles.detailValue}>{formatFileSize(file.sizeBytes)}</Text>
              </View>
            </View>

            {/* Konum */}
            <View style={styles.detailCard}>
              <View style={styles.detailIcon}>
                <Ionicons name="folder-outline" size={20} color={colors.secondary} />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Konum</Text>
                <Text style={styles.detailValue}>{actualFolderName}</Text>
              </View>
            </View>

            {/* Gönderen Bilgisi (Dosya İsteği veya Transfer) */}
            {(file.receivedFromEmail || file.receivedFromName) && (
              <View style={styles.detailCard}>
                <View style={[styles.detailIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="person-outline" size={20} color="#3B82F6" />
                </View>
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Gönderen</Text>
                  <Text style={styles.detailValue}>
                    {file.receivedFromName || file.receivedFromEmail}
                  </Text>
                  {file.receivedFromName && file.receivedFromEmail && (
                    <Text style={[styles.detailLabel, { marginTop: 2 }]}>
                      {file.receivedFromEmail}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Alınma Tarihi */}
            {file.receivedAt && (
              <View style={styles.detailCard}>
                <View style={[styles.detailIcon, { backgroundColor: '#8B5CF620' }]}>
                  <Ionicons name="arrow-down-circle-outline" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Alınma Tarihi</Text>
                  <Text style={styles.detailValue}>{formatDate(file.receivedAt)}</Text>
                </View>
              </View>
            )}

            {/* Oluşturulma Tarihi */}
            <View style={styles.detailCard}>
              <View style={styles.detailIcon}>
                <Ionicons name="calendar-outline" size={20} color="#10B981" />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Oluşturulma</Text>
                <Text style={styles.detailValue}>{formatDate(file.createdAt)}</Text>
              </View>
            </View>

            {/* Güncellenme Tarihi */}
            {file.updatedAt && file.updatedAt !== file.createdAt && (
              <View style={styles.detailCard}>
                <View style={styles.detailIcon}>
                  <Ionicons name="time-outline" size={20} color="#F59E0B" />
                </View>
                <View style={styles.detailInfo}>
                  <Text style={styles.detailLabel}>Son Güncelleme</Text>
                  <Text style={styles.detailValue}>{formatDate(file.updatedAt)}</Text>
                </View>
              </View>
            )}

            {/* MIME Türü */}
            <View style={styles.detailCard}>
              <View style={styles.detailIcon}>
                <Ionicons name="code-outline" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Dosya Türü</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{file.mimeType || 'Bilinmiyor'}</Text>
              </View>
            </View>

            {/* Şifreleme Durumu */}
            <View style={styles.detailCard}>
              <View style={styles.detailIcon}>
                <Ionicons 
                  name={file.isEncrypted ? "shield-checkmark" : "shield-outline"} 
                  size={20} 
                  color={file.isEncrypted ? "#10B981" : colors.textMuted} 
                />
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Şifreleme</Text>
                <Text style={[styles.detailValue, { color: file.isEncrypted ? "#10B981" : colors.textMuted }]}>
                  {file.isEncrypted ? 'Uçtan Uca Şifreli' : 'Şifrelenmemiş'}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Alt Butonlar */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleView}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.actionButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="eye" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Görüntüle</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.actionButtonSecondary]} 
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color={colors.primary} />
                <Text style={styles.actionButtonTextSecondary}>İndir</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  fileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  fileIconLarge: {
    width: 100,
    height: 100,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  encryptedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.bgDark,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: colors.bgDark,
  },
  fileName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  fileType: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  detailsContainer: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  detailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  detailInfo: {
    flex: 1,
  },
  detailLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  bottomActions: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgDark,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: colors.bgCard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  actionButtonTextSecondary: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

export default FileDetailsScreen;
