import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { api, API_BASE } from '../services/api';
import { FileItem } from '../types';
import { colors, fontSize, spacing, borderRadius } from '../constants/theme';
import { downloadAndDecryptFileV3, getMasterKey, hasMasterKey } from '../crypto';
import { storage } from '../utils/storage';
import { API_BASE_URL } from '../constants/config';

// Yardımcı fonksiyon
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  FileViewer: { file: FileItem };
};

type FileViewerRouteProp = RouteProp<RootStackParamList, 'FileViewer'>;
type FileViewerNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FileViewerScreen: React.FC = () => {
  const navigation = useNavigation<FileViewerNavigationProp>();
  const route = useRoute<FileViewerRouteProp>();
  const { file } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContent();
  }, [file]);

  const loadContent = async () => {
    try {
      console.log('🎬 [FileViewer] loadContent başlıyor, dosya:', file.filename, 'encrypted:', file.isEncrypted);
      setLoading(true);
      setError(null);
      
      // Eğer dosya şifreli ise V3 envelope encryption ile çöz
      if (file.isEncrypted) {
        console.log("🔓 Şifreli dosya tespit edildi, V3 decryption başlatılıyor:", file.filename);
        
        // Master key kontrolü
        if (!hasMasterKey()) {
          setError("Güvenlik anahtarı bulunamadı. Lütfen çıkış yapıp yeniden giriş yapın.");
          setLoading(false);
          return;
        }
        
        // Dosyayı V3 envelope encryption ile indir ve çöz (sadece fileId ve filename gerekli)
        const localUri = await downloadAndDecryptFileV3(file.id, file.filename);
        
        console.log("✅ Dosya V3 ile çözüldü, local URI:", localUri);
        setContentUrl(localUri);
      } else {
        // Şifreli değilse dosyayı indir ve local URI kullan
        console.log("📥 Normal dosya indiriliyor:", file.filename);
        
        const token = await storage.getAccessToken();
        if (!token) {
          setError("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
          setLoading(false);
          return;
        }
        
        const downloadUrl = `${API_BASE}/files/${file.id}/download`;
        const localPath = `${FileSystem.cacheDirectory}${file.filename}`;
        
        console.log("📥 İndirme başlıyor:", downloadUrl);
        
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (downloadResult.status !== 200) {
          throw new Error(`Dosya indirilemedi (HTTP ${downloadResult.status})`);
        }
        
        console.log("✅ Dosya indirildi, local URI:", downloadResult.uri);
        setContentUrl(downloadResult.uri);
      }
    } catch (err: any) {
      console.error("❌ Dosya yükleme hatası:", err);
      setError(err.message || 'Dosya yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadContent}>
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!contentUrl) return null;

    // MIME type'ı belirle - şifreli dosyalar için dosya uzantısından çıkar
    let mimeType = file.mimeType || '';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const filename = file.filename || '';
      const ext = filename.split('.').pop()?.toLowerCase();
      
      // Dosya uzantısından MIME type belirle
      const mimeMap: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'ppt': 'application/vnd.ms-powerpoint',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'txt': 'text/plain',
      };
      
      mimeType = ext ? (mimeMap[ext] || 'application/octet-stream') : 'application/octet-stream';
      console.log('📄 MIME type uzantıdan belirlendi:', ext, '->', mimeType);
    }

    // Resim
    if (mimeType.startsWith('image/')) {
      return (
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: contentUrl }} 
            style={styles.fullImage}
            resizeMode="contain"
            onError={() => setError('Resim yüklenemedi')}
          />
        </View>
      );
    }

    // PDF - Native viewer ile aç
    if (mimeType.includes('pdf')) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text" size={80} color={colors.primary} />
          <Text style={styles.fileName}>{file.filename}</Text>
          <Text style={styles.fileInfo}>{formatFileSize(file.sizeBytes)}</Text>
          <Text style={styles.fileDescription}>PDF dosyalarını görüntülemek için aşağıdaki butona tıklayın</Text>
          <TouchableOpacity 
            style={styles.shareButton}
            onPress={async () => {
              try {
                if (!contentUrl) {
                  Alert.alert('Hata', 'Dosya henüz hazır değil');
                  return;
                }
                await Sharing.shareAsync(contentUrl, {
                  mimeType: mimeType,
                  dialogTitle: file.filename,
                  UTI: 'com.adobe.pdf'
                });
              } catch (error) {
                console.error('Paylaşım hatası:', error);
                Alert.alert('Hata', 'Dosya açılamadı');
              }
            }}
          >
            <Ionicons name="eye-outline" size={24} color="#fff" />
            <Text style={styles.shareButtonText}>PDF'i Görüntüle</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Office dosyaları (DOCX, XLSX, etc) - Native viewer ile aç
    if (mimeType.includes('word') || mimeType.includes('document') || 
        mimeType.includes('excel') || mimeType.includes('spreadsheet') ||
        mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
      
      const iconName = mimeType.includes('word') || mimeType.includes('document') ? 'document-text' :
                      mimeType.includes('excel') || mimeType.includes('spreadsheet') ? 'grid' :
                      'easel';
      
      const fileTypeName = mimeType.includes('word') || mimeType.includes('document') ? 'Word' :
                          mimeType.includes('excel') || mimeType.includes('spreadsheet') ? 'Excel' :
                          'PowerPoint';
      
      return (
        <View style={styles.centerContainer}>
          <Ionicons name={iconName} size={80} color={colors.primary} />
          <Text style={styles.fileName}>{file.filename}</Text>
          <Text style={styles.fileInfo}>{formatFileSize(file.sizeBytes)}</Text>
          <Text style={styles.fileDescription}>{fileTypeName} dosyalarını görüntülemek için aşağıdaki butona tıklayın</Text>
          <TouchableOpacity 
            style={styles.shareButton}
            onPress={async () => {
              try {
                if (!contentUrl) {
                  Alert.alert('Hata', 'Dosya henüz hazır değil');
                  return;
                }
                await Sharing.shareAsync(contentUrl, {
                  mimeType: mimeType,
                  dialogTitle: file.filename
                });
              } catch (error) {
                console.error('Paylaşım hatası:', error);
                Alert.alert('Hata', 'Dosya açılamadı');
              }
            }}
          >
            <Ionicons name="eye-outline" size={24} color="#fff" />
            <Text style={styles.shareButtonText}>Dosyayı Görüntüle</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Video
    if (mimeType.startsWith('video/')) {
      return (
        <WebView 
          source={{ 
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                    video { width: 100%; max-height: 100vh; }
                  </style>
                </head>
                <body>
                  <video controls autoplay playsinline>
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
          allowsInlineMediaPlayback={true}
        />
      );
    }

    // Audio
    if (mimeType.startsWith('audio/')) {
      return (
        <View style={styles.audioContainer}>
          <View style={styles.audioIcon}>
            <Ionicons name="musical-notes" size={80} color={colors.primary} />
          </View>
          <Text style={styles.audioFileName}>{file.filename}</Text>
          <WebView 
            source={{ 
              html: `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      * { margin: 0; padding: 0; }
                      body { background: transparent; display: flex; justify-content: center; align-items: center; height: 100vh; }
                      audio { width: 100%; }
                    </style>
                  </head>
                  <body>
                    <audio controls autoplay>
                      <source src="${contentUrl}" type="${mimeType}">
                    </audio>
                  </body>
                </html>
              `
            }}
            style={styles.audioWebview}
            mediaPlaybackRequiresUserAction={false}
          />
        </View>
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

    // Desteklenmeyen format
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="document-outline" size={80} color={colors.textMuted} />
        <Text style={styles.unsupportedText}>Bu dosya türü önizlenemez</Text>
        <Text style={styles.unsupportedMime}>{mimeType}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{file.filename}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullImage: {
    width: width,
    height: '100%',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  audioContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgDarker,
    padding: spacing.xl,
  },
  audioIcon: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  audioFileName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  audioWebview: {
    width: width - 40,
    height: 60,
    backgroundColor: 'transparent',
  },
  unsupportedText: {
    marginTop: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  unsupportedMime: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  fileName: {
    marginTop: spacing.lg,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fileInfo: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fileDescription: {
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  shareButton: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  shareButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  officeContainer: {
    flex: 1,
    position: 'relative',
  },
  shareButtonContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
  },
  floatingShareButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});

export default FileViewerScreen;
