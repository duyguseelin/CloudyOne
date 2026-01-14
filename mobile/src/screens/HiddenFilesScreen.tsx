import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { api, getToken, API_BASE } from '../services/api';
import { FileItem, FolderItem } from '../types';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { encryptAndUploadFileV3, getMasterKey, hasMasterKey } from '../crypto';

const HiddenFilesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [hasPinSet, setHasPinSet] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  
  // Klasör navigasyonu
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [folderStack, setFolderStack] = useState<FolderItem[]>([]);
  
  // Master key durumu
  const [hasEncryptionKey, setHasEncryptionKey] = useState(hasMasterKey());
  const prevHasKeyRef = useRef(hasEncryptionKey);
  
  // Yeni klasör modal
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  
  // Dosya yükleme
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  
  // Add menu
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  // İşlem menüsü
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [selectedItem, setSelectedItem] = useState<(FileItem | FolderItem) & { type: 'file' | 'folder' } | null>(null);
  
  // Yeniden adlandırma
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkPinStatus();
    }, [])
  );

  // PIN doğrulandıktan sonra ve master key hazırsa dosyaları yükle
  useEffect(() => {
    if (pinVerified && hasEncryptionKey) {
      loadHiddenFiles();
    } else if (pinVerified && !hasEncryptionKey) {
      console.log('⏳ [HiddenFiles] Master key bekleniyor...');
      setLoading(true);
    }
  }, [pinVerified, hasEncryptionKey, currentFolder]);
  
  // Master key kontrol interval
  useEffect(() => {
    const interval = setInterval(() => {
      const hasKey = hasMasterKey();
      setHasEncryptionKey(hasKey);
    }, hasEncryptionKey ? 5000 : 500);
    return () => clearInterval(interval);
  }, [hasEncryptionKey]);
  
  // Master key hazır olduğunda dosyaları yükle (PIN zaten doğrulanmış olmalı)
  useEffect(() => {
    if (hasEncryptionKey && !prevHasKeyRef.current && pinVerified) {
      console.log('🔑 [HiddenFiles] Master key hazır - dosyalar yükleniyor');
      loadHiddenFiles();
    }
    prevHasKeyRef.current = hasEncryptionKey;
  }, [hasEncryptionKey, pinVerified]);
  
  // Dosya yükleme fonksiyonu
  const handleUploadFile = async () => {
    if (uploading) {
      console.log('⏳ [HiddenFiles] Zaten yükleme devam ediyor');
      return;
    }
    
    console.log('📝 [HiddenFiles] handleUploadFile başladı');
    
    try {
      console.log('🔍 [HiddenFiles] DocumentPicker açılıyor...');
      
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: false,
        copyToCacheDirectory: true,
      });
      
      console.log('📄 [HiddenFiles] DocumentPicker tamamlandı');
      console.log('📄 [HiddenFiles] Result:', { canceled: result.canceled, hasAssets: !!result.assets, assetsLength: result.assets?.length });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('📁 [HiddenFiles] Dosya seçildi:', file.name);
        console.log('📂 [HiddenFiles] Hedef klasör:', currentFolder?.id, currentFolder?.name);
        
        setUploading(true);
      
        const token = await getToken();
        if (!token) {
          Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
          setUploading(false);
          return;
        }
        
        console.log('🔑 [HiddenFiles] Token alındı');
        
        if (!hasMasterKey()) {
          Alert.alert('Hata', 'Şifreleme anahtarı bulunamadı. Lütfen tekrar giriş yapın.');
          setUploading(false);
          return;
        }
        
        const masterKey = getMasterKey();
        console.log('🔐 [HiddenFiles] Master key alındı, gizli yükleme başlıyor...');
        
        const response = await encryptAndUploadFileV3(
          file.uri,
          file.name,
          file.mimeType || 'application/octet-stream',
          masterKey,
          token,
          API_BASE,
          currentFolder?.id,
          true
        );
        
        console.log('✅ [HiddenFiles] Dosya başarıyla yüklendi');
        await loadHiddenFiles();
        
        if (response.isNewVersion) {
          Alert.alert(
            'Yeni Sürüm',
            response.message || `"${file.name}" yeni sürüm olarak kaydedildi`,
            [{ text: 'Tamam' }]
          );
        } else {
          Alert.alert('Başarılı', 'Dosya şifreli ve gizli olarak yüklendi 🔐');
        }
        setUploading(false);
      } else {
        console.log('❌ [HiddenFiles] Dosya seçimi iptal edildi veya boş');
      }
    } catch (error: any) {
      console.error('❌ [HiddenFiles] Yükleme hatası:', error);
      Alert.alert('Hata', error.message || 'Dosya yüklenemedi');
      setUploading(false);
    }
  };

  const checkPinStatus = async () => {
    try {
      const response = await api.hasHiddenFilesPin();
      setHasPinSet(response.hasPinSet);
      if (response.hasPinSet) {
        setShowPinModal(true);
      } else {
        setShowSetPinModal(true);
      }
    } catch (error) {
      console.error('PIN durumu kontrol edilemedi:', error);
      setShowSetPinModal(true);
    } finally {
      setLoading(false);
    }
  };

  const loadHiddenFiles = async (folderId?: string) => {
    try {
      setLoading(true);
      const targetFolderId = folderId !== undefined ? folderId : currentFolder?.id;
      const response = await api.getHiddenFiles(targetFolderId);
      const rawFiles = (response as any)?.files || response || [];
      
      // Şifrelenmiş dosya adlarını çöz
      const decryptedFiles = await Promise.all(
        rawFiles.map(async (file: FileItem) => {
          if (file.isEncrypted && (file as any).metaNameEnc && (file as any).metaNameIv) {
            if (!hasMasterKey()) {
              console.log('⏳ [HiddenFiles] Master key henüz hazır değil:', file.id);
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
      setFolders((response as any)?.folders || []);
    } catch (error) {
      console.error('Gizli dosyalar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Klasöre gir
  const navigateToFolder = (folder: FolderItem) => {
    if (currentFolder) {
      setFolderStack([...folderStack, currentFolder]);
    }
    setCurrentFolder(folder);
    loadHiddenFiles(folder.id);
  };
  
  // Geri git
  const goBack = () => {
    if (folderStack.length > 0) {
      const previousFolder = folderStack[folderStack.length - 1];
      setFolderStack(folderStack.slice(0, -1));
      setCurrentFolder(previousFolder);
      loadHiddenFiles(previousFolder.id);
    } else if (currentFolder) {
      setCurrentFolder(null);
      loadHiddenFiles(undefined);
    } else {
      navigation.goBack();
    }
  };
  
  // Gizli klasör oluştur
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Hata', 'Klasör adı boş olamaz');
      return;
    }
    
    setCreatingFolder(true);
    try {
      await api.createFolder(newFolderName.trim(), currentFolder?.id, true); // parentId ve isHidden: true
      setNewFolderName('');
      setShowCreateFolder(false);
      loadHiddenFiles();
      Alert.alert('Başarılı', 'Gizli klasör oluşturuldu');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Klasör oluşturulamadı');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSetPin = async () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      Alert.alert('Hata', 'PIN 4 haneli sayı olmalıdır');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Hata', 'PIN\'ler eşleşmiyor');
      return;
    }

    setSettingPin(true);
    try {
      await api.setHiddenFilesPin(pin);
      setHasPinSet(true);
      setPinVerified(true);
      setShowSetPinModal(false);
      setPin('');
      setConfirmPin('');
      Alert.alert('Başarılı', 'Gizli dosyalar için PIN oluşturuldu');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'PIN ayarlanamadı');
    } finally {
      setSettingPin(false);
    }
  };

  const handlePinSubmit = async () => {
    if (pin.length !== 4) {
      Alert.alert('Hata', 'PIN 4 haneli olmalıdır');
      return;
    }

    try {
      const response = await api.verifyHiddenFilesPin(pin);
      if (response.valid) {
        setPinVerified(true);
        setShowPinModal(false);
        setPin('');
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'PIN yanlış');
      setPin('');
    }
  };

  // İşlem menüsünü aç
  const openActionMenu = (item: FileItem | FolderItem, type: 'file' | 'folder') => {
    setSelectedItem({ ...item, type } as any);
    setShowActionMenu(true);
  };

  // Dosyayı görüntüle
  const handleViewFile = () => {
    if (!selectedItem || selectedItem.type !== 'file') return;
    setShowActionMenu(false);
    (navigation as any).navigate('FileViewer', { file: selectedItem });
  };
  
  // Dosya detay sayfasını aç
  const handleFilePress = (file: FileItem) => {
    let folderName = 'Gizli';
    
    if (file.folderId) {
      const folder = folders.find(f => f.id === file.folderId);
      if (folder) {
        folderName = folder.name;
      } else if (currentFolder && currentFolder.id === file.folderId) {
        folderName = currentFolder.name;
      }
    } else if (currentFolder) {
      folderName = currentFolder.name;
    }
    
    navigation.navigate('FileDetails' as never, { 
      file,
      folderName
    } as never);
  };

  // Yeniden adlandır
  const handleRename = () => {
    if (!selectedItem) return;
    setShowActionMenu(false);
    
    if (selectedItem.type === 'file') {
      const fileItem = selectedItem as FileItem;
      const filename = fileItem.originalName || fileItem.filename || '';
      // Extension'ı çıkar
      const nameWithoutExt = filename.includes('.') 
        ? filename.substring(0, filename.lastIndexOf('.'))
        : filename;
      setNewName(nameWithoutExt);
    } else {
      setNewName((selectedItem as FolderItem).name);
    }
    setShowRenameModal(true);
  };

  const submitRename = async () => {
    if (!selectedItem || !newName.trim()) return;
    
    setRenaming(true);
    try {
      if (selectedItem.type === 'file') {
        // Dosya için: Extension'ı koru
        const fileItem = selectedItem as FileItem;
        const currentName = fileItem.originalName || fileItem.filename || '';
        const hasExt = currentName.includes('.');
        const ext = hasExt ? currentName.substring(currentName.lastIndexOf('.')) : '';
        const newFileName = newName.trim().includes('.') ? newName.trim() : newName.trim() + ext;
        await api.renameFile(selectedItem.id, newFileName);
      } else {
        await api.renameFolder(selectedItem.id, newName.trim());
      }
      setShowRenameModal(false);
      setNewName('');
      setSelectedItem(null);
      loadHiddenFiles();
      Alert.alert('Başarılı', 'İsim güncellendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'İsim güncellenemedi');
    } finally {
      setRenaming(false);
    }
  };

  // Gizlilikten çıkar
  const handleUnhide = () => {
    if (!selectedItem) return;
    const itemName = selectedItem.type === 'file' ? (selectedItem as FileItem).filename : (selectedItem as FolderItem).name;
    
    Alert.alert(
      'Gizliliği Kaldır',
      `"${itemName}" için gizlilik kaldırılsın mı? Dosyalarım sayfasında görünür olacak.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          onPress: async () => {
            try {
              setShowActionMenu(false);
              if (selectedItem.type === 'file') {
                await api.toggleHidden(selectedItem.id);
              } else {
                await api.toggleFolderHidden(selectedItem.id);
              }
              loadHiddenFiles();
              Alert.alert('Başarılı', 'Gizlilik kaldırıldı');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  // Sil
  const handleDelete = () => {
    if (!selectedItem) return;
    const itemName = selectedItem.type === 'file' ? (selectedItem as FileItem).filename : (selectedItem as FolderItem).name;
    
    Alert.alert(
      'Sil',
      `"${itemName}" silinsin mi? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowActionMenu(false);
              if (selectedItem.type === 'file') {
                await api.deleteFile(selectedItem.id);
              } else {
                await api.deleteFolder(selectedItem.id);
              }
              loadHiddenFiles();
              Alert.alert('Başarılı', 'Silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Silinemedi');
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
  
  // Klasör render
  const renderFolder = ({ item }: { item: FolderItem }) => (
    <TouchableOpacity 
      style={styles.fileCard}
      onPress={() => navigateToFolder(item)}
      onLongPress={() => openActionMenu(item, 'folder')}
    >
      <View style={styles.fileContent}>
        <View style={[styles.fileIcon, { backgroundColor: `${colors.primary}20` }]}>
          <Ionicons name="folder" size={24} color={colors.primary} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileSize}>Klasör</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => openActionMenu(item, 'folder')}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderFile = ({ item }: { item: FileItem }) => (
    <TouchableOpacity 
      style={styles.fileCard}
      onPress={() => handleFilePress(item)}
      onLongPress={() => openActionMenu(item, 'file')}
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
        onPress={() => openActionMenu(item, 'file')}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
  
  // Kategorize edilmiş data (FilesScreen gibi)
  const sections = [
    {
      title: 'Klasörlerim',
      data: folders,
      type: 'folder' as const,
    },
    {
      title: 'Dosyalarım',
      data: files,
      type: 'file' as const,
    },
  ].filter(section => section.data.length > 0);
  
  // Breadcrumb
  const getBreadcrumb = () => {
    let path = 'Gizli';
    if (currentFolder) {
      path += ' / ' + currentFolder.name;
    }
    return path;
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
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{getBreadcrumb()}</Text>
            {currentFolder && (
              <Text style={styles.headerSubtitle}>Klasör içi</Text>
            )}
          </View>
          {pinVerified ? (
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowAddMenu(true)}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={16} color={colors.warning} />
            </View>
          )}
        </View>

        {pinVerified ? (
          loading || uploading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              {uploading && <Text style={styles.uploadingText}>Yükleniyor...</Text>}
            </View>
          ) : (
            <FlatList
              data={sections}
              keyExtractor={(section) => section.title}
              renderItem={({ item: section }) => (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionCount}>{section.data.length}</Text>
                  </View>
                  {section.type === 'folder'
                    ? section.data.map((folder) => (
                        <View key={folder.id}>{renderFolder({ item: folder })}</View>
                      ))
                    : section.data.map((file) => (
                        <View key={file.id}>{renderFile({ item: file })}</View>
                      ))}
                </View>
              )}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="eye-off-outline" size={48} color={colors.textMuted} />
                  </View>
                  <Text style={styles.emptyText}>
                    {currentFolder ? 'Klasör boş' : 'Gizli dosya yok'}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    + butonuna tıklayarak gizli dosya veya klasör ekleyin
                  </Text>
                </View>
              }
            />
          )
        ) : (
          <View style={styles.lockedContainer}>
            <View style={styles.lockIconContainer}>
              <Ionicons name="lock-closed" size={64} color={colors.warning} />
            </View>
            <Text style={styles.lockedText}>PIN Gerekli</Text>
            <Text style={styles.lockedSubtext}>
              Gizli dosyalarınıza erişmek için PIN girin
            </Text>
          </View>
        )}

        {/* PIN Modal */}
        <Modal visible={showPinModal && !pinVerified} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="lock-closed" size={40} color={colors.warning} />
              </View>
              <Text style={styles.modalTitle}>PIN Girin</Text>
              <Text style={styles.modalSubtitle}>
                Gizli dosyalarınıza erişmek için PIN kodunuzu girin
              </Text>
              
              <View style={styles.pinInputWrapper}>
                <TextInput
                  style={styles.pinInput}
                  placeholder="••••"
                  placeholderTextColor={colors.textMuted}
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                  textAlign="center"
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handlePinSubmit}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Doğrula</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* PIN Oluşturma Modal */}
        <Modal visible={showSetPinModal && !pinVerified} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={[styles.modalIconContainer, { backgroundColor: `${colors.success}20` }]}>
                <Ionicons name="shield-checkmark" size={40} color={colors.success} />
              </View>
              <Text style={styles.modalTitle}>PIN Oluşturun</Text>
              <Text style={styles.modalSubtitle}>
                Gizli dosyalarınızı korumak için 4 haneli bir PIN oluşturun
              </Text>
              
              <View style={styles.pinInputWrapper}>
                <Text style={styles.pinLabel}>PIN (4 haneli)</Text>
                <TextInput
                  style={styles.pinInput}
                  placeholder="••••"
                  placeholderTextColor={colors.textMuted}
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                  textAlign="center"
                />
              </View>

              <View style={styles.pinInputWrapper}>
                <Text style={styles.pinLabel}>PIN Tekrar</Text>
                <TextInput
                  style={styles.pinInput}
                  placeholder="••••"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                  textAlign="center"
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleSetPin}
                  disabled={settingPin}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    {settingPin ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Oluştur</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Ekleme Menü Modal */}
        <Modal 
          visible={showAddMenu} 
          transparent 
          animationType="fade"
          onRequestClose={() => setShowAddMenu(false)}
        >
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1} 
            onPress={() => setShowAddMenu(false)}
          >
            <View style={styles.menuContainer}>
              <Text style={styles.menuTitle}>Gizli Ekle</Text>
              
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  setShowAddMenu(false);
                  // Modal kapatıldıktan sonra 1000ms bekle ve dosya seçiciyi aç
                  setTimeout(() => {
                    handleUploadFile();
                  }, 1000);
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.warning}20` }]}>
                  <Ionicons name="document" size={24} color={colors.warning} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Dosya Yükle</Text>
                  <Text style={styles.menuItemSubtitle}>Cihazdan gizli dosya yükle</Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  setShowAddMenu(false);
                  // Modal kapatıldıktan sonra 500ms bekle ve klasör oluştur modalını aç
                  setTimeout(() => {
                    setShowCreateFolder(true);
                  }, 500);
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.primary}20` }]}>
                  <Ionicons name="folder" size={24} color={colors.primary} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Klasör Oluştur</Text>
                  <Text style={styles.menuItemSubtitle}>Yeni gizli klasör oluştur</Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Klasör Oluşturma Modal */}
        <Modal visible={showCreateFolder} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={[styles.modalIconContainer, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="folder-open" size={40} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Gizli Klasör Oluştur</Text>
              <Text style={styles.modalSubtitle}>
                Bu klasör otomatik olarak gizli olarak oluşturulacak
              </Text>
              
              <View style={styles.pinInputWrapper}>
                <Text style={styles.pinLabel}>Klasör Adı</Text>
                <TextInput
                  style={[styles.pinInput, { textAlign: 'left', paddingHorizontal: spacing.md }]}
                  placeholder="Klasör adı girin"
                  placeholderTextColor={colors.textMuted}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    setShowCreateFolder(false);
                    setNewFolderName('');
                  }}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleCreateFolder}
                  disabled={creatingFolder}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    {creatingFolder ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Oluştur</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* İşlem Menü Modal */}
        <Modal visible={showActionMenu} transparent animationType="fade">
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1} 
            onPress={() => setShowActionMenu(false)}
          >
            <View style={styles.menuContainer}>
              <Text style={styles.menuTitle}>
                {selectedItem?.type === 'file' 
                  ? (selectedItem as FileItem).filename 
                  : (selectedItem as FolderItem)?.name}
              </Text>
              
              {/* Dosya işlemleri */}
              {selectedItem?.type === 'file' && (
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={handleViewFile}
                >
                  <View style={[styles.menuItemIcon, { backgroundColor: `${colors.info}20` }]}>
                    <Ionicons name="eye" size={24} color={colors.info} />
                  </View>
                  <View style={styles.menuItemContent}>
                    <Text style={styles.menuItemTitle}>Görüntüle</Text>
                    <Text style={styles.menuItemSubtitle}>Dosyayı aç</Text>
                  </View>
                </TouchableOpacity>
              )}
              
              {/* Yeniden adlandır */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={handleRename}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.warning}20` }]}>
                  <Ionicons name="pencil" size={24} color={colors.warning} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Yeniden Adlandır</Text>
                  <Text style={styles.menuItemSubtitle}>İsmi değiştir</Text>
                </View>
              </TouchableOpacity>
              
              {/* Gizlilikten çıkar */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={handleUnhide}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.primary}20` }]}>
                  <Ionicons name="eye" size={24} color={colors.primary} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemTitle}>Gizliliği Kaldır</Text>
                  <Text style={styles.menuItemSubtitle}>Dosyalarım'a taşı</Text>
                </View>
              </TouchableOpacity>
              
              {/* Sil */}
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={handleDelete}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${colors.error}20` }]}>
                  <Ionicons name="trash" size={24} color={colors.error} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={[styles.menuItemTitle, { color: colors.error }]}>Sil</Text>
                  <Text style={styles.menuItemSubtitle}>Çöp kutusuna taşı</Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Yeniden Adlandırma Modal */}
        <Modal visible={showRenameModal} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={[styles.modalIconContainer, { backgroundColor: `${colors.warning}20` }]}>
                <Ionicons name="pencil" size={40} color={colors.warning} />
              </View>
              <Text style={styles.modalTitle}>Yeniden Adlandır</Text>
              <Text style={styles.modalSubtitle}>
                {selectedItem?.type === 'file' ? 'Dosya için yeni ad girin' : 'Klasör için yeni ad girin'}
              </Text>
              
              <View style={styles.pinInputWrapper}>
                <Text style={styles.pinLabel}>Yeni Ad</Text>
                <TextInput
                  style={[styles.pinInput, { textAlign: 'left', paddingHorizontal: spacing.md, letterSpacing: 0, fontSize: fontSize.md }]}
                  placeholder="Yeni ad girin"
                  placeholderTextColor={colors.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => {
                    setShowRenameModal(false);
                    setNewName('');
                    setSelectedItem(null);
                  }}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={submitRename}
                  disabled={renaming}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    {renaming ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalButtonTextPrimary}>Kaydet</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockBadge: {
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
  fileSize: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  unhideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  unhideText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.primary,
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
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  lockIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.warning}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lockedText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  lockedSubtext: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.warning}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pinInputWrapper: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  pinLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pinInput: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    letterSpacing: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  modalButtonGradient: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  modalButtonText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  modalButtonTextPrimary: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  // Add button
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  // Menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  menuTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  menuItemTitle: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  menuItemSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Section Header Styles (FilesScreen gibi)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionCount: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
});

export default HiddenFilesScreen;
