import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { api, API_BASE } from '../services/api';
import { FileItem, FolderItem } from '../types';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { getMasterKey, hasMasterKey } from '../crypto';

const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<'file' | 'folder'>('file');
  const [downloading, setDownloading] = useState(false);

  // Master key durumunu izle
  const [hasEncryptionKey, setHasEncryptionKey] = useState(hasMasterKey());
  const prevHasKeyRef = useRef(hasEncryptionKey);

  // Master key kontrol interval
  useEffect(() => {
    const interval = setInterval(() => {
      const hasKey = hasMasterKey();
      setHasEncryptionKey(hasKey);
    }, hasEncryptionKey ? 5000 : 500);
    return () => clearInterval(interval);
  }, [hasEncryptionKey]);

  // Dosyaları yükle - master key yoksa bekle
  useFocusEffect(
    useCallback(() => {
      if (hasEncryptionKey) {
        loadFavorites();
      } else {
        console.log('⏳ [Favorites] Master key bekleniyor...');
        setLoading(true);
      }
    }, [hasEncryptionKey])
  );

  // Master key hazır olduğunda dosyaları yükle
  useEffect(() => {
    if (hasEncryptionKey && !prevHasKeyRef.current) {
      console.log('🔑 [Favorites] Master key hazır - dosyalar yükleniyor');
      loadFavorites();
    }
    prevHasKeyRef.current = hasEncryptionKey;
  }, [hasEncryptionKey]);

  const loadFavorites = async () => {
    try {
      const response = await api.getFavorites();
      const rawFiles = (response as any)?.files || response || [];
      const rawFolders = (response as any)?.folders || [];
      
      // Şifrelenmiş dosya adlarını çöz
      const decryptedFiles = await Promise.all(
        rawFiles.map(async (file: FileItem) => {
          // Eğer dosya V3 ile şifrelenmiş ve metaNameEnc varsa, dosya adını çöz
          if (file.isEncrypted && (file as any).metaNameEnc && (file as any).metaNameIv) {
            // Master key yoksa - useFocusEffect zaten bekletecek
            if (!hasMasterKey()) {
              console.log('⏳ [Favorites] Master key henüz hazır değil:', file.id);
              return { ...file, filename: file.filename || 'Yükleniyor...' };
            }
            try {
              const masterKey = getMasterKey();
              const { decryptFilename } = await import('../crypto/encrypt');
              const { base64ToBytes } = await import('../crypto/kdf');
              
              const metaNameIv = base64ToBytes((file as any).metaNameIv);
              const decryptedName = await decryptFilename(masterKey, metaNameIv, (file as any).metaNameEnc);
              
              return { ...file, filename: decryptedName, originalName: decryptedName };
            } catch (error) {
              console.warn('Dosya adı çözülemedi:', file.id, error);
              return { ...file, filename: file.filename || 'Şifreli Dosya' };
            }
          }
          return file;
        })
      );
      
      setFiles(decryptedFiles);
      setFolders(rawFolders);
    } catch (error) {
      console.error('Favoriler yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const openMenu = (file: FileItem) => {
    setSelectedFile(file);
    setSelectedFolder(null);
    setSelectedItemType('file');
    setMenuVisible(true);
  };
  
  const openFolderMenu = (folder: FolderItem) => {
    setSelectedFolder(folder);
    setSelectedFile(null);
    setSelectedItemType('folder');
    setMenuVisible(true);
  };
  
  const navigateToFolder = (folder: FolderItem) => {
    (navigation as any).navigate('Files', {
      screen: 'Files',
      params: {
        folderId: folder.id,
        folderName: folder.name
      }
    });
  };

  const closeMenu = () => {
    setMenuVisible(false);
    setSelectedFile(null);
    setSelectedFolder(null);
  };

  const handleView = () => {
    if (!selectedFile) return;
    closeMenu();
    (navigation as any).navigate('FileViewer', { file: selectedFile });
  };

  const handleDownload = async () => {
    if (!selectedFile) return;
    closeMenu();
    
    try {
      setDownloading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Dosyayı indirmek için medya izni gerekli.');
        return;
      }

      const downloadUrl = `${API_BASE}/files/${selectedFile.id}/download`;
      const fileUri = FileSystem.documentDirectory + selectedFile.filename;
      
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri, {
        headers: {
          'Authorization': `Bearer ${await api.getToken()}`,
        },
      });

      if (downloadResult.status === 200) {
        await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
        Alert.alert('Başarılı', 'Dosya indirildi ve galeriye kaydedildi.');
      } else {
        Alert.alert('Hata', 'Dosya indirilemedi.');
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya indirilemedi.');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!selectedFile) return;
    closeMenu();
    
    try {
      const shareUrl = `${API_BASE}/files/${selectedFile.id}/download`;
      await Share.share({
        message: `${selectedFile.filename}\n${shareUrl}`,
        title: selectedFile.filename,
      });
    } catch (error) {
      console.error('Paylaşım hatası:', error);
    }
  };

  const handleRemoveFavorite = async () => {
    if (!selectedFile && !selectedFolder) return;
    const itemName = selectedFile ? selectedFile.filename : selectedFolder!.name;
    const isFile = selectedItemType === 'file';
    closeMenu();
    
    Alert.alert(
      'Favoriden Çıkar',
      `"${itemName}" favorilerden çıkarılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkar',
          onPress: async () => {
            try {
              if (isFile && selectedFile) {
                await api.toggleFavorite(selectedFile.id, true);
              } else if (selectedFolder) {
                await api.toggleFolderFavorite(selectedFolder.id);
              }
              loadFavorites();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!selectedFile && !selectedFolder) return;
    const itemName = selectedFile ? selectedFile.filename : selectedFolder!.name;
    const isFile = selectedItemType === 'file';
    closeMenu();
    
    Alert.alert(
      isFile ? 'Dosyayı Sil' : 'Klasörü Sil',
      `"${itemName}" silinsin mi? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isFile && selectedFile) {
                await api.deleteFile(selectedFile.id);
              } else if (selectedFolder) {
                await api.deleteFolder(selectedFolder.id);
              }
              loadFavorites();
              Alert.alert('Başarılı', isFile ? 'Dosya silindi.' : 'Klasör silindi.');
            } catch (error: any) {
              Alert.alert('Hata', error.message || (isFile ? 'Dosya silinemedi.' : 'Klasör silinemedi.'));
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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };
  
  const getFolderColor = (folderId: string, index: number) => {
    const colors = [
      { start: '#667eea', end: '#764ba2' },
      { start: '#f093fb', end: '#f5576c' },
      { start: '#4facfe', end: '#00f2fe' },
      { start: '#43e97b', end: '#38f9d7' },
      { start: '#fa709a', end: '#fee140' },
      { start: '#a8edea', end: '#fed6e3' },
      { start: '#ffecd2', end: '#fcb69f' },
      { start: '#ff8a80', end: '#ffb74d' },
    ];
    return colors[index % colors.length];
  };

  const renderFolder = ({ item, index }: { item: FolderItem; index: number }) => {
    const folderColor = getFolderColor(item.id, index);
    
    return (
      <TouchableOpacity
        style={styles.fileCard}
        onPress={() => navigateToFolder(item)}
        onLongPress={() => openFolderMenu(item)}
        activeOpacity={0.7}
      >
        <View style={styles.fileContent}>
          <LinearGradient
            colors={[folderColor.start, folderColor.end]}
            style={styles.folderIconContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="folder" size={24} color="#fff" />
          </LinearGradient>
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.fileSize}>
              {item.fileCount || 0} öğe • {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => openFolderMenu(item)}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderFile = ({ item }: { item: FileItem }) => (
    <TouchableOpacity 
      style={styles.fileCard}
      onPress={() => {
        setSelectedFile(item);
        handleView();
      }}
      onLongPress={() => openMenu(item)}
      activeOpacity={0.7}
    >
      <View style={styles.fileContent}>
        <View style={[styles.fileIcon, { backgroundColor: `${colors.warning}20` }]}>
          <Ionicons name={getFileIcon(item.mimeType || undefined)} size={24} color={colors.warning} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
          <Text style={styles.fileSize}>{formatFileSize(item.sizeBytes)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => openMenu(item)}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

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
          <Text style={styles.headerTitle}>Favoriler</Text>
          <View style={styles.starBadge}>
            <Ionicons name="star" size={18} color={colors.warning} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={[...folders, ...files]}
            keyExtractor={(item) => `${(item as any).name ? 'folder' : 'file'}-${item.id}`}
            renderItem={({ item, index }) => {
              if ((item as any).name) {
                // Bu bir klasör
                return renderFolder({ item: item as FolderItem, index });
              } else {
                // Bu bir dosya
                return renderFile({ item: item as FileItem });
              }
            }}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="star-outline" size={48} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyText}>Favori öğe yok</Text>
                <Text style={styles.emptySubtext}>
                  Dosya ve klasörlerinizi favorilere ekleyin
                </Text>
              </View>
            }
          />
        )}

        {/* Options Menu Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={closeMenu}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={closeMenu}
          >
            <View style={styles.menuContainer}>
              <View style={styles.menuHeader}>
                {selectedItemType === 'file' ? (
                  <View style={[styles.menuFileIcon, { backgroundColor: `${colors.warning}20` }]}>
                    <Ionicons 
                      name={getFileIcon(selectedFile?.mimeType || undefined)} 
                      size={20} 
                      color={colors.warning} 
                    />
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#667eea', '#764ba2']}
                    style={styles.menuFileIcon}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="folder" size={20} color="#fff" />
                  </LinearGradient>
                )}
                <Text style={styles.menuFileName} numberOfLines={1}>
                  {selectedItemType === 'file' ? selectedFile?.filename : selectedFolder?.name}
                </Text>
              </View>
              
              <View style={styles.menuDivider} />
              
              {selectedItemType === 'file' ? (
                <>
                  <TouchableOpacity style={styles.menuItem} onPress={handleView}>
                    <Ionicons name="eye-outline" size={22} color={colors.textPrimary} />
                    <Text style={styles.menuItemText}>Görüntüle</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.menuItem} onPress={handleDownload}>
                    <Ionicons name="download-outline" size={22} color={colors.textPrimary} />
                    <Text style={styles.menuItemText}>İndir</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
                    <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
                    <Text style={styles.menuItemText}>Paylaş</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.menuItem} onPress={() => {
                  closeMenu();
                  if (selectedFolder) {
                    navigateToFolder(selectedFolder);
                  }
                }}>
                  <Ionicons name="folder-open-outline" size={22} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>Aç</Text>
                </TouchableOpacity>
              )}
              
              <View style={styles.menuDivider} />
              
              <TouchableOpacity style={styles.menuItem} onPress={handleRemoveFavorite}>
                <Ionicons name="star-outline" size={22} color={colors.warning} />
                <Text style={[styles.menuItemText, { color: colors.warning }]}>Favoriden Çıkar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color={colors.error} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Sil</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Downloading Overlay */}
        {downloading && (
          <View style={styles.downloadingOverlay}>
            <View style={styles.downloadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.downloadingText}>İndiriliyor...</Text>
            </View>
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
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  starBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.warning}20`,
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
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },  folderIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },  fileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  fileName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  fileSize: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  menuButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  removeButton: {
    padding: spacing.sm,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxl,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  menuFileIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },  folderIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },  menuFileName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  menuItemText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  downloadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadingBox: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  downloadingText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
});

export default FavoritesScreen;
