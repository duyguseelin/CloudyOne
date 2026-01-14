import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { colors, borderRadius, fontSize, spacing } from '../constants/theme';
import { API_BASE_URL } from '../constants/config';

type RouteParams = {
  FileRequestUpload: {
    token: string;
  };
};

type RequestInfo = {
  title: string;
  description: string | null;
  ownerName: string;
  folderName: string;
  maxFileSize: number | null;
  allowedTypes: string | null;
};

type SelectedFile = {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
};

const FileRequestUploadScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'FileRequestUpload'>>();
  const { token } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);

  useEffect(() => {
    loadRequestInfo();
  }, [token]);

  const loadRequestInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/file-requests/public/${token}`);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Dosya isteği bulunamadı veya süresi dolmuş.');
      }
      
      const data = await response.json();
      setRequestInfo(data);
    } catch (err: any) {
      setError(err.message || 'Dosya isteği yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const validFiles: SelectedFile[] = [];
      
      for (const asset of result.assets) {
        // Dosya türü kontrolü
        if (requestInfo?.allowedTypes) {
          const allowedList = requestInfo.allowedTypes.toLowerCase().split(',').map(t => t.trim());
          const ext = asset.name.split('.').pop()?.toLowerCase() || '';
          if (!allowedList.includes(ext)) {
            Alert.alert('Hata', `${asset.name} dosyası kabul edilmiyor. İzin verilen türler: ${requestInfo.allowedTypes}`);
            continue;
          }
        }

        // Dosya boyutu kontrolü
        if (requestInfo?.maxFileSize && asset.size && asset.size > requestInfo.maxFileSize) {
          const maxSizeMB = (requestInfo.maxFileSize / (1024 * 1024)).toFixed(1);
          Alert.alert('Hata', `${asset.name} dosyası çok büyük. Maksimum: ${maxSizeMB} MB`);
          continue;
        }

        validFiles.push({
          uri: asset.uri,
          name: asset.name,
          size: asset.size || 0,
          mimeType: asset.mimeType,
        });
      }

      setSelectedFiles(prev => [...prev, ...validFiles]);
    } catch (err) {
      console.error('Dosya seçme hatası:', err);
      Alert.alert('Hata', 'Dosya seçilirken bir hata oluştu.');
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir dosya seçin.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      let completedCount = 0;

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        } as any);
        
        if (uploaderName.trim()) {
          formData.append('uploaderName', uploaderName.trim());
        }
        if (uploaderEmail.trim()) {
          formData.append('uploaderEmail', uploaderEmail.trim());
        }

        const response = await fetch(`${API_BASE_URL}/file-requests/public/${token}/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || data.error || 'Yükleme başarısız');
        }

        completedCount++;
        setUploadProgress(Math.round((completedCount / selectedFiles.length) * 100));
      }

      setUploadComplete(true);
    } catch (err: any) {
      Alert.alert('Yükleme Hatası', err.message || 'Dosya yüklenirken bir hata oluştu.');
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setSelectedFiles([]);
    setUploadComplete(false);
    setUploadProgress(0);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle" size={64} color={colors.error} />
          </View>
          <Text style={styles.errorTitle}>Bir Hata Oluştu</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (uploadComplete) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Yükleme Tamamlandı!</Text>
          <Text style={styles.successText}>
            {selectedFiles.length} dosya başarıyla yüklendi.
          </Text>
          <TouchableOpacity style={styles.newUploadButton} onPress={resetUpload}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.newUploadButtonText}>Yeni Dosya Yükle</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
      <LinearGradient
        colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Ionicons name="cloud" size={24} color="#fff" />
            </View>
            <Text style={styles.logoText}>CloudyOne</Text>
          </View>

          {/* Request Info */}
          <View style={styles.requestInfo}>
            <Text style={styles.requestTitle}>{requestInfo?.title}</Text>
            {requestInfo?.description && (
              <Text style={styles.requestDescription}>{requestInfo.description}</Text>
            )}
            <Text style={styles.requestMeta}>
              İsteyen: <Text style={styles.metaHighlight}>{requestInfo?.ownerName}</Text>
              {' · '}Klasör: <Text style={styles.metaHighlight}>{requestInfo?.folderName}</Text>
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Adınız (Opsiyonel)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="İsim"
                  placeholderTextColor={colors.textMuted}
                  value={uploaderName}
                  onChangeText={setUploaderName}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-posta (Opsiyonel)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ornek@email.com"
                  placeholderTextColor={colors.textMuted}
                  value={uploaderEmail}
                  onChangeText={setUploaderEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* File Picker */}
            <TouchableOpacity style={styles.dropZone} onPress={pickFiles}>
              <View style={styles.dropZoneIcon}>
                <Ionicons name="cloud-upload" size={40} color={colors.primary} />
              </View>
              <Text style={styles.dropZoneText}>Dosyaları seçmek için dokunun</Text>
              <Text style={styles.dropZoneHint}>
                {requestInfo?.maxFileSize 
                  ? `Maks. boyut: ${(requestInfo.maxFileSize / (1024 * 1024)).toFixed(0)} MB`
                  : 'Maks. boyut: 100 MB'}
                {requestInfo?.allowedTypes && ` · Türler: ${requestInfo.allowedTypes}`}
              </Text>
            </TouchableOpacity>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <View style={styles.selectedFiles}>
                <Text style={styles.selectedFilesTitle}>
                  Seçilen Dosyalar ({selectedFiles.length})
                </Text>
                {selectedFiles.map((file, index) => (
                  <View key={index} style={styles.fileItem}>
                    <View style={styles.fileIcon}>
                      <Ionicons name="document" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.removeButton}
                      onPress={() => removeFile(index)}
                    >
                      <Ionicons name="close-circle" size={24} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Upload Button */}
            <TouchableOpacity
              style={[
                styles.uploadButton,
                (uploading || selectedFiles.length === 0) && styles.uploadButtonDisabled
              ]}
              onPress={uploadFiles}
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.uploadButtonText}>
                    Yükleniyor... {uploadProgress}%
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>
                    {selectedFiles.length > 0 
                      ? `${selectedFiles.length} Dosya Yükle`
                      : 'Dosya Yükle'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>CloudyOne ile güvenli dosya paylaşımı</Text>
        </ScrollView>
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
  scrollView: {
    flex: 1,
    padding: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successIcon: {
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  successText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  newUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  newUploadButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: borderRadius.full,
    alignSelf: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  logoText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  requestInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  requestTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  requestDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  requestMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  metaHighlight: {
    color: colors.info,
  },
  formCard: {
    backgroundColor: 'rgba(30, 27, 75, 0.5)',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  inputRow: {
    flexDirection: 'column',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.3)',
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dropZoneIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dropZoneText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  dropZoneHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  selectedFiles: {
    marginBottom: spacing.lg,
  },
  selectedFilesTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  fileSize: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  removeButton: {
    padding: spacing.xs,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});

export default FileRequestUploadScreen;
