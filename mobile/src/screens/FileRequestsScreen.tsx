import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
  Share,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { colors } from '../constants/theme';
import { API_BASE_URL } from '../constants/config';

interface UploadedFile {
  id: string;
  fileId: string | null;
  filename: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploaderName: string;
  uploaderEmail: string | null;
  uploadedAt: string;
  savedToFiles: boolean;
  savedAt: string | null;
}

interface FileRequest {
  id: string;
  title: string;
  description?: string;
  token: string;
  isActive: boolean;
  expiresAt?: string;
  maxFileSize?: number;
  allowedTypes?: string;
  uploadCount: number;
  pendingFiles?: number;
  savedFiles?: number;
  lastUploadAt?: string;
  createdAt: string;
  folderId?: string;
  Folder?: { id: string; name: string };
  uploadedFiles?: UploadedFile[];
}

const FileRequestsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [requests, setRequests] = useState<FileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filesModalVisible, setFilesModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<FileRequest | null>(null);
  const [savingUploadId, setSavingUploadId] = useState<string | null>(null);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxFileSize, setMaxFileSize] = useState('');
  const [allowedTypes, setAllowedTypes] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');

  // Web URL for share links
  const WEB_URL = 'http://localhost:3000';

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [])
  );

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await api.getFileRequests();
      setRequests(data.requests || []);
    } catch (error: any) {
      console.error('İstekler yüklenemedi:', error);
      Alert.alert('Hata', error.message || 'Dosya istekleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Hata', 'Lütfen bir başlık girin');
      return;
    }

    try {
      setCreating(true);
      
      const expiresAt = expiresInDays 
        ? new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      await api.createFileRequest({
        title: title.trim(),
        description: description.trim() || undefined,
        maxFileSize: maxFileSize ? parseInt(maxFileSize) * 1024 * 1024 : undefined,
        allowedTypes: allowedTypes.trim() || undefined,
        expiresAt,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setMaxFileSize('');
      setAllowedTypes('');
      setExpiresInDays('7');
      setCreateModalVisible(false);
      
      Alert.alert('Başarılı', 'Dosya isteği oluşturuldu');
      loadRequests();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İstek oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (item: FileRequest) => {
    try {
      await api.toggleFileRequest(item.id);
      setRequests(prev =>
        prev.map(r => r.id === item.id ? { ...r, isActive: !r.isActive } : r)
      );
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Durum değiştirilemedi');
    }
  };

  const handleDelete = (item: FileRequest) => {
    Alert.alert(
      'İsteği Sil',
      `"${item.title}" isteğini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFileRequest(item.id);
              setRequests(prev => prev.filter(r => r.id !== item.id));
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Silinemedi');
            }
          },
        },
      ]
    );
  };

  const handleCopyLink = (item: FileRequest) => {
    const link = `${WEB_URL}/upload/${item.token}`;
    Clipboard.setString(link);
    Alert.alert('Kopyalandı', 'Link panoya kopyalandı');
  };

  const handleShare = async (item: FileRequest) => {
    try {
      const link = `${WEB_URL}/upload/${item.token}`;
      await Share.share({
        message: `"${item.title}" için dosya yükleme linki: ${link}`,
        url: link,
      });
    } catch (error) {
      console.error('Paylaşım hatası:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '-';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  // Bekleyen dosyayı kullanıcının dosyalarına kaydet
  const handleSaveUpload = async (uploadId: string, filename: string) => {
    try {
      setSavingUploadId(uploadId);
      await api.saveUploadedFileToFiles(uploadId);
      Alert.alert('Başarılı', `"${filename}" dosyalarınıza kaydedildi`);
      loadRequests(); // Listeyi yenile
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya kaydedilemedi');
    } finally {
      setSavingUploadId(null);
    }
  };

  // Bekleyen dosyayı sil
  const handleDeleteUpload = (uploadId: string, filename: string) => {
    Alert.alert(
      'Dosyayı Sil',
      `"${filename}" dosyasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingUploadId(uploadId);
              await api.deleteUploadedFile(uploadId);
              Alert.alert('Başarılı', 'Dosya silindi');
              loadRequests(); // Listeyi yenile
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Dosya silinemedi');
            } finally {
              setDeletingUploadId(null);
            }
          },
        },
      ]
    );
  };

  // Tüm bekleyen dosyaları kaydet
  const handleSaveAllPending = async (request: FileRequest) => {
    const pendingFiles = request.uploadedFiles?.filter(f => !f.savedToFiles) || [];
    if (pendingFiles.length === 0) {
      Alert.alert('Bilgi', 'Kaydedilecek bekleyen dosya yok');
      return;
    }

    Alert.alert(
      'Tümünü Kaydet',
      `${pendingFiles.length} dosyayı dosyalarınıza kaydetmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaydet',
          onPress: async () => {
            try {
              setSavingUploadId('all');
              let successCount = 0;
              let errorCount = 0;
              
              for (const file of pendingFiles) {
                try {
                  await api.saveUploadedFileToFiles(file.id);
                  successCount++;
                } catch {
                  errorCount++;
                }
              }
              
              if (errorCount > 0) {
                Alert.alert('Sonuç', `${successCount} dosya kaydedildi, ${errorCount} dosya kaydedilemedi`);
              } else {
                Alert.alert('Başarılı', `${successCount} dosya kaydedildi`);
              }
              loadRequests();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Dosyalar kaydedilemedi');
            } finally {
              setSavingUploadId(null);
            }
          },
        },
      ]
    );
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const renderItem = ({ item }: { item: FileRequest }) => {
    const expired = isExpired(item.expiresAt);

    return (
      <View style={[styles.card, !item.isActive && styles.cardInactive]}>
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <View style={[styles.statusBadge, item.isActive && !expired ? styles.statusActive : styles.statusInactive]}>
              <Text style={styles.statusText}>
                {expired ? 'Süresi Doldu' : item.isActive ? 'Aktif' : 'Pasif'}
              </Text>
            </View>
          </View>
          {item.description && (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.infoItem}>
            <Ionicons name="cloud-upload-outline" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>{item.uploadCount} yükleme</Text>
            {(item.pendingFiles ?? 0) > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{item.pendingFiles} bekliyor</Text>
              </View>
            )}
            {(item.savedFiles ?? 0) > 0 && (
              <View style={styles.savedBadge}>
                <Text style={styles.savedBadgeText}>{item.savedFiles} kaydedildi</Text>
              </View>
            )}
          </View>
          {item.expiresAt && (
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={16} color={expired ? colors.error : colors.textMuted} />
              <Text style={[styles.infoText, expired && styles.expiredText]}>
                {formatDate(item.expiresAt)}
              </Text>
            </View>
          )}
          {item.maxFileSize && (
            <View style={styles.infoItem}>
              <Ionicons name="resize-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>Max {formatBytes(item.maxFileSize)}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          {item.uploadCount > 0 && (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.filesActionBtn]} 
              onPress={() => {
                setSelectedRequest(item);
                setFilesModalVisible(true);
              }}
            >
              <Ionicons name="folder-open-outline" size={20} color={colors.success} />
              <Text style={styles.filesCount}>{item.uploadCount}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleCopyLink(item)}>
            <Ionicons name="copy-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
            <Ionicons name="share-outline" size={20} color={colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggle(item)}>
            <Ionicons
              name={item.isActive ? 'pause-outline' : 'play-outline'}
              size={20}
              color={item.isActive ? colors.warning : colors.success}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
          <Text style={styles.headerTitle}>Dosya İstekleri</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setCreateModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.infoText2}>
            Dosya istekleri ile başkalarından dosya toplayabilirsiniz. Link paylaşın, dosyalar otomatik hesabınıza yüklensin.
          </Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Yükleniyor...</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="cloud-upload-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Henüz dosya isteği yok</Text>
            <Text style={styles.emptyText}>
              Yeni bir istek oluşturarak başkalarından dosya toplayabilirsiniz
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => setCreateModalVisible(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.createBtnText}>Yeni İstek Oluştur</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={requests}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
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

        {/* Create Modal */}
        <Modal
          visible={createModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Yeni Dosya İsteği</Text>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Başlık *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Örn: Proje Dosyaları"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Açıklama</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Ne tür dosyalar istediğinizi açıklayın..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Max Boyut (MB)</Text>
                  <TextInput
                    style={styles.input}
                    value={maxFileSize}
                    onChangeText={setMaxFileSize}
                    placeholder="100"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>Geçerlilik (gün)</Text>
                  <TextInput
                    style={styles.input}
                    value={expiresInDays}
                    onChangeText={setExpiresInDays}
                    placeholder="7"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>İzin Verilen Türler</Text>
                <TextInput
                  style={styles.input}
                  value={allowedTypes}
                  onChangeText={setAllowedTypes}
                  placeholder="pdf, doc, jpg (boş = hepsi)"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color="#fff" />
                    <Text style={styles.submitBtnText}>Oluştur</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Dosyalar Modal */}
        <Modal
          visible={filesModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFilesModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '70%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Yüklenen Dosyalar</Text>
                  {selectedRequest && (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {selectedRequest.pendingFiles ?? 0} bekliyor • {selectedRequest.savedFiles ?? 0} kaydedildi
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setFilesModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Tümünü Kaydet Butonu */}
              {selectedRequest && (selectedRequest.pendingFiles ?? 0) > 0 && (
                <TouchableOpacity
                  style={[styles.saveAllBtn, savingUploadId === 'all' && styles.submitBtnDisabled]}
                  onPress={() => handleSaveAllPending(selectedRequest)}
                  disabled={savingUploadId === 'all'}
                >
                  {savingUploadId === 'all' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                      <Text style={styles.saveAllBtnText}>Tüm Bekleyenleri Kaydet ({selectedRequest.pendingFiles})</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {selectedRequest?.uploadedFiles && selectedRequest.uploadedFiles.length > 0 ? (
                <FlatList
                  data={selectedRequest.uploadedFiles}
                  keyExtractor={(item, index) => `${item.id}-${index}`}
                  renderItem={({ item: file }) => (
                    <View style={[styles.fileListItem, { backgroundColor: file.savedToFiles ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)' }]}>
                      <View style={styles.fileIconContainer}>
                        <Ionicons 
                          name="document-outline" 
                          size={24} 
                          color={file.savedToFiles ? colors.success : colors.warning} 
                        />
                      </View>
                      <View style={styles.fileInfoContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.fileListName} numberOfLines={1}>
                            {file.filename}
                          </Text>
                          <View style={[styles.fileSavedBadge, { backgroundColor: file.savedToFiles ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)' }]}>
                            <Text style={[styles.fileSavedBadgeText, { color: file.savedToFiles ? colors.success : colors.warning }]}>
                              {file.savedToFiles ? '✓ Kaydedildi' : '⏳ Bekliyor'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.fileMetaRow}>
                          <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.fileMetaText}>{file.uploaderName}</Text>
                          {file.sizeBytes && (
                            <>
                              <Text style={[styles.fileMetaText, { marginHorizontal: 4 }]}>•</Text>
                              <Text style={styles.fileMetaText}>{formatBytes(file.sizeBytes)}</Text>
                            </>
                          )}
                        </View>
                        <View style={styles.fileMetaRow}>
                          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                          <Text style={styles.fileMetaText}>
                            {new Date(file.uploadedAt).toLocaleDateString('tr-TR', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                        </View>
                        
                        {/* Kaydet ve Sil Butonları - Sadece bekleyen dosyalar için */}
                        {!file.savedToFiles && (
                          <View style={styles.fileActionButtons}>
                            <TouchableOpacity
                              style={[styles.fileActionBtn, styles.saveBtn]}
                              onPress={() => handleSaveUpload(file.id, file.filename)}
                              disabled={savingUploadId === file.id}
                            >
                              {savingUploadId === file.id ? (
                                <ActivityIndicator size="small" color={colors.success} />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-outline" size={16} color={colors.success} />
                                  <Text style={[styles.fileActionBtnText, { color: colors.success }]}>Kaydet</Text>
                                </>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.fileActionBtn, styles.deleteBtn]}
                              onPress={() => handleDeleteUpload(file.id, file.filename)}
                              disabled={deletingUploadId === file.id}
                            >
                              {deletingUploadId === file.id ? (
                                <ActivityIndicator size="small" color={colors.error} />
                              ) : (
                                <>
                                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                                  <Text style={[styles.fileActionBtnText, { color: colors.error }]}>Sil</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                  style={{ maxHeight: 350 }}
                />
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 12 }}>Henüz dosya yüklenmemiş</Text>
                </View>
              )}

              {/* Kaydedilen dosyalar varsa klasöre git butonu */}
              {(selectedRequest?.savedFiles ?? 0) > 0 && (
                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: 16 }]}
                  onPress={() => {
                    setFilesModalVisible(false);
                    (navigation as any).navigate('Main', { 
                      screen: 'Files',
                      params: { 
                        folderId: selectedRequest?.folderId || null, 
                        folderName: selectedRequest?.Folder?.name || 'Dosyalarım' 
                      }
                    });
                  }}
                >
                  <Ionicons name="folder-open-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {selectedRequest?.Folder?.name ? `"${selectedRequest.Folder.name}" Klasörüne Git` : 'Ana Klasöre Git'}
                  </Text>
                </TouchableOpacity>
              )}
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText2: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 14,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  statusInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  cardDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  cardInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  expiredText: {
    color: colors.error,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filesActionBtn: {
    width: 'auto' as any,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 4,
  },
  filesCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fileListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    marginBottom: 8,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfoContainer: {
    flex: 1,
    gap: 4,
  },
  fileListName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  fileMetaText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  deletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  deletedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  // Bekleyen ve kaydedilen badge'leri
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warning,
  },
  savedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  savedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.success,
  },
  // Dosya kaydedildi badge'i
  fileSavedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fileSavedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Kaydet ve Sil butonları
  fileActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  fileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  fileActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Tümünü Kaydet butonu
  saveAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  saveAllBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default FileRequestsScreen;
