import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  Linking,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { FileItem, FolderItem } from '../types';
import { colors, gradients } from '../constants/theme';
import { getMasterKey } from '../crypto';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3;

// Image/Video extensions
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'tiff', 'avif'];
const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', 'm4v'];

const isImage = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
};

const isVideo = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTENSIONS.includes(ext);
};

const isMedia = (filename: string) => isImage(filename) || isVideo(filename);

type FilterType = 'all' | 'images' | 'videos' | 'favorites';

// Comment type
interface CommentItem {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

// Version type
interface VersionItem {
  id: number;
  version: number;
  sizeBytes: number;
  createdAt: string;
}

const GalleryScreen: React.FC = () => {
  const navigation = useNavigation();
  const [mediaFiles, setMediaFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  
  // Thumbnail URLs cache
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  
  // Lightbox
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<FileItem | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  // Action Menu
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<FileItem | null>(null);

  // Rename Modal
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Move Modal
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [moving, setMoving] = useState(false);

  // Comments Modal
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Versions Modal
  const [versionsModalVisible, setVersionsModalVisible] = useState(false);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Edit Modal (görsel düzenleme)
  const [editModalVisible, setEditModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMedia();
      loadFolders();
    }, [])
  );

  // Thumbnail URL'lerini arka planda yükle
  const loadThumbnails = async (media: FileItem[]) => {
    const urls: Record<string, string> = {};
    // Paralel olarak yükle (Promise.allSettled ile hata olsa bile devam et)
    const results = await Promise.allSettled(
      media.map(async (file) => {
        // Şifrelenmiş dosyalar için decrypt et
        if (file.isEncrypted) {
          try {
            const { downloadAndDecryptFileV3 } = await import('../crypto/encrypt');
            const localUri = await downloadAndDecryptFileV3(file.id, file.filename);
            return { id: file.id, url: localUri };
          } catch (error) {
            console.error('[GalleryScreen] Thumbnail decrypt hatası:', error);
            return { id: file.id, url: null };
          }
        } else {
          // Şifresiz dosyalar için normal URL
          const url = await api.getViewUrl(file.id);
          return { id: file.id, url };
        }
      })
    );
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.url) {
        urls[result.value.id] = result.value.url;
      }
    });
    setThumbnailUrls(urls);
  };

  const loadMedia = async () => {
    try {
      setLoading(true);
      const data = await api.getMediaFiles();
      if (data?.files) {
        // Şifrelenmiş dosya adlarını çöz ve extension'ı tespit et
        const decryptedFiles = await Promise.all(
          data.files.map(async (file: FileItem) => {
            // Eğer dosya V3 ile şifrelenmiş ve metaNameEnc varsa, dosya adını çöz
            if (file.isEncrypted && (file as any).metaNameEnc && (file as any).metaNameIv) {
              try {
                const masterKey = getMasterKey();
                const { decryptFilename } = await import('../crypto/encrypt');
                const { base64ToBytes } = await import('../crypto/kdf');
                
                const metaNameIv = base64ToBytes((file as any).metaNameIv);
                const decryptedName = await decryptFilename(masterKey, metaNameIv, (file as any).metaNameEnc);
                
                // Extension'ı çözülmüş dosya adından çıkar
                const ext = decryptedName.split('.').pop()?.toLowerCase() || '';
                
                return { 
                  ...file, 
                  filename: decryptedName, 
                  originalName: decryptedName,
                  extension: ext || file.extension 
                };
              } catch (error) {
                console.warn('Dosya adı çözülemedi:', file.id, error);
                return file;
              }
            }
            return file;
          })
        );
        
        // Dosya adı veya extension'dan medya olup olmadığını kontrol et
        const media = decryptedFiles.filter((f: FileItem) => {
          // Extension field'ını kullan (şifrelenmiş dosyalarda artık var)
          if (f.extension) {
            return IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()) || 
                   VIDEO_EXTENSIONS.includes(f.extension.toLowerCase());
          }
          // Fallback: Şifresiz dosyalar için dosya adından kontrol et
          return isMedia(f.originalName || f.filename || '');
        });
        console.log('[GalleryScreen] Medya dosyaları yüklendi:', media.length, 'dosya');
        setMediaFiles(media);
        setLoading(false);
        
        // Thumbnail'leri arka planda yükle (ekranı bloklamaz)
        loadThumbnails(media);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Medya yüklenemedi:', error);
      Alert.alert('Hata', 'Medya dosyaları yüklenirken hata oluştu');
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const data = await api.getAllFolders();
      setFolders(data || []);
    } catch (error) {
      console.error('Klasörler yüklenemedi:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMedia();
    setRefreshing(false);
  };

  const filteredMedia = mediaFiles.filter((f) => {
    // extension field'ını kullan (şifrelenmiş dosyalar için)
    const ext = f.extension?.toLowerCase() || '';
    const filename = f.originalName || f.filename || '';
    
    if (filterType === 'images') {
      return ext ? IMAGE_EXTENSIONS.includes(ext) : isImage(filename);
    }
    if (filterType === 'videos') {
      return ext ? VIDEO_EXTENSIONS.includes(ext) : isVideo(filename);
    }
    if (filterType === 'favorites') return f.isFavorite === true;
    return true;
  });

  const openLightbox = async (item: FileItem) => {
    try {
      console.log('[GalleryScreen] Opening lightbox for:', item.id, item.filename, 'encrypted:', item.isEncrypted);
      setSelectedMedia(item);
      setLightboxVisible(true);
      setMediaUrl(null); // Reset URL
      
      let url: string;
      
      // Şifrelenmiş dosyalar için decrypt et
      if (item.isEncrypted) {
        console.log('[GalleryScreen] Şifreli dosya decrypt ediliyor...');
        const { downloadAndDecryptFileV3 } = await import('../crypto/encrypt');
        url = await downloadAndDecryptFileV3(item.id, item.filename);
        console.log('[GalleryScreen] Decrypt tamamlandı, local URI:', url?.substring(0, 100));
      } else {
        // Şifresiz dosyalar için normal URL
        url = await api.getViewUrl(item.id);
        console.log('[GalleryScreen] Got media URL:', url?.substring(0, 100));
      }
      
      if (url) {
        setMediaUrl(url);
      } else {
        throw new Error('URL boş döndü');
      }
    } catch (error: any) {
      console.error('[GalleryScreen] Medya URL alınamadı:', error);
      // Hata olursa lightbox'ı kapat
      setLightboxVisible(false);
      setSelectedMedia(null);
      setMediaUrl(null);
      Alert.alert('Hata', error.message || 'Medya açılamadı');
    }
  };

  const closeLightbox = () => {
    setLightboxVisible(false);
    setSelectedMedia(null);
    setMediaUrl(null);
  };

  const toggleFavorite = async (item: FileItem) => {
    try {
      closeActionMenu();
      await api.toggleFavorite(item.id);
      const newFavoriteState = !item.isFavorite;
      setMediaFiles(prev =>
        prev.map(f => f.id === item.id ? { ...f, isFavorite: newFavoriteState } : f)
      );
      if (selectedMedia?.id === item.id) {
        setSelectedMedia(prev => prev ? { ...prev, isFavorite: newFavoriteState } : null);
      }
      Alert.alert('Başarılı', newFavoriteState ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
    } catch (error: any) {
      console.error('Favori güncellenemedi:', error);
      Alert.alert('Hata', error.message || 'Favori güncellenemedi');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Action Menu Functions
  const openActionMenu = (item: FileItem) => {
    setActionTarget(item);
    setActionMenuVisible(true);
  };

  const closeActionMenu = () => {
    setActionMenuVisible(false);
    setActionTarget(null);
  };

  // Download
  const handleDownload = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionMenuVisible(false);
    try {
      const url = await api.getDownloadUrl(target.id);
      // Dosyayı tarayıcıda aç (indirme için)
      await Linking.openURL(url);
      Alert.alert('Başarılı', 'Dosya indirme başlatıldı');
    } catch (error: any) {
      console.error('İndirme hatası:', error);
      Alert.alert('Hata', error.message || 'Dosya indirilemedi');
    }
    setActionTarget(null);
  };

  // Rename
  const openRenameModal = () => {
    if (!actionTarget) return;
    const filename = actionTarget.originalName || actionTarget.filename || '';
    const nameWithoutExt = filename.includes('.') 
      ? filename.substring(0, filename.lastIndexOf('.'))
      : filename;
    setRenameValue(nameWithoutExt);
    setActionMenuVisible(false); // Menu'yu kapat ama actionTarget'ı koru
    setRenameModalVisible(true);
  };

  const handleRename = async () => {
    if (!actionTarget || !renameValue.trim()) return;
    const target = actionTarget;
    try {
      setRenaming(true);
      const filename = target.originalName || target.filename || '';
      const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
      const newName = renameValue.trim() + ext;
      await api.renameFile(target.id, newName);
      setMediaFiles(prev =>
        prev.map(f => f.id === target.id ? { ...f, filename: newName, originalName: newName } : f)
      );
      setRenameModalVisible(false);
      setActionTarget(null);
      Alert.alert('Başarılı', 'Dosya yeniden adlandırıldı');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Yeniden adlandırılamadı');
    } finally {
      setRenaming(false);
    }
  };

  // Move
  const openMoveModal = () => {
    setActionMenuVisible(false); // Menu'yu kapat ama actionTarget'ı koru
    setMoveModalVisible(true);
  };

  const handleMove = async (targetFolderId: string | null) => {
    if (!actionTarget) return;
    const target = actionTarget;
    try {
      setMoving(true);
      await api.moveFile(target.id, targetFolderId);
      // Dosya taşındı ama galeriden kaldırma - sadece folderId güncelle
      // Fotoğraflar sayfası tüm medya dosyalarını göstermeli
      setMediaFiles(prev => prev.map(f => 
        f.id === target.id ? { ...f, folderId: targetFolderId } : f
      ));
      setMoveModalVisible(false);
      setActionTarget(null);
      Alert.alert('Başarılı', 'Dosya taşındı');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya taşınamadı');
    } finally {
      setMoving(false);
    }
  };

  // Share Link
  const handleShareLink = async () => {
    if (!actionTarget) return;
    const target = actionTarget; // actionTarget'ı koru
    setActionMenuVisible(false);
    try {
      const result = await api.createShareLink(target.id, { expiresIn: '7d', permission: 'VIEW' });
      
      let finalShareUrl = result.shareUrl;
      
      // Dosya şifreliyse DEK'i URL fragment'ına ekle
      if (result.encryptionInfo?.isEncrypted) {
        const { gcm } = require('@noble/ciphers/aes');
        const { base64ToBytes, bytesToBase64 } = require('../crypto');
        
        const masterKey = await getMasterKey();
        if (masterKey) {
          const encInfo = result.encryptionInfo;
          const edekBytes = base64ToBytes(encInfo.edek);
          const edekIvBytes = base64ToBytes(encInfo.edekIv);
          
          const cipher = gcm(masterKey, edekIvBytes);
          const plainDek = cipher.decrypt(edekBytes);
          
          // DEK ve diğer şifreleme bilgilerini fragment olarak ekle
          const dekFragment = [
            bytesToBase64(plainDek),
            encInfo.cipherIv,
            encInfo.metaNameEnc || '',
            encInfo.metaNameIv || ''
          ].join('.');
          
          finalShareUrl = `${result.shareUrl}#dek=${encodeURIComponent(dekFragment)}`;
        }
      }
      
      if (finalShareUrl) {
        await Clipboard.setStringAsync(finalShareUrl);
        Alert.alert('Başarılı', 'Paylaşım linki kopyalandı!');
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Link oluşturulamadı');
    }
    setActionTarget(null);
  };

  // Delete
  const handleDelete = () => {
    if (!actionTarget) return;
    const target = actionTarget; // actionTarget'ı koru
    setActionMenuVisible(false);
    Alert.alert(
      'Silme Onayı',
      `"${target.originalName || target.filename}" dosyasını çöp kutusuna taşımak istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel', onPress: () => setActionTarget(null) },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFile(target.id);
              setMediaFiles(prev => prev.filter(f => f.id !== target.id));
              Alert.alert('Başarılı', 'Dosya çöp kutusuna taşındı');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Dosya silinemedi');
            }
            setActionTarget(null);
          },
        },
      ]
    );
  };

  // Comments
  const parseComments = (comment: string | null | undefined): CommentItem[] => {
    if (!comment) return [];
    try {
      const parsed = JSON.parse(comment);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      if (comment.trim()) {
        return [{ id: 'legacy', text: comment, createdAt: new Date().toISOString() }];
      }
      return [];
    }
  };

  const openCommentsModal = () => {
    if (!actionTarget) return;
    setActionMenuVisible(false); // Menu'yu kapat ama actionTarget'ı koru
    const parsed = parseComments((actionTarget as any).comment);
    setComments(parsed);
    setNewComment('');
    setCommentsModalVisible(true);
  };

  const handleAddComment = async () => {
    if (!actionTarget || !newComment.trim()) return;
    try {
      setSavingComment(true);
      const newCommentItem: CommentItem = {
        id: Date.now().toString(),
        text: newComment.trim(),
        createdAt: new Date().toISOString(),
      };
      const updatedComments = [...comments, newCommentItem];
      const commentJson = JSON.stringify(updatedComments);
      await api.updateFileComment(actionTarget.id, commentJson);
      setComments(updatedComments);
      setNewComment('');
      setMediaFiles(prev =>
        prev.map(f => f.id === actionTarget.id ? { ...f, comment: commentJson } as any : f)
      );
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Yorum eklenemedi');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!actionTarget) return;
    try {
      const updatedComments = comments.filter(c => c.id !== commentId);
      const commentJson = updatedComments.length > 0 ? JSON.stringify(updatedComments) : null;
      await api.updateFileComment(actionTarget.id, commentJson);
      setComments(updatedComments);
      setMediaFiles(prev =>
        prev.map(f => f.id === actionTarget.id ? { ...f, comment: commentJson } as any : f)
      );
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Yorum silinemedi');
    }
  };

  // Versions
  const openVersionsModal = async () => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionMenuVisible(false); // Menu'yu kapat ama actionTarget'ı koru
    setVersionsModalVisible(true);
    setLoadingVersions(true);
    try {
      const vers = await api.getFileVersions(target.id);
      setVersions(vers);
    } catch (error) {
      console.error('Sürümler yüklenemedi:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!actionTarget) return;
    Alert.alert(
      'Sürümü Geri Yükle',
      'Bu sürümü geri yüklemek istediğinize emin misiniz? Mevcut dosya yeni bir sürüm olarak kaydedilecek.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Geri Yükle',
          onPress: async () => {
            try {
              await api.restoreFileVersion(actionTarget.id, versionId);
              Alert.alert('Başarılı', 'Sürüm geri yüklendi');
              setVersionsModalVisible(false);
              loadMedia();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Sürüm geri yüklenemedi');
            }
          },
        },
      ]
    );
  };

  // Edit functions
  const openEditModal = () => {
    setActionMenuVisible(false); // Menu'yu kapat ama actionTarget'ı koru
    setEditModalVisible(true);
  };

  const handleEditAction = (action: string) => {
    setEditModalVisible(false);
    setActionTarget(null);
    Alert.alert('Bilgi', `${action} özelliği yakında eklenecek`);
  };

  const renderItem = ({ item }: { item: FileItem }) => {
    const filename = item.originalName || item.filename || '';
    const isVideoFile = isVideo(filename);
    const thumbnailUrl = thumbnailUrls[item.id];

    return (
      <TouchableOpacity
        style={styles.mediaItem}
        onPress={() => openLightbox(item)}
        onLongPress={() => openActionMenu(item)}
        activeOpacity={0.7}
      >
        <View style={styles.mediaThumb}>
          {thumbnailUrl && !isVideoFile ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.thumbnailImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={isVideoFile ? 'videocam' : 'image'}
              size={32}
              color={colors.textMuted}
            />
          )}
          {isVideoFile && (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
          )}
        </View>
        {item.isFavorite && (
          <View style={styles.favoriteBadge}>
            <Ionicons name="star" size={12} color="#fbbf24" />
          </View>
        )}
        {/* More button */}
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => openActionMenu(item)}
        >
          <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const FilterButton = ({ type, label, icon }: { type: FilterType; label: string; icon: string }) => (
    <TouchableOpacity
      style={[styles.filterBtn, filterType === type && styles.filterBtnActive]}
      onPress={() => setFilterType(type)}
    >
      <Ionicons
        name={icon as any}
        size={16}
        color={filterType === type ? '#fff' : colors.textMuted}
      />
      <Text style={[styles.filterText, filterType === type && styles.filterTextActive]}>
        {label}
      </Text>
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fotoğraflar</Text>
          <View style={styles.headerRight}>
            <Text style={styles.countText}>{filteredMedia.length} medya</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          <FilterButton type="all" label="Tümü" icon="grid" />
          <FilterButton type="images" label="Resimler" icon="image" />
          <FilterButton type="videos" label="Videolar" icon="videocam" />
          <FilterButton type="favorites" label="Favoriler" icon="star" />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Medya yükleniyor...</Text>
          </View>
        ) : filteredMedia.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="images-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {filterType === 'all' ? 'Henüz medya dosyası yok' :
               filterType === 'images' ? 'Resim bulunamadı' :
               filterType === 'videos' ? 'Video bulunamadı' :
               'Favori medya yok'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredMedia}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          />
        )}

        {/* Lightbox Modal */}
        <Modal
          visible={lightboxVisible}
          transparent
          animationType="fade"
          onRequestClose={closeLightbox}
        >
          <View style={styles.lightbox}>
            <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {selectedMedia && (
              <View style={styles.lightboxContent}>
                {mediaUrl ? (
                  isVideo(selectedMedia.originalName || selectedMedia.filename || '') ? (
                    <View style={styles.videoPlaceholder}>
                      <Ionicons name="videocam" size={64} color="#fff" />
                      <Text style={styles.videoText}>Video Önizlemesi</Text>
                      <TouchableOpacity 
                        style={styles.playVideoBtn}
                        onPress={() => mediaUrl && Linking.openURL(mediaUrl)}
                      >
                        <Ionicons name="play-circle" size={32} color="#fff" />
                        <Text style={styles.playVideoBtnText}>Videoyu Aç</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: mediaUrl, cache: 'reload' }}
                      style={styles.lightboxImage}
                      resizeMode="contain"
                      onError={(e) => {
                        console.error('[GalleryScreen] Image load error:', e.nativeEvent.error);
                        Alert.alert('Hata', 'Görsel yüklenemedi. Lütfen tekrar deneyin.');
                      }}
                    />
                  )
                ) : (
                  <ActivityIndicator size="large" color="#fff" />
                )}

                <View style={styles.lightboxInfo}>
                  <Text style={styles.lightboxTitle} numberOfLines={1}>
                    {selectedMedia.originalName || selectedMedia.filename}
                  </Text>
                  <Text style={styles.lightboxSize}>
                    {formatBytes(selectedMedia.sizeBytes || 0)}
                  </Text>
                </View>

                <View style={styles.lightboxActions}>
                  <TouchableOpacity
                    style={styles.lightboxBtn}
                    onPress={() => selectedMedia && toggleFavorite(selectedMedia)}
                  >
                    <Ionicons
                      name={selectedMedia?.isFavorite ? 'star' : 'star-outline'}
                      size={24}
                      color={selectedMedia?.isFavorite ? '#fbbf24' : '#fff'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lightboxBtn}
                    onPress={() => {
                      closeLightbox();
                      setActionTarget(selectedMedia);
                      setActionMenuVisible(true);
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Modal>

        {/* Action Menu Modal */}
        <Modal
          visible={actionMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={closeActionMenu}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={closeActionMenu}
          >
            <View style={styles.actionSheet}>
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle} numberOfLines={1}>
                  {actionTarget?.originalName || actionTarget?.filename || 'Dosya'}
                </Text>
                <Text style={styles.actionSheetSubtitle}>
                  {formatBytes(actionTarget?.sizeBytes || 0)}
                </Text>
              </View>

              <TouchableOpacity style={styles.actionItem} onPress={() => { closeActionMenu(); actionTarget && openLightbox(actionTarget); }}>
                <Ionicons name="eye-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Açık</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={handleDownload}>
                <Ionicons name="download-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>İndir</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={openRenameModal}>
                <Ionicons name="pencil-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Yeniden Adlandır</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={openMoveModal}>
                <Ionicons name="folder-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Taşı</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={handleShareLink}>
                <Ionicons name="link-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Link Kopyala</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => actionTarget && toggleFavorite(actionTarget)}>
                <Ionicons 
                  name={actionTarget?.isFavorite ? 'star' : 'star-outline'} 
                  size={22} 
                  color={actionTarget?.isFavorite ? '#fbbf24' : '#fff'} 
                />
                <Text style={styles.actionText}>
                  {actionTarget?.isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={openCommentsModal}>
                <Ionicons name="chatbubble-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Yorumlar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={openVersionsModal}>
                <Ionicons name="time-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Sürüm Geçmişi</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionItem, styles.actionItemDanger]} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color="#ef4444" />
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Sil</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={closeActionMenu}>
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Rename Modal */}
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.dialogBox}>
              <Text style={styles.dialogTitle}>Yeniden Adlandır</Text>
              <TextInput
                style={styles.dialogInput}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Yeni isim"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <View style={styles.dialogButtons}>
                <TouchableOpacity 
                  style={styles.dialogBtnCancel} 
                  onPress={() => { setRenameModalVisible(false); setActionTarget(null); }}
                >
                  <Text style={styles.dialogBtnCancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.dialogBtnConfirm} 
                  onPress={handleRename}
                  disabled={renaming}
                >
                  {renaming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dialogBtnConfirmText}>Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Move Modal */}
        <Modal
          visible={moveModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMoveModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.moveSheet}>
              <Text style={styles.moveTitle}>Klasör Seç</Text>
              <ScrollView style={styles.folderList}>
                <TouchableOpacity 
                  style={styles.folderItem} 
                  onPress={() => handleMove(null)}
                >
                  <Ionicons name="home-outline" size={24} color={colors.primary} />
                  <Text style={styles.folderName}>Ana Dizin</Text>
                </TouchableOpacity>
                {folders.map((folder) => (
                  <TouchableOpacity 
                    key={folder.id} 
                    style={styles.folderItem}
                    onPress={() => handleMove(folder.id)}
                  >
                    <Ionicons name="folder" size={24} color="#fbbf24" />
                    <Text style={styles.folderName}>{folder.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => { setMoveModalVisible(false); setActionTarget(null); }}
              >
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Comments Modal */}
        <Modal
          visible={commentsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCommentsModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.commentsSheet}>
              <View style={styles.commentsHeader}>
                <Text style={styles.commentsTitle}>Yorumlar</Text>
                <TouchableOpacity onPress={() => { setCommentsModalVisible(false); setActionTarget(null); }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.commentsList}>
                {comments.length === 0 ? (
                  <Text style={styles.noComments}>Henüz yorum yok</Text>
                ) : (
                  comments.map((comment) => (
                    <View key={comment.id} style={styles.commentItem}>
                      <Text style={styles.commentText}>{comment.text}</Text>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
                        <TouchableOpacity onPress={() => handleDeleteComment(comment.id)}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Yorum ekle..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <TouchableOpacity 
                  style={styles.sendBtn}
                  onPress={handleAddComment}
                  disabled={savingComment || !newComment.trim()}
                >
                  {savingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Versions Modal */}
        <Modal
          visible={versionsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setVersionsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.versionsSheet}>
              <View style={styles.versionsHeader}>
                <Text style={styles.versionsTitle}>Sürüm Geçmişi</Text>
                <TouchableOpacity onPress={() => { setVersionsModalVisible(false); setActionTarget(null); }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              {loadingVersions ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
              ) : versions.length === 0 ? (
                <Text style={styles.noVersions}>Sürüm geçmişi bulunamadı</Text>
              ) : (
                <ScrollView style={styles.versionsList}>
                  {versions.map((version) => (
                    <View key={version.id} style={styles.versionItem}>
                      <View style={styles.versionInfo}>
                        <Text style={styles.versionNumber}>Sürüm {version.version}</Text>
                        <Text style={styles.versionMeta}>
                          {formatBytes(version.sizeBytes)} • {formatDate(version.createdAt)}
                        </Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.restoreBtn}
                        onPress={() => handleRestoreVersion(version.id)}
                      >
                        <Ionicons name="refresh" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Edit Modal (Görsel Düzenleme) */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editSheet}>
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Görsel Düzenle</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.editOptions}>
                <TouchableOpacity 
                  style={styles.editOption}
                  onPress={() => handleEditAction('Sola döndürme')}
                >
                  <View style={styles.editIconBox}>
                    <Ionicons name="refresh-outline" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
                  </View>
                  <Text style={styles.editOptionText}>Sola Döndür</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.editOption}
                  onPress={() => handleEditAction('Sağa döndürme')}
                >
                  <View style={styles.editIconBox}>
                    <Ionicons name="refresh-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.editOptionText}>Sağa Döndür</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.editOption}
                  onPress={() => handleEditAction('Çevirme')}
                >
                  <View style={styles.editIconBox}>
                    <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.editOptionText}>Çevir</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.editOption}
                  onPress={() => handleEditAction('Kırpma')}
                >
                  <View style={styles.editIconBox}>
                    <Ionicons name="crop-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.editOptionText}>Kırp</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.editOption}
                  onPress={() => handleEditAction('Ayarlama')}
                >
                  <View style={styles.editIconBox}>
                    <Ionicons name="settings-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.editOptionText}>Ayarla</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelText}>İptal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
  },
  emptyText: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 16,
  },
  grid: {
    padding: 16,
    paddingTop: 8,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  mediaThumb: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  playBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingBottom: 100,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxVideo: {
    width: '100%',
    height: '100%',
  },
  lightboxInfo: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
  },
  lightboxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  lightboxSize: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  lightboxActions: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    gap: 20,
  },
  lightboxBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 12,
    marginBottom: 20,
  },
  playVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  playVideoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
  },
  actionSheetHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionSheetSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  actionItemDanger: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
  },
  actionText: {
    fontSize: 16,
    color: '#fff',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  dialogBox: {
    backgroundColor: colors.bgDark,
    marginHorizontal: 32,
    borderRadius: 16,
    padding: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  dialogInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  dialogBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  dialogBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  dialogBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  dialogBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  moveSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 34,
    maxHeight: '70%',
  },
  moveTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  folderList: {
    paddingHorizontal: 16,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
    gap: 12,
  },
  folderName: {
    fontSize: 16,
    color: '#fff',
  },
  commentsSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  commentsList: {
    padding: 16,
    maxHeight: 300,
  },
  noComments: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 40,
  },
  commentItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  commentText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
  },
  commentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  commentDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionsSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '70%',
  },
  versionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  versionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  versionsList: {
    padding: 16,
  },
  noVersions: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 40,
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  versionInfo: {
    flex: 1,
  },
  versionNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  versionMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  restoreBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  editOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    justifyContent: 'space-between',
  },
  editOption: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 20,
  },
  editIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  editOptionText: {
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
  },
});

export default GalleryScreen;
