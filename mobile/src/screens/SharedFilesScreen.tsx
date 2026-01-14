import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api, API_BASE } from '../services/api';
import { FileItem } from '../types';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { getMasterKey, hasMasterKey } from '../crypto';

interface SharedFile extends FileItem {
  sharedWith?: string;
  sharePermission?: 'VIEW' | 'DOWNLOAD' | 'EDIT';
  shareToken?: string;
  shareExpiresAt?: string;
  shareOpenCount?: number;
}

const SharedFilesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Paylaşım düzenleme modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SharedFile | null>(null);
  const [shareExpiry, setShareExpiry] = useState('24'); // Saat cinsinden
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('DOWNLOAD');
  const [isUpdating, setIsUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Tarih/Saat Seçici State
  const [useCustomExpiry, setUseCustomExpiry] = useState(false);
  const [customExpiryDate, setCustomExpiryDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Menu modal
  const [menuVisible, setMenuVisible] = useState(false);
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
        loadSharedFiles();
      } else {
        console.log('⏳ [SharedFiles] Master key bekleniyor...');
        setLoading(true);
      }
    }, [hasEncryptionKey])
  );

  // Master key hazır olduğunda dosyaları yükle
  useEffect(() => {
    if (hasEncryptionKey && !prevHasKeyRef.current) {
      console.log('🔑 [SharedFiles] Master key hazır - dosyalar yükleniyor');
      loadSharedFiles();
    }
    prevHasKeyRef.current = hasEncryptionKey;
  }, [hasEncryptionKey]);

  const loadSharedFiles = async () => {
    try {
      const response = await api.getSharedFiles();
      const rawFiles = (response as any)?.files || response || [];
      
      // Şifrelenmiş dosya adlarını çöz
      const decryptedFiles = await Promise.all(
        rawFiles.map(async (file: SharedFile) => {
          if (file.isEncrypted && (file as any).metaNameEnc && (file as any).metaNameIv) {
            // Master key yoksa - useFocusEffect zaten bekletecek
            if (!hasMasterKey()) {
              console.log('⏳ [SharedFiles] Master key henüz hazır değil:', file.id);
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
    } catch (error) {
      console.error('Paylaşılan dosyalar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditShare = (file: SharedFile) => {
    setSelectedFile(file);
    setSharePermission(file.sharePermission || 'DOWNLOAD');
    setShareExpiry('24');
    setUseCustomExpiry(false);
    setCustomExpiryDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    setEditModalVisible(true);
  };

  const handleUpdateShare = async () => {
    if (!selectedFile) return;
    
    setIsUpdating(true);
    try {
      let expiresIn: string | undefined;
      
      if (useCustomExpiry) {
        const now = Date.now();
        const diff = customExpiryDate.getTime() - now;
        const hours = Math.ceil(diff / (1000 * 60 * 60));
        expiresIn = hours > 0 ? `${hours}h` : '1h';
      } else {
        expiresIn = shareExpiry ? `${shareExpiry}h` : undefined;
      }
      
      await api.createShareLink(selectedFile.id, expiresIn, sharePermission);
      Alert.alert('Başarılı', 'Paylaşım ayarları güncellendi');
      setEditModalVisible(false);
      loadSharedFiles();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Paylaşım güncellenemedi');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!selectedFile?.shareToken) return;
    
    try {
      // Şifreli dosya için DEK bilgisini ekle
      let shareUrl = `https://api.cloudyone.net/share/${selectedFile.shareToken}`;
      
      if (selectedFile.encryptionVersion) {
        // Bu dosya şifreli, yeni link oluşturup DEK ekleyelim
        const result = await api.createShareLink(selectedFile.id, { 
          expiresIn: 'unlimited',
          permission: selectedFile.sharePermission || 'DOWNLOAD'
        });
        
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
            
            const dekFragment = [
              bytesToBase64(plainDek),
              encInfo.cipherIv,
              encInfo.metaNameEnc || '',
              encInfo.metaNameIv || ''
            ].join('.');
            
            shareUrl = `${result.shareUrl}#dek=${encodeURIComponent(dekFragment)}`;
          }
        }
      }
      
      await Clipboard.setStringAsync(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Hata', 'Link kopyalanamadı');
    }
  };

  // Menu functions
  const openMenu = (file: SharedFile) => {
    setSelectedFile(file);
    setMenuVisible(true);
  };

  const closeMenu = () => {
    setMenuVisible(false);
  };

  const handleViewFile = (file: SharedFile) => {
    (navigation as any).navigate('FileViewer', { file });
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

  const handleShareNative = async () => {
    if (!selectedFile?.shareToken) return;
    closeMenu();
    
    try {
      const shareUrl = `https://api.cloudyone.net/share/${selectedFile.shareToken}`;
      await Share.share({
        message: `${selectedFile.filename}\n${shareUrl}`,
        title: selectedFile.filename,
      });
    } catch (error) {
      console.error('Paylaşım hatası:', error);
    }
  };

  const handleCopyLinkFromMenu = async () => {
    if (!selectedFile?.shareToken) return;
    closeMenu();
    
    const shareUrl = `https://api.cloudyone.net/share/${selectedFile.shareToken}`;
    try {
      await Clipboard.setStringAsync(shareUrl);
      Alert.alert('Başarılı', 'Link kopyalandı!');
    } catch {
      Alert.alert('Hata', 'Link kopyalanamadı');
    }
  };

  const handleRemoveShareFromMenu = () => {
    if (!selectedFile) return;
    const file = selectedFile;
    closeMenu();
    handleRemoveShare(file.id, file.filename);
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    const file = selectedFile;
    closeMenu();
    
    Alert.alert(
      'Dosyayı Sil',
      `"${file.filename}" silinsin mi? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFile(file.id);
              loadSharedFiles();
              Alert.alert('Başarılı', 'Dosya silindi.');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Dosya silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveShare = (fileId: string, filename: string) => {
    Alert.alert(
      'Paylaşımı Kaldır',
      `"${filename}" için paylaşım kaldırılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeShare(fileId);
              loadSharedFiles();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Paylaşım kaldırılamadı');
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

  // Türkçe ay isimleri
  const TURKISH_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  
  const formatDateTurkish = (date: Date, includeYear: boolean = false, includeTime: boolean = false): string => {
    const day = date.getDate();
    const month = TURKISH_MONTHS[date.getMonth()];
    const year = date.getFullYear();
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    if (includeYear && includeTime) {
      return `${day} ${month} ${year} ${time}`;
    } else if (includeYear) {
      return `${day} ${month} ${year}`;
    } else if (includeTime) {
      return `${day} ${month} ${time}`;
    }
    return `${day} ${month}`;
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Süresiz';
    const date = new Date(dateString);
    return formatDateTurkish(date, true, true);
  };

  const getTimeRemaining = (expiresAt: string | undefined): { text: string; color: string } => {
    if (!expiresAt) return { text: 'Süresiz', color: colors.textMuted };
    
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'Süresi doldu', color: colors.error };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return { text: `${days} gün kaldı`, color: colors.success };
    } else if (hours > 0) {
      return { text: `${hours} saat kaldı`, color: hours < 6 ? colors.warning : colors.success };
    } else {
      const minutes = Math.floor(diff / (1000 * 60));
      return { text: `${minutes} dk kaldı`, color: colors.warning };
    }
  };

  const renderFile = ({ item }: { item: SharedFile }) => {
    const timeRemaining = getTimeRemaining(item.shareExpiresAt);
    
    return (
    <View style={styles.fileCard}>
      {/* Üst Kısım - Dosya Bilgisi ve Butonlar */}
      <View style={styles.fileHeader}>
        <TouchableOpacity 
          style={[styles.fileIcon, { backgroundColor: `${colors.secondary}20` }]}
          onPress={() => handleViewFile(item)}
        >
          <Ionicons name={getFileIcon(item.mimeType || undefined)} size={24} color={colors.secondary} />
        </TouchableOpacity>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
          <Text style={styles.fileSize}>{formatFileSize(item.sizeBytes)} • {formatDateTurkish(new Date(item.createdAt))}</Text>
        </View>
      </View>
      
      {/* Orta Kısım - Paylaşım Detayları */}
      <View style={styles.shareDetails}>
        {/* Paylaşım Tarihi */}
        <View style={styles.shareDetailItem}>
          <Text style={styles.shareDetailLabel}>PAYLAŞIM</Text>
          <View style={styles.shareDetailValue}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.shareDetailText}>
              {formatDateTurkish(new Date(item.createdAt), false, true)}
            </Text>
          </View>
        </View>

        {/* Bitiş Tarihi */}
        <View style={styles.shareDetailItem}>
          <Text style={styles.shareDetailLabel}>BİTİŞ</Text>
          <View style={styles.shareDetailValue}>
            <Ionicons name="time-outline" size={12} color={timeRemaining.color} />
            <Text style={[styles.shareDetailText, { color: timeRemaining.color }]}>
              {timeRemaining.text}
            </Text>
          </View>
        </View>

        {/* İzin */}
        <View style={styles.shareDetailItem}>
          <Text style={styles.shareDetailLabel}>İZİN</Text>
          <View style={[
            styles.permissionBadge,
            { backgroundColor: item.sharePermission === 'DOWNLOAD' ? `${colors.success}15` : `${colors.info}15` }
          ]}>
            <Text style={[
              styles.permissionText,
              { color: item.sharePermission === 'DOWNLOAD' ? colors.success : colors.info }
            ]}>
              {item.sharePermission === 'DOWNLOAD' ? 'İndirilebilir' : 'Görüntülenebilir'}
            </Text>
          </View>
        </View>

        {/* Görüntülenme */}
        <View style={styles.shareDetailItem}>
          <Text style={styles.shareDetailLabel}>AÇILMA</Text>
          <View style={styles.shareDetailValue}>
            <Ionicons name="eye" size={12} color={colors.primary} />
            <Text style={[styles.shareDetailText, { color: colors.primary, fontWeight: '600' }]}>
              {item.shareOpenCount || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Alt Kısım - İşlem Butonları (Web benzeri) */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => {
            setSelectedFile(item);
            handleEditShare(item);
          }}
        >
          <Text style={styles.actionButtonText}>Düzenle</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={async () => {
            const shareUrl = `https://api.cloudyone.net/share/${item.shareToken}`;
            try {
              await Clipboard.setStringAsync(shareUrl);
              Alert.alert('Başarılı', 'Link kopyalandı!');
            } catch {
              Alert.alert('Hata', 'Link kopyalanamadı');
            }
          }}
        >
          <Text style={styles.actionButtonText}>Link Kopyala</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.actionButtonDanger]}
          onPress={() => handleRemoveShare(item.id, item.filename)}
        >
          <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>Kapat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator size="large" color={colors.primary} />
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Paylaşılanlar</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          renderItem={renderFile}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="share-social-outline" size={48} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>Paylaşılan dosya yok</Text>
              <Text style={styles.emptySubtext}>Dosyalarınızı paylaştığınızda burada görünecek</Text>
            </View>
          }
        />

        {/* Paylaşım Düzenleme Modal */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalIconContainer}>
                  <Ionicons name="share-social" size={24} color={colors.secondary} />
                </View>
                <View style={styles.modalTitleContainer}>
                  <Text style={styles.modalTitle}>Paylaşımı Düzenle</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {selectedFile?.filename}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Süre Girişi */}
              <View style={styles.inputGroup}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="time-outline" size={16} color={colors.secondary} />
                  <Text style={styles.inputLabel}>Geçerlilik Süresi</Text>
                </View>
                
                {/* Süre Tipi Seçici */}
                <View style={styles.expiryTypeSelector}>
                  <TouchableOpacity 
                    style={[styles.expiryTypeBtn, !useCustomExpiry && styles.expiryTypeBtnActive]}
                    onPress={() => setUseCustomExpiry(false)}
                  >
                    <Ionicons name="hourglass-outline" size={16} color={!useCustomExpiry ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.expiryTypeBtnText, !useCustomExpiry && styles.expiryTypeBtnTextActive]}>Saat Gir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.expiryTypeBtn, useCustomExpiry && styles.expiryTypeBtnActive]}
                    onPress={() => setUseCustomExpiry(true)}
                  >
                    <Ionicons name="calendar-outline" size={16} color={useCustomExpiry ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.expiryTypeBtnText, useCustomExpiry && styles.expiryTypeBtnTextActive]}>Tarih Seç</Text>
                  </TouchableOpacity>
                </View>
                
                {!useCustomExpiry ? (
                  <>
                    <TextInput
                      style={styles.textInput}
                      value={shareExpiry}
                      onChangeText={setShareExpiry}
                      placeholder="Süre girin (saat cinsinden)"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.inputHint}>Boş bırakırsanız süresiz olacak</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.dateTimeRow}>
                      <TouchableOpacity 
                        style={styles.dateTimeButton}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Ionicons name="calendar" size={18} color={colors.primary} />
                        <Text style={styles.dateTimeButtonText}>
                          {formatDateTurkish(customExpiryDate, true)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.dateTimeButton}
                        onPress={() => setShowTimePicker(true)}
                      >
                        <Ionicons name="time" size={18} color={colors.primary} />
                        <Text style={styles.dateTimeButtonText}>
                          {`${String(customExpiryDate.getHours()).padStart(2, '0')}:${String(customExpiryDate.getMinutes()).padStart(2, '0')}`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.inputHint}>
                      Paylaşım {formatDateTurkish(customExpiryDate, true)} {`${String(customExpiryDate.getHours()).padStart(2, '0')}:${String(customExpiryDate.getMinutes()).padStart(2, '0')}`} tarihinde sona erecek
                    </Text>
                    
                    {showDatePicker && (
                      <DateTimePicker
                        value={customExpiryDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={new Date()}
                        themeVariant="dark"
                        textColor="#ffffff"
                        onChange={(event, selectedDate) => {
                          setShowDatePicker(Platform.OS === 'ios');
                          if (selectedDate) {
                            const newDate = new Date(customExpiryDate);
                            newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                            setCustomExpiryDate(newDate);
                          }
                        }}
                      />
                    )}
                    {showTimePicker && (
                      <DateTimePicker
                        value={customExpiryDate}
                        mode="time"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        themeVariant="dark"
                        textColor="#ffffff"
                        onChange={(event, selectedTime) => {
                          setShowTimePicker(Platform.OS === 'ios');
                          if (selectedTime) {
                            const newDate = new Date(customExpiryDate);
                            newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                            setCustomExpiryDate(newDate);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              {/* İzin Seçimi */}
              <View style={styles.inputGroup}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.secondary} />
                  <Text style={styles.inputLabel}>İzin</Text>
                </View>
                <View style={styles.permissionOptions}>
                  <TouchableOpacity
                    style={[
                      styles.permissionOption,
                      sharePermission === 'VIEW' && styles.permissionOptionActive
                    ]}
                    onPress={() => setSharePermission('VIEW')}
                  >
                    <Ionicons 
                      name="eye" 
                      size={20} 
                      color={sharePermission === 'VIEW' ? colors.info : colors.textMuted} 
                    />
                    <Text style={[
                      styles.permissionOptionText,
                      sharePermission === 'VIEW' && styles.permissionOptionTextActive
                    ]}>
                      Görüntüleme
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.permissionOption,
                      sharePermission === 'DOWNLOAD' && styles.permissionOptionActive
                    ]}
                    onPress={() => setSharePermission('DOWNLOAD')}
                  >
                    <Ionicons 
                      name="download" 
                      size={20} 
                      color={sharePermission === 'DOWNLOAD' ? colors.success : colors.textMuted} 
                    />
                    <Text style={[
                      styles.permissionOptionText,
                      sharePermission === 'DOWNLOAD' && styles.permissionOptionTextActive
                    ]}>
                      İndirme
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Mevcut Paylaşım Bilgisi */}
              {selectedFile?.shareToken && (
                <View style={styles.shareInfoBox}>
                  <View style={styles.shareInfoRow}>
                    <Text style={styles.shareInfoLabel}>Link:</Text>
                    <TouchableOpacity onPress={handleCopyLink} style={styles.copyLinkButton}>
                      <Text style={styles.copyLinkText} numberOfLines={1}>
                        {copied ? '✓ Kopyalandı!' : 'Link Kopyala'}
                      </Text>
                      <Ionicons 
                        name={copied ? 'checkmark-circle' : 'copy-outline'} 
                        size={16} 
                        color={copied ? colors.success : colors.primary} 
                      />
                    </TouchableOpacity>
                  </View>
                  {selectedFile.shareExpiresAt && (
                    <View style={styles.shareInfoRow}>
                      <Text style={styles.shareInfoLabel}>Geçerlilik:</Text>
                      <Text style={styles.shareInfoValue}>{formatDate(selectedFile.shareExpiresAt)}</Text>
                    </View>
                  )}
                  {selectedFile.shareOpenCount !== undefined && (
                    <View style={styles.shareInfoRow}>
                      <Text style={styles.shareInfoLabel}>Görüntülenme:</Text>
                      <Text style={styles.shareInfoValue}>{selectedFile.shareOpenCount} kez</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Paylaşımı Durdur Butonu */}
              <TouchableOpacity
                style={styles.stopShareButton}
                onPress={() => {
                  setEditModalVisible(false);
                  if (selectedFile) {
                    handleRemoveShare(selectedFile.id, selectedFile.filename);
                  }
                }}
              >
                <Ionicons name="close-circle" size={18} color={colors.error} />
                <Text style={styles.stopShareButtonText}>Paylaşımı Durdur</Text>
              </TouchableOpacity>

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.updateButton, isUpdating && styles.updateButtonDisabled]}
                  onPress={handleUpdateShare}
                  disabled={isUpdating}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.updateButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.updateButtonText}>Güncelle</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Options Menu Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={closeMenu}
        >
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1} 
            onPress={closeMenu}
          >
            <View style={styles.menuContainer}>
              <View style={styles.menuHeader}>
                <View style={[styles.menuFileIcon, { backgroundColor: `${colors.secondary}20` }]}>
                  <Ionicons 
                    name={getFileIcon(selectedFile?.mimeType || undefined)} 
                    size={20} 
                    color={colors.secondary} 
                  />
                </View>
                <Text style={styles.menuFileName} numberOfLines={1}>
                  {selectedFile?.filename}
                </Text>
              </View>
              
              <View style={styles.menuDivider} />
              
              <TouchableOpacity style={styles.menuItem} onPress={handleView}>
                <Ionicons name="eye-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Görüntüle</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={handleDownload}>
                <Ionicons name="download-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>İndir</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={handleCopyLinkFromMenu}>
                <Ionicons name="link-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Linki Kopyala</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={handleShareNative}>
                <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Paylaş</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); handleEditShare(selectedFile!); }}>
                <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Paylaşım Ayarları</Text>
              </TouchableOpacity>
              
              <View style={styles.menuDivider} />
              
              <TouchableOpacity style={styles.menuItem} onPress={handleRemoveShareFromMenu}>
                <Ionicons name="close-circle-outline" size={22} color={colors.warning} />
                <Text style={[styles.menuItemText, { color: colors.warning }]}>Paylaşımı Kaldır</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  fileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  fileName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileSize: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  // Paylaşım Detayları
  shareDetails: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: 'space-between',
  },
  shareDetailItem: {
    alignItems: 'center',
    flex: 1,
  },
  shareDetailLabel: {
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  shareDetailValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shareDetailText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  permissionText: {
    fontSize: 10,
    fontWeight: '500',
  },
  viewCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  // Web benzeri işlem butonları
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  actionButtonDanger: {
    backgroundColor: `${colors.error}15`,
    borderColor: `${colors.error}30`,
  },
  actionButtonTextDanger: {
    color: colors.error,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editButton: {
    padding: spacing.xs,
    backgroundColor: `${colors.primary}15`,
    borderRadius: borderRadius.sm,
  },
  removeButton: {
    padding: spacing.xs,
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.secondary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  modalTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  inputHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Süre Tipi Seçici
  expiryTypeSelector: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  expiryTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  expiryTypeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  expiryTypeBtnText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  expiryTypeBtnTextActive: {
    color: '#fff',
  },
  // Tarih/Saat Seçici
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  dateTimeButtonText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  permissionOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  permissionOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
  },
  permissionOptionActive: {
    borderColor: colors.secondary,
    backgroundColor: `${colors.secondary}15`,
  },
  permissionOptionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  permissionOptionTextActive: {
    color: colors.textPrimary,
  },
  shareInfoBox: {
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  shareInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  shareInfoLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  shareInfoValue: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    fontWeight: '500',
  },
  copyLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  copyLinkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  stopShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: `${colors.error}10`,
    borderWidth: 1,
    borderColor: `${colors.error}30`,
    borderRadius: borderRadius.md,
  },
  stopShareButtonText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: '600',
  },
  updateButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  updateButtonText: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  // Menu styles
  menuButton: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  menuOverlay: {
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
  },
  menuFileName: {
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

export default SharedFilesScreen;
