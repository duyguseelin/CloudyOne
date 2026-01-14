import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Video, ResizeMode } from 'expo-av';
import { colors } from '../constants/theme';
import { API_BASE } from '../services/api';
// @ts-ignore - noble/ciphers types
import { gcm } from '@noble/ciphers/aes';
import { base64ToBytes, bytesToBase64 } from '../crypto';

interface ShareViewScreenProps {
  route: {
    params: {
      token: string;
      dekFragment?: string;
    };
  };
  navigation: any;
}

interface ShareInfo {
  filename: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string | null;
  permission: 'VIEW' | 'DOWNLOAD' | 'EDIT';
  expiresAt: string | null;
  isEncrypted: boolean;
  cipherIv: string | null;
}

interface DekData {
  dek: string;
  cipherIv: string;
  metaNameEnc: string;
  metaNameIv: string;
}

export default function ShareViewScreen({ route, navigation }: ShareViewScreenProps) {
  const { token, dekFragment } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [dekData, setDekData] = useState<DekData | null>(null);
  const [decryptedFilename, setDecryptedFilename] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    // DEK fragment'ını parse et
    if (dekFragment) {
      try {
        const parts = decodeURIComponent(dekFragment).split('.');
        if (parts.length === 4) {
          setDekData({
            dek: parts[0],
            cipherIv: parts[1],
            metaNameEnc: parts[2],
            metaNameIv: parts[3],
          });
        }
      } catch (e) {
        console.error('DEK parse error:', e);
      }
    }
    
    fetchShareInfo();
  }, [token, dekFragment]);

  // Şifreli dosya adını çöz
  useEffect(() => {
    if (dekData && shareInfo?.isEncrypted && dekData.metaNameEnc && dekData.metaNameIv) {
      decryptFilename();
    }
  }, [dekData, shareInfo]);

  const decryptFilename = async () => {
    if (!dekData?.metaNameEnc || !dekData?.metaNameIv) return;
    
    try {
      const dekBytes = base64ToBytes(dekData.dek);
      const ivBytes = base64ToBytes(dekData.metaNameIv);
      const encBytes = base64ToBytes(dekData.metaNameEnc);
      
      const cipher = gcm(dekBytes, ivBytes);
      const plainBytes = cipher.decrypt(encBytes);
      const filename = new TextDecoder().decode(plainBytes);
      setDecryptedFilename(filename);
    } catch (e) {
      console.error('Filename decrypt error:', e);
    }
  };

  const fetchShareInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/files/share/${token}/info`);
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Paylaşım bulunamadı');
        return;
      }
      
      const data = await res.json();
      setShareInfo(data);
    } catch (e: any) {
      setError(e.message || 'Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const isPreviewable = (mimeType: string | null) => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || 
           mimeType.startsWith('video/') ||
           mimeType.startsWith('audio/');
  };

  // Şifreli dosyayı indir ve decrypt et
  const fetchAndDecrypt = async (): Promise<Uint8Array | null> => {
    if (!shareInfo?.isEncrypted || !dekData) return null;
    
    try {
      const res = await fetch(`${API_BASE}/files/share/${token}/download-encrypted`);
      if (!res.ok) throw new Error('Dosya indirilemedi');
      
      const cipherIv = res.headers.get('X-Cipher-Iv') || dekData.cipherIv;
      const ciphertext = new Uint8Array(await res.arrayBuffer());
      
      const dekBytes = base64ToBytes(dekData.dek);
      const ivBytes = base64ToBytes(cipherIv);
      
      const cipher = gcm(dekBytes, ivBytes);
      const plaintext = cipher.decrypt(ciphertext);
      
      return plaintext;
    } catch (e) {
      console.error('Decrypt error:', e);
      throw e;
    }
  };

  const handlePreview = async () => {
    if (!shareInfo) return;
    
    setPreviewLoading(true);
    
    try {
      if (shareInfo.isEncrypted && dekData) {
        const plaintext = await fetchAndDecrypt();
        if (plaintext) {
          // Temp dosyaya yaz
          const filename = decryptedFilename || shareInfo.originalFilename || 'preview';
          const tempPath = `${FileSystem.cacheDirectory}${filename}`;
          
          await FileSystem.writeAsStringAsync(tempPath, bytesToBase64(plaintext), {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          setPreviewUrl(tempPath);
        }
      } else {
        // Şifresiz dosya
        const tempPath = `${FileSystem.cacheDirectory}${shareInfo.filename}`;
        const download = await FileSystem.downloadAsync(
          `${API_BASE}/share/${token}`,
          tempPath
        );
        setPreviewUrl(download.uri);
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Önizleme yüklenemedi');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!shareInfo) return;
    
    // İzin kontrolü
    if (shareInfo.permission === 'VIEW') {
      Alert.alert('Uyarı', 'Bu dosya sadece görüntüleme izniyle paylaşılmış, indirilemez.');
      return;
    }
    
    // Şifreli dosya için DEK kontrolü
    if (shareInfo.isEncrypted && !dekData) {
      Alert.alert('Hata', 'Şifre çözme anahtarı eksik. Lütfen tam paylaşım linkini kullanın.');
      return;
    }
    
    setDownloading(true);
    
    try {
      let filePath: string;
      const filename = decryptedFilename || shareInfo.originalFilename || shareInfo.filename;
      
      if (shareInfo.isEncrypted && dekData) {
        // Şifreli dosyayı decrypt et
        const plaintext = await fetchAndDecrypt();
        if (!plaintext) throw new Error('Şifre çözülemedi');
        
        filePath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(filePath, bytesToBase64(plaintext), {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // Şifresiz dosya
        filePath = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.downloadAsync(`${API_BASE}/share/${token}`, filePath);
      }
      
      // Paylaş veya kaydet
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath);
      } else {
        // Galeriye kaydet (resim/video için)
        if (shareInfo.mimeType?.startsWith('image/') || shareInfo.mimeType?.startsWith('video/')) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            await MediaLibrary.saveToLibraryAsync(filePath);
            Alert.alert('Başarılı', 'Dosya galeriye kaydedildi');
          }
        } else {
          Alert.alert('Başarılı', `Dosya indirildi: ${filename}`);
        }
      }
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'İndirme başarısız');
    } finally {
      setDownloading(false);
    }
  };

  const getFileIcon = () => {
    const mimeType = shareInfo?.mimeType;
    if (!mimeType) return 'document-outline';
    if (mimeType.startsWith('image/')) return 'image-outline';
    if (mimeType.startsWith('video/')) return 'videocam-outline';
    if (mimeType.startsWith('audio/')) return 'musical-notes-outline';
    if (mimeType.includes('pdf')) return 'document-text-outline';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive-outline';
    return 'document-outline';
  };

  const renderPreview = () => {
    if (!previewUrl || !shareInfo?.mimeType) return null;
    
    if (shareInfo.mimeType.startsWith('image/')) {
      return (
        <Image
          source={{ uri: previewUrl }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      );
    }
    
    if (shareInfo.mimeType.startsWith('video/')) {
      return (
        <Video
          source={{ uri: previewUrl }}
          style={styles.previewVideo}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
        />
      );
    }
    
    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={styles.errorTitle}>Hata</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Paylaşılan Dosya</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* File Info */}
        <View style={styles.fileCard}>
          <View style={styles.fileIconContainer}>
            {shareInfo?.isEncrypted && (
              <View style={styles.encryptedBadge}>
                <Ionicons name="lock-closed" size={12} color={colors.warning} />
              </View>
            )}
            <Ionicons name={getFileIcon()} size={48} color={colors.primary} />
          </View>
          
          <Text style={styles.fileName} numberOfLines={2}>
            {decryptedFilename || shareInfo?.originalFilename || shareInfo?.filename}
          </Text>
          
          <Text style={styles.fileSize}>
            {formatFileSize(shareInfo?.sizeBytes || 0)}
          </Text>
          
          {shareInfo?.isEncrypted && (
            <View style={styles.encryptedInfo}>
              <Ionicons name="shield-checkmark" size={16} color={colors.success} />
              <Text style={styles.encryptedText}>Uçtan Uca Şifreli</Text>
            </View>
          )}
          
          {/* DEK Uyarısı */}
          {shareInfo?.isEncrypted && !dekData && (
            <View style={styles.dekWarning}>
              <Ionicons name="warning" size={20} color={colors.warning} />
              <Text style={styles.dekWarningText}>
                Şifre çözme anahtarı eksik. Tam paylaşım linkini kullanın.
              </Text>
            </View>
          )}
        </View>

        {/* Preview */}
        {previewUrl && (
          <View style={styles.previewContainer}>
            {renderPreview()}
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {/* Önizle */}
          {isPreviewable(shareInfo?.mimeType || null) && (
            <TouchableOpacity
              style={[styles.button, styles.previewButton]}
              onPress={handlePreview}
              disabled={previewLoading || (shareInfo?.isEncrypted && !dekData)}
            >
              {previewLoading ? (
                <ActivityIndicator color={colors.success} />
              ) : (
                <>
                  <Ionicons name="eye-outline" size={20} color={colors.success} />
                  <Text style={[styles.buttonText, { color: colors.success }]}>Önizle</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          
          {/* İndir - DOWNLOAD veya EDIT izninde */}
          {(shareInfo?.permission === 'DOWNLOAD' || shareInfo?.permission === 'EDIT') && (
            <TouchableOpacity
              style={[styles.button, styles.downloadButton]}
              onPress={handleDownload}
              disabled={downloading || (shareInfo?.isEncrypted && !dekData)}
            >
              {downloading ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.buttonText}>İndir</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Permission Info */}
        <View style={styles.permissionInfo}>
          <Ionicons 
            name={shareInfo?.permission === 'VIEW' ? 'eye' : shareInfo?.permission === 'EDIT' ? 'create' : 'download'} 
            size={16} 
            color={colors.textSecondary} 
          />
          <Text style={styles.permissionText}>
            {shareInfo?.permission === 'VIEW' && 'Sadece görüntüleme izni'}
            {shareInfo?.permission === 'DOWNLOAD' && 'Görüntüleme ve indirme izni'}
            {shareInfo?.permission === 'EDIT' && 'Tüm izinler (düzenleme dahil)'}
          </Text>
        </View>

        {/* Expiry Info */}
        {shareInfo?.expiresAt && (
          <Text style={styles.expiryText}>
            Bu link {new Date(shareInfo.expiresAt).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })} tarihine kadar geçerli
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: colors.error,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  fileCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  fileIconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  encryptedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.bgDark,
    borderRadius: 12,
    padding: 4,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  fileSize: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
  encryptedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  encryptedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '500',
  },
  dekWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  dekWarningText: {
    color: colors.warning,
    fontSize: 12,
    flex: 1,
  },
  previewContainer: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
  },
  previewImage: {
    width: '100%',
    height: 300,
  },
  previewVideo: {
    width: '100%',
    height: 250,
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  previewButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  downloadButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  permissionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  permissionText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  expiryText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
