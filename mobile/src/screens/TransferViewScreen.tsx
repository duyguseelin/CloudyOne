import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { colors } from '../constants/theme';
import { API_BASE, api } from '../services/api';
import { getToken } from '../utils/storage';

interface TransferViewScreenProps {
  route: {
    params: {
      token: string;
    };
  };
  navigation: any;
}

interface TransferInfo {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  requirePassword: boolean;
  downloadLimit: number | null;
  downloadCount: number;
  isEncrypted: boolean;
  senderName: string | null;
  senderEmail: string | null;
}

export default function TransferViewScreen({ route, navigation }: TransferViewScreenProps) {
  const { token } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkLoginStatus();
    fetchTransferInfo();
  }, [token]);

  const checkLoginStatus = async () => {
    const authToken = await getToken();
    setIsLoggedIn(!!authToken);
  };

  const fetchTransferInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/files/quick-transfer/${token}`);
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Transfer bulunamadı.');
        return;
      }
      
      const data = await res.json();
      setTransferInfo(data);
    } catch (err) {
      setError('Bağlantı hatası.');
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

  const getFileIcon = () => {
    const mimeType = transferInfo?.mimeType;
    if (!mimeType) return 'document-outline';
    if (mimeType.startsWith('image/')) return 'image-outline';
    if (mimeType.startsWith('video/')) return 'videocam-outline';
    if (mimeType.startsWith('audio/')) return 'musical-notes-outline';
    if (mimeType.includes('pdf')) return 'document-text-outline';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive-outline';
    return 'document-outline';
  };

  const handleDownload = async () => {
    if (transferInfo?.requirePassword && !password) {
      setPasswordError(true);
      return;
    }
    
    setDownloading(true);
    setPasswordError(false);
    
    try {
      const url = `${API_BASE}/files/quick-transfer/${token}/download${password ? `?password=${encodeURIComponent(password)}` : ''}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        const data = await res.json();
        if (data.requirePassword) {
          setPasswordError(true);
          Alert.alert('Hata', 'Geçersiz şifre');
        } else {
          Alert.alert('Hata', data.error || 'İndirme başarısız.');
        }
        setDownloading(false);
        return;
      }
      
      const data = await res.json();
      
      // Dosyayı indir
      const filePath = `${FileSystem.documentDirectory}${transferInfo?.fileName}`;
      const download = await FileSystem.downloadAsync(data.downloadUrl, filePath);
      
      // Paylaş
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri);
      } else {
        // Galeriye kaydet (resim/video için)
        if (transferInfo?.mimeType?.startsWith('image/') || transferInfo?.mimeType?.startsWith('video/')) {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            await MediaLibrary.saveToLibraryAsync(download.uri);
            Alert.alert('Başarılı', 'Dosya galeriye kaydedildi');
          }
        } else {
          Alert.alert('Başarılı', 'Dosya indirildi');
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'İndirme başarısız.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveToAccount = async () => {
    if (!isLoggedIn) {
      Alert.alert(
        'Giriş Gerekli',
        'Dosyayı hesabınıza kaydetmek için giriş yapmanız gerekiyor.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Giriş Yap', onPress: () => navigation.navigate('Login') }
        ]
      );
      return;
    }

    if (transferInfo?.requirePassword && !password) {
      setPasswordError(true);
      Alert.alert('Hata', 'Lütfen şifreyi girin');
      return;
    }
    
    setSaving(true);
    setPasswordError(false);
    
    try {
      const result = await api.saveTransferToAccount(token, password || undefined);
      
      if (result.success) {
        Alert.alert(
          'Başarılı',
          'Dosya hesabınıza kaydedildi!',
          [
            {
              text: 'Dosyalarıma Git',
              onPress: () => navigation.navigate('Main', { screen: 'Files' })
            },
            { text: 'Tamam' }
          ]
        );
      }
    } catch (err: any) {
      if (err.message?.includes('requirePassword')) {
        setPasswordError(true);
        Alert.alert('Hata', 'Geçersiz şifre');
      } else {
        Alert.alert('Hata', err.message || 'Kaydetme başarısız.');
      }
    } finally {
      setSaving(false);
    }
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
          <Text style={styles.headerTitle}>Hızlı Transfer</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Sender Info */}
        {(transferInfo?.senderName || transferInfo?.senderEmail) && (
          <View style={styles.senderCard}>
            <View style={styles.senderIcon}>
              <Ionicons name="person-circle" size={40} color={colors.primary} />
            </View>
            <View style={styles.senderInfo}>
              <Text style={styles.senderLabel}>Gönderen</Text>
              {transferInfo.senderName && (
                <Text style={styles.senderName}>{transferInfo.senderName}</Text>
              )}
              {transferInfo.senderEmail && (
                <Text style={styles.senderEmail}>{transferInfo.senderEmail}</Text>
              )}
            </View>
          </View>
        )}

        {/* File Info */}
        <View style={styles.fileCard}>
          <View style={styles.fileIconContainer}>
            {transferInfo?.isEncrypted && (
              <View style={styles.encryptedBadge}>
                <Ionicons name="lock-closed" size={12} color={colors.warning} />
              </View>
            )}
            <Ionicons name={getFileIcon()} size={48} color={colors.primary} />
          </View>
          
          <Text style={styles.fileName} numberOfLines={2}>
            {transferInfo?.fileName}
          </Text>
          
          <Text style={styles.fileSize}>
            {formatFileSize(transferInfo?.sizeBytes || 0)}
          </Text>

          {/* Download info */}
          {transferInfo?.downloadLimit && (
            <View style={styles.downloadInfo}>
              <Ionicons name="download" size={14} color={colors.textSecondary} />
              <Text style={styles.downloadInfoText}>
                {transferInfo.downloadCount} / {transferInfo.downloadLimit} indirme
              </Text>
            </View>
          )}
        </View>

        {/* Password Input */}
        {transferInfo?.requirePassword && (
          <View style={styles.passwordSection}>
            <Text style={styles.passwordLabel}>Bu dosya şifre korumalı</Text>
            <View style={[styles.passwordInput, passwordError && styles.passwordInputError]}>
              <Ionicons name="lock-closed" size={20} color={colors.textSecondary} />
              <TextInput
                style={styles.passwordTextInput}
                placeholder="Şifre"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordError(false);
                }}
              />
            </View>
            {passwordError && (
              <Text style={styles.passwordErrorText}>Geçersiz şifre</Text>
            )}
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {/* İndir butonu */}
          <TouchableOpacity
            style={[styles.button, styles.downloadButton]}
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.buttonText}>Cihaza İndir</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Hesaba Kaydet butonu */}
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSaveToAccount}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                <Text style={[styles.buttonText, { color: colors.primary }]}>
                  {isLoggedIn ? 'Dosyalarıma Kaydet' : 'Giriş Yap ve Kaydet'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Expiry Info */}
        {transferInfo?.expiresAt && (
          <Text style={styles.expiryText}>
            Bu link {new Date(transferInfo.expiresAt).toLocaleDateString('tr-TR', {
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
  senderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  senderIcon: {
    marginRight: 12,
  },
  senderInfo: {
    flex: 1,
  },
  senderLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  senderName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  senderEmail: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  fileCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 8,
  },
  downloadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadInfoText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  passwordSection: {
    marginBottom: 24,
  },
  passwordLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  passwordInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  passwordInputError: {
    borderColor: colors.error,
  },
  passwordTextInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    marginLeft: 12,
  },
  passwordErrorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
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
  downloadButton: {
    backgroundColor: colors.primary,
  },
  saveButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  expiryText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
