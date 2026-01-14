import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { api, API_BASE } from '../services/api';
import { FileItem } from '../types';
import { getMasterKey, hasMasterKey, downloadAndDecryptFile } from '../crypto';
import { storage } from '../utils/storage';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  FilePreview: { file: FileItem; openShareModal?: boolean };
};

type FilePreviewRouteProp = RouteProp<RootStackParamList, 'FilePreview'>;
type FilePreviewNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FilePreviewScreen: React.FC = () => {
  const navigation = useNavigation<FilePreviewNavigationProp>();
  const route = useRoute<FilePreviewRouteProp>();
  const { file, openShareModal: shouldOpenShareModal } = route.params;
  
  const [loading, setLoading] = useState(false);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  
  // Paylaşım Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('24'); // saat cinsinden
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('DOWNLOAD');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPermissionPicker, setShowPermissionPicker] = useState(false);

  // Eğer openShareModal parametresi true ise paylaşım modal'ını aç
  useEffect(() => {
    if (shouldOpenShareModal) {
      setShowShareModal(true);
    }
  }, [shouldOpenShareModal]);

  // Görsel dosyalar için thumbnail yükle
  useEffect(() => {
    if (file.mimeType?.startsWith('image/')) {
      loadThumbnail();
    }
  }, [file]);

  // Klasör bilgisini yükle
  useEffect(() => {
    if (file.folderId) {
      loadFolderInfo();
    }
  }, [file.folderId]);

  const loadFolderInfo = async () => {
    if (!file.folderId) return;
    try {
      const folder = await api.getFolder(file.folderId);
      if (folder) {
        setFolderName(folder.name);
      }
    } catch (error) {
      console.error('Klasör bilgisi yüklenemedi:', error);
    }
  };

  const loadThumbnail = async () => {
    try {
      setThumbnailLoading(true);
      
      // Şifreli resim ise decrypt et
      if (file.isEncrypted && hasMasterKey()) {
        const token = await storage.getAccessToken();
        if (!token) {
          setThumbnailLoading(false);
          return;
        }
        
        const masterKey = getMasterKey();
        const { uri } = await downloadAndDecryptFile(
          file.id,
          masterKey,
          token,
          API_BASE
        );
        setThumbnailUrl(uri);
      } else {
        // Normal (şifresiz) dosya
        const url = await api.getDownloadUrl(file.id);
        setThumbnailUrl(url);
      }
    } catch (error) {
      console.error('Thumbnail yüklenemedi:', error);
    } finally {
      setThumbnailLoading(false);
    }
  };

  const getFileIcon = (mimeType: string | null | undefined): keyof typeof Ionicons.glyphMap => {
    if (!mimeType) return 'document-outline';
    if (mimeType.startsWith('image/')) return 'image-outline';
    if (mimeType.startsWith('video/')) return 'videocam-outline';
    if (mimeType.startsWith('audio/')) return 'musical-notes-outline';
    if (mimeType.includes('pdf')) return 'document-text-outline';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive-outline';
    return 'document-outline';
  };

  const getFileIconColor = (mimeType: string | null | undefined): string => {
    if (!mimeType) return colors.fileDefault;
    if (mimeType.startsWith('image/')) return colors.fileImage;
    if (mimeType.startsWith('video/')) return colors.fileVideo;
    if (mimeType.startsWith('audio/')) return colors.fileAudio;
    if (mimeType.includes('pdf')) return colors.filePdf;
    return colors.fileDefault;
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
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Dosya görüntülenebilir mi kontrol et
  const isViewable = (): boolean => {
    const mimeType = file.mimeType || '';
    return (
      mimeType.startsWith('image/') ||
      mimeType.includes('pdf') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('text/')
    );
  };

  // Görüntüle butonuna basıldığında
  const handleView = async () => {
    try {
      setViewerLoading(true);
      
      // Şifreli dosya ise decrypt et
      if (file.isEncrypted) {
        if (!hasMasterKey()) {
          Alert.alert('Hata', 'Şifreli dosyayı görüntülemek için önce şifrenizi girin');
          setViewerLoading(false);
          return;
        }
        
        const token = await storage.getAccessToken();
        if (!token) {
          Alert.alert('Hata', 'Oturum bulunamadı');
          setViewerLoading(false);
          return;
        }
        
        const masterKey = getMasterKey();
        const { uri, filename } = await downloadAndDecryptFile(
          file.id,
          masterKey,
          token,
          API_BASE
        );
        
        // Çözülmüş dosyanın URI'sini kullan
        setContentUrl(uri);
        setShowViewer(true);
      } else {
        // Normal (şifresiz) dosya
        const url = await api.getDownloadUrl(file.id);
        setContentUrl(url);
        setShowViewer(true);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya açılamadı');
    } finally {
      setViewerLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const url = await api.getDownloadUrl(file.id);
      await Linking.openURL(url);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İndirme başarısız');
    }
  };

  // Paylaş butonuna basıldığında modal açılır
  const handleShare = () => {
    setShareLink(null);
    setShareExpiry('24');
    setSharePermission('DOWNLOAD');
    setShowPermissionPicker(false);
    setShowShareModal(true);
  };

  // İzin türü açıklaması
  const getPermissionLabel = (permission: 'VIEW' | 'DOWNLOAD' | 'EDIT') => {
    switch (permission) {
      case 'VIEW': return 'Sadece Görüntüleme';
      case 'DOWNLOAD': return 'Görüntüleme ve İndirme';
      case 'EDIT': return 'Görüntüleme, İndirme ve Düzenleme';
    }
  };

  const getPermissionIcon = (permission: 'VIEW' | 'DOWNLOAD' | 'EDIT'): keyof typeof Ionicons.glyphMap => {
    switch (permission) {
      case 'VIEW': return 'eye-outline';
      case 'DOWNLOAD': return 'download-outline';
      case 'EDIT': return 'create-outline';
    }
  };

  // Paylaşım linki oluştur
  const generateShareLink = async () => {
    try {
      setShareLoading(true);
      const expiresIn = shareExpiry ? parseInt(shareExpiry) : 'unlimited';
      const result = await api.createShareLink(file.id, { 
        expiresIn: expiresIn === 'unlimited' ? 'unlimited' : `${expiresIn}h`,
        permission: sharePermission 
      });
      
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
      
      setShareLink(finalShareUrl);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Paylaşım linki oluşturulamadı');
    } finally {
      setShareLoading(false);
    }
  };

  // Linki kopyala
  const copyToClipboard = async () => {
    if (shareLink) {
      await Clipboard.setStringAsync(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await api.toggleFavorite(file.id, file.isFavorite);
      Alert.alert('Başarılı', file.isFavorite ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İşlem başarısız');
    }
  };

  // Dosya içeriğini render et
  const renderContent = () => {
    if (!contentUrl) return null;
    
    const mimeType = file.mimeType || '';

    // Resim
    if (mimeType.startsWith('image/')) {
      return (
        <View style={styles.viewerContent}>
          <Image 
            source={{ uri: contentUrl, cache: 'reload' }} 
            style={styles.fullImage}
            resizeMode="contain"
            onError={(e) => {
              console.error('[FilePreview] Image load error:', e.nativeEvent.error);
              Alert.alert('Hata', 'Görsel yüklenemedi. Lütfen tekrar deneyin.');
            }}
          />
        </View>
      );
    }

    // PDF - Google Docs Viewer ile göster
    if (mimeType.includes('pdf')) {
      const pdfViewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(contentUrl)}`;
      return (
        <WebView 
          source={{ uri: pdfViewerUrl }}
          style={styles.webview}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>PDF yükleniyor...</Text>
            </View>
          )}
          onError={(e) => console.error('WebView error:', e)}
        />
      );
    }

    // Video
    if (mimeType.startsWith('video/')) {
      return (
        <WebView 
          source={{ 
            html: `
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; }
                    video { max-width: 100%; max-height: 100%; }
                  </style>
                </head>
                <body>
                  <video controls autoplay>
                    <source src="${contentUrl}" type="${mimeType}">
                    Tarayıcınız video oynatmayı desteklemiyor.
                  </video>
                </body>
              </html>
            `
          }}
          style={styles.webview}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
        />
      );
    }

    // Audio
    if (mimeType.startsWith('audio/')) {
      return (
        <WebView 
          source={{ 
            html: `
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body { margin: 0; background: #1a1f3c; display: flex; justify-content: center; align-items: center; height: 100vh; }
                    audio { width: 90%; }
                  </style>
                </head>
                <body>
                  <audio controls autoplay>
                    <source src="${contentUrl}" type="${mimeType}">
                    Tarayıcınız ses oynatmayı desteklemiyor.
                  </audio>
                </body>
              </html>
            `
          }}
          style={styles.webview}
          mediaPlaybackRequiresUserAction={false}
        />
      );
    }

    // Text dosyaları
    if (mimeType.startsWith('text/')) {
      return (
        <WebView 
          source={{ uri: contentUrl }}
          style={styles.webview}
          startInLoadingState={true}
        />
      );
    }

    return (
      <View style={styles.viewerContent}>
        <Ionicons name="document-outline" size={80} color={colors.textMuted} />
        <Text style={styles.noPreviewText}>Bu dosya türü önizlenemez</Text>
      </View>
    );
  };

  const iconColor = getFileIconColor(file.mimeType);

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
          <Text style={styles.headerTitle} numberOfLines={1}>Dosya Detayı</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton} onPress={handleToggleFavorite}>
              <Ionicons 
                name={file.isFavorite ? "star" : "star-outline"} 
                size={22} 
                color={file.isFavorite ? colors.warning : colors.textPrimary} 
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Preview Area - Görsel dosyalar için resim, diğerleri için ikon */}
          <View style={styles.previewContainer}>
            {file.mimeType?.startsWith('image/') ? (
              thumbnailLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : thumbnailUrl ? (
                <Image 
                  source={{ uri: thumbnailUrl }} 
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.iconPreview, { backgroundColor: `${iconColor}20` }]}>
                  <Ionicons name={getFileIcon(file.mimeType)} size={80} color={iconColor} />
                </View>
              )
            ) : (
              <View style={[styles.iconPreview, { backgroundColor: `${iconColor}20` }]}>
                <Ionicons name={getFileIcon(file.mimeType)} size={80} color={iconColor} />
              </View>
            )}
          </View>

          {/* File Name */}
          <View style={styles.fileNameContainer}>
            <Text style={styles.fileName}>{file.filename}</Text>
          </View>

          {/* File Info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Boyut</Text>
              <Text style={styles.infoValue}>{formatFileSize(file.sizeBytes)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tür</Text>
              <Text style={styles.infoValue}>{file.mimeType || 'Bilinmiyor'}</Text>
            </View>
            {(file.folderId || folderName) && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Klasör</Text>
                <View style={styles.folderInfoValue}>
                  <Ionicons name="folder" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.infoValue}>{folderName || 'Yükleniyor...'}</Text>
                </View>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Oluşturulma</Text>
              <Text style={styles.infoValue}>{formatDate(file.createdAt)}</Text>
            </View>
            {file.updatedAt && (
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.infoLabel}>Güncelleme</Text>
                <Text style={styles.infoValue}>{formatDate(file.updatedAt)}</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {/* Görüntüle Butonu */}
            {isViewable() && (
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={handleView}
                disabled={viewerLoading}
              >
                <LinearGradient
                  colors={gradients.primary as [string, string]}
                  style={styles.actionButtonGradient}
                >
                  {viewerLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="eye" size={22} color="#fff" />
                      <Text style={styles.actionButtonText}>Görüntüle</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* İndir Butonu */}
            <TouchableOpacity style={styles.actionButton} onPress={handleDownload}>
              <LinearGradient
                colors={gradients.secondary as [string, string]}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="download" size={22} color="#fff" />
                <Text style={styles.actionButtonText}>İndir</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Paylaş Butonu */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <View style={styles.actionButtonOutline}>
              <Ionicons name="share-social" size={22} color={colors.primary} />
              <Text style={[styles.actionButtonText, { color: colors.primary }]}>Paylaş</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Viewer Modal */}
      <Modal
        visible={showViewer}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowViewer(false)}
      >
        <View style={styles.viewerContainer}>
          <SafeAreaView style={styles.viewerSafeArea}>
            {/* Viewer Header */}
            <View style={styles.viewerHeader}>
              <TouchableOpacity 
                onPress={() => setShowViewer(false)} 
                style={styles.viewerCloseButton}
              >
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.viewerTitle} numberOfLines={1}>{file.filename}</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Viewer Content */}
            {loading ? (
              <View style={styles.viewerLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              renderContent()
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Paylaşım Modal */}
      <Modal
        visible={showShareModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={styles.shareModalOverlay}>
          <View style={styles.shareModalContent}>
            {/* Modal Header */}
            <View style={styles.shareModalHeader}>
              <View style={styles.shareModalIcon}>
                <Ionicons name="share-social" size={24} color={colors.primary} />
              </View>
              <View style={styles.shareModalHeaderText}>
                <Text style={styles.shareModalTitle}>Dosya Paylaş</Text>
                <Text style={styles.shareModalSubtitle} numberOfLines={1}>{file.filename}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowShareModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Süre Ayarı */}
            <View style={styles.shareOptionSection}>
              <View style={styles.shareOptionLabel}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={styles.shareOptionLabelText}>Süre (saat)</Text>
              </View>
              <TextInput
                style={styles.shareInput}
                placeholder="Örn: 24 (boş = süresiz)"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={shareExpiry}
                onChangeText={setShareExpiry}
              />
              <Text style={styles.shareOptionHint}>
                Boş bırakırsanız süresiz olacak. Maks: 8760 saat (1 yıl)
              </Text>
            </View>

            {/* İzin Ayarı */}
            <View style={styles.shareOptionSection}>
              <View style={styles.shareOptionLabel}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                <Text style={styles.shareOptionLabelText}>İzin Türü</Text>
              </View>
              
              {/* Seçili İzin Butonu */}
              <TouchableOpacity 
                style={styles.permissionSelector}
                onPress={() => setShowPermissionPicker(!showPermissionPicker)}
              >
                <View style={styles.permissionSelectorLeft}>
                  <Ionicons name={getPermissionIcon(sharePermission)} size={20} color={colors.primary} />
                  <Text style={styles.permissionSelectorText}>{getPermissionLabel(sharePermission)}</Text>
                </View>
                <Ionicons 
                  name={showPermissionPicker ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={colors.textMuted} 
                />
              </TouchableOpacity>

              {/* İzin Seçenekleri Dropdown */}
              {showPermissionPicker && (
                <View style={styles.permissionDropdown}>
                  <TouchableOpacity 
                    style={[
                      styles.permissionOption,
                      sharePermission === 'VIEW' && styles.permissionOptionActive
                    ]}
                    onPress={() => { setSharePermission('VIEW'); setShowPermissionPicker(false); }}
                  >
                    <Ionicons name="eye-outline" size={20} color={sharePermission === 'VIEW' ? colors.primary : colors.textSecondary} />
                    <View style={styles.permissionOptionText}>
                      <Text style={[styles.permissionOptionTitle, sharePermission === 'VIEW' && styles.permissionOptionTitleActive]}>Sadece Görüntüleme</Text>
                      <Text style={styles.permissionOptionDesc}>Dosyayı sadece görüntüleyebilir</Text>
                    </View>
                    {sharePermission === 'VIEW' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[
                      styles.permissionOption,
                      sharePermission === 'DOWNLOAD' && styles.permissionOptionActive
                    ]}
                    onPress={() => { setSharePermission('DOWNLOAD'); setShowPermissionPicker(false); }}
                  >
                    <Ionicons name="download-outline" size={20} color={sharePermission === 'DOWNLOAD' ? colors.primary : colors.textSecondary} />
                    <View style={styles.permissionOptionText}>
                      <Text style={[styles.permissionOptionTitle, sharePermission === 'DOWNLOAD' && styles.permissionOptionTitleActive]}>Görüntüleme ve İndirme</Text>
                      <Text style={styles.permissionOptionDesc}>Dosyayı görüntüleyebilir ve indirebilir</Text>
                    </View>
                    {sharePermission === 'DOWNLOAD' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[
                      styles.permissionOption,
                      sharePermission === 'EDIT' && styles.permissionOptionActive
                    ]}
                    onPress={() => { setSharePermission('EDIT'); setShowPermissionPicker(false); }}
                  >
                    <Ionicons name="create-outline" size={20} color={sharePermission === 'EDIT' ? colors.primary : colors.textSecondary} />
                    <View style={styles.permissionOptionText}>
                      <Text style={[styles.permissionOptionTitle, sharePermission === 'EDIT' && styles.permissionOptionTitleActive]}>Tam Erişim</Text>
                      <Text style={styles.permissionOptionDesc}>Görüntüleme, indirme ve düzenleme izni</Text>
                    </View>
                    {sharePermission === 'EDIT' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Paylaşım Linki */}
            {shareLink && (
              <View style={styles.shareLinkSection}>
                <View style={styles.shareOptionLabel}>
                  <Ionicons name="link-outline" size={18} color={colors.success} />
                  <Text style={[styles.shareOptionLabelText, { color: colors.success }]}>Paylaşım Linki</Text>
                </View>
                <View style={styles.shareLinkContainer}>
                  <Text style={styles.shareLinkText} numberOfLines={2}>{shareLink}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
                    <Ionicons 
                      name={copied ? "checkmark" : "copy-outline"} 
                      size={20} 
                      color={copied ? colors.success : colors.primary} 
                    />
                  </TouchableOpacity>
                </View>
                {copied && <Text style={styles.copiedText}>Kopyalandı!</Text>}
              </View>
            )}

            {/* Butonlar */}
            <View style={styles.shareModalButtons}>
              <TouchableOpacity 
                style={styles.shareCancelButton} 
                onPress={() => setShowShareModal(false)}
              >
                <Text style={styles.shareCancelButtonText}>Kapat</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.shareGenerateButton}
                onPress={generateShareLink}
                disabled={shareLoading}
              >
                <LinearGradient
                  colors={gradients.primary as [string, string]}
                  style={styles.shareGenerateButtonGradient}
                >
                  {shareLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="link" size={18} color="#fff" />
                      <Text style={styles.shareGenerateButtonText}>
                        {shareLink ? 'Güncelle' : 'Link Oluştur'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  previewContainer: {
    height: 200,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.xl,
  },
  iconPreview: {
    width: 140,
    height: 140,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileNameContainer: {
    marginBottom: spacing.lg,
  },
  fileName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  folderInfoValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  shareButton: {
    marginBottom: spacing.xxl,
  },
  // Viewer Modal Styles
  viewerContainer: {
    flex: 1,
    backgroundColor: colors.bgDarker,
  },
  viewerSafeArea: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewerCloseButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  viewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  viewerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: height - 100,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bgDarker,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgDarker,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  noPreviewText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  // Share Modal Styles
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'flex-end',
  },
  shareModalContent: {
    backgroundColor: colors.bgDarker,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
  },
  shareModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shareModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  shareModalHeaderText: {
    flex: 1,
  },
  shareModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  shareModalSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  shareOptionSection: {
    marginBottom: spacing.lg,
  },
  shareOptionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  shareOptionLabelText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  shareInput: {
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareOptionHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  permissionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  permissionSelectorText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  permissionDropdown: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  permissionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  permissionOptionActive: {
    backgroundColor: `${colors.primary}15`,
  },
  permissionOptionText: {
    flex: 1,
  },
  permissionOptionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  permissionOptionTitleActive: {
    color: colors.primary,
  },
  permissionOptionDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  shareLinkSection: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: `${colors.success}10`,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
  },
  shareLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  shareLinkText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  copyButton: {
    padding: spacing.sm,
  },
  copiedText: {
    fontSize: fontSize.xs,
    color: colors.success,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  shareModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  shareCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  shareCancelButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  shareGenerateButton: {
    flex: 2,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  shareGenerateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  shareGenerateButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
});

export default FilePreviewScreen;
