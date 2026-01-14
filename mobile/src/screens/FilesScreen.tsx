import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { api, API_BASE } from '../services/api';
import { getToken, storage } from '../utils/storage';
import { 
  hasMasterKey, 
  getMasterKey, 
  clearMasterKey 
} from '../crypto';
import { encryptAndUploadFileV3, downloadAndDecryptFileV3 } from '../crypto/encrypt';
import { FileItem, FolderItem } from '../types';
import { colors, gradients, shadows, borderRadius, fontSize, spacing } from '../constants/theme';
import { useWebSocket } from '../hooks/useWebSocket';

const { width } = Dimensions.get('window');

// Klasör renkleri - canlı ve dikkat çekici
const FOLDER_COLORS = [
  { start: '#FF1493', end: '#FF69B4' }, // Canlı Pembe
  { start: '#8B00FF', end: '#A855F7' }, // Mor
  { start: '#DC143C', end: '#FF4500' }, // Kırmızı
  { start: '#0080FF', end: '#00BFFF' }, // Mavi
  { start: '#9400D3', end: '#DA70D6' }, // Koyu Mor
  { start: '#FF0080', end: '#FF6EC7' }, // Magenta
  { start: '#4169E1', end: '#87CEEB' }, // Lacivert-Mavi
  { start: '#C71585', end: '#FF1493' }, // Fuşya
];

// Klasör ID'sine göre sabit renk döndür
const getFolderColor = (folderId: string, index: number): { start: string; end: string } => {
  // ID'nin hash'ini al ve renk seç
  let hash = 0;
  for (let i = 0; i < folderId.length; i++) {
    hash = folderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % FOLDER_COLORS.length;
  return FOLDER_COLORS[colorIndex];
};

type RootStackParamList = {
  Files: { folderId?: string; folderName?: string } | undefined;
  FilePreview: { file: FileItem };
};

type FilesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type FilesScreenRouteProp = RouteProp<RootStackParamList, 'Files'>;

const FilesScreen: React.FC = () => {
  const navigation = useNavigation<FilesScreenNavigationProp>();
  const route = useRoute<FilesScreenRouteProp>();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [folderStack, setFolderStack] = useState<FolderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // WebSocket bağlantısını kur
  const { isConnected, on } = useWebSocket();
  
  // Şifreleme state'leri
  const [hasEncryptionKey, setHasEncryptionKey] = useState(hasMasterKey());
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showSecurityExpiredModal, setShowSecurityExpiredModal] = useState(false);
  const prevHasKeyRef = useRef(hasEncryptionKey);
  
  // Master key durumunu kontrol et
  useEffect(() => {
    const interval = setInterval(() => {
      const hasKey = hasMasterKey();
      setHasEncryptionKey(hasKey);
    }, hasEncryptionKey ? 5000 : 500);
    return () => clearInterval(interval);
  }, [hasEncryptionKey]);

  // Route parametresinden gelen folderId'yi kontrol et
  useEffect(() => {
    if (route.params?.folderId) {
      const folderFromRoute: FolderItem = {
        id: route.params.folderId,
        name: route.params.folderName || 'Klasör',
        userId: '',
        parentId: null,
        createdAt: new Date().toISOString(),
      };
      setCurrentFolder(folderFromRoute);
      setFolderStack([folderFromRoute]);
    }
  }, [route.params?.folderId]);
  
  // Modaller
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FileItem | FolderItem | null>(null);
  const [selectedType, setSelectedType] = useState<'file' | 'folder'>('file');
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  
  // Paylaşım Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('24');
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('DOWNLOAD');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPermissionPicker, setShowPermissionPicker] = useState(false);
  
  // Tarih/Saat Seçici State
  const [useCustomExpiry, setUseCustomExpiry] = useState(false);
  const [customExpiryDate, setCustomExpiryDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Ekiple Paylaş Modal State
  const [showTeamShareModal, setShowTeamShareModal] = useState(false);
  const [userTeams, setUserTeams] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [teamShareLoading, setTeamShareLoading] = useState(false);

  // Dosyaları yükle - master key yoksa bekle
  useFocusEffect(
    useCallback(() => {
      // Master key kontrol ediliyor, hazır olunca yüklenecek
      if (hasEncryptionKey) {
        loadFiles();
      } else {
        // Master key henüz hazır değil, loading state'inde bekle
        console.log('⏳ [Files] Master key bekleniyor...');
        setLoading(true);
      }
    }, [currentFolder, hasEncryptionKey])
  );
  
  // Master key hazır olduğunda dosyaları yükle
  useEffect(() => {
    if (hasEncryptionKey && !prevHasKeyRef.current) {
      console.log('🔑 [Files] Master key hazır - dosyalar yükleniyor');
      loadFiles();
    }
    prevHasKeyRef.current = hasEncryptionKey;
  }, [hasEncryptionKey]);
  
  // WebSocket event listener'ları
  useEffect(() => {
    if (!isConnected) return;
    
    console.log('✅ WebSocket bağlandı - event listener\'lar kuruluyor');
    
    // Tüm sync event'lerini dinle
    const unsubscribe = on('*', (event) => {
      console.log('📥 Sync event alındı:', event);
      
      // Dosya/klasör değişiklikleri olduğunda refresh et
      if (event.type.startsWith('file:') || event.type.startsWith('folder:')) {
        console.log('🔄 Dosya/klasör değişikliği - liste yenileniyor');
        loadFiles();
      }
      
      // Bildirim göster
      const messages: Record<string, string> = {
        'file:uploaded': 'Dosya yüklendi',
        'file:deleted': 'Dosya silindi',
        'file:renamed': 'Dosya yeniden adlandırıldı',
        'file:restored': 'Dosya geri yüklendi',
        'file:moved': 'Dosya taşındı',
        'folder:created': 'Klasör oluşturuldu',
        'folder:deleted': 'Klasör silindi',
        'folder:renamed': 'Klasör yeniden adlandırıldı',
      };
      
      if (messages[event.type]) {
        Alert.alert('', messages[event.type]);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [isConnected, on]);

  const loadFiles = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const folderId = currentFolder?.id || null;
      const response = await api.getFiles(folderId);
      
      // Debug: API'dan gelen dosya verilerini logla
      console.log('📂 [FilesScreen] API yanıtı:', JSON.stringify({
        fileCount: response.files?.length,
        firstFile: response.files?.[0] ? {
          id: response.files[0].id,
          filename: response.files[0].filename,
          isEncrypted: response.files[0].isEncrypted,
          metaNameEnc: response.files[0].metaNameEnc ? 'VAR' : 'YOK',
          metaNameIv: response.files[0].metaNameIv ? 'VAR' : 'YOK',
        } : null
      }, null, 2));
      
      // Şifrelenmiş dosya adlarını çöz
      const decryptedFiles = await Promise.all(
        (response.files || []).map(async (file) => {
          // Eğer dosya V3 ile şifrelenmiş ve metaNameEnc varsa, dosya adını çöz
          if (file.isEncrypted && file.metaNameEnc && file.metaNameIv) {
            // Master key yoksa - bu durumda useFocusEffect zaten bekletecek
            if (!hasMasterKey()) {
              console.log('⏳ Master key henüz hazır değil, dosya adı çözülemiyor:', file.id);
              return { ...file, filename: file.filename || 'Yükleniyor...', name: file.filename || 'Yükleniyor...' };
            }
            
            try {
              console.log('🔓 Dosya adı çözülüyor:', file.id, 'metaNameEnc:', file.metaNameEnc?.substring(0, 20) + '...');
              const masterKey = getMasterKey();
              console.log('🔑 Master key alındı, uzunluk:', masterKey.length);
              
              const { decryptFilename } = await import('../crypto/encrypt');
              const { base64ToBytes } = await import('../crypto/kdf');
              
              const metaNameIv = base64ToBytes(file.metaNameIv);
              console.log('🔑 IV uzunluğu:', metaNameIv.length);
              
              const decryptedName = await decryptFilename(masterKey, metaNameIv, file.metaNameEnc);
              
              console.log('✅ Dosya adı çözüldü:', decryptedName);
              return { ...file, filename: decryptedName, name: decryptedName };
            } catch (error: any) {
              console.warn('❌ Dosya adı çözülemedi:', file.id, 'Hata:', error?.message || error);
              return { ...file, filename: file.filename || 'Şifreli Dosya', name: file.filename || 'Şifreli Dosya' };
            }
          }
          return file;
        })
      );
      
      setFiles(decryptedFiles || []);
      setFolders(response.folders || []);
    } catch (error) {
      console.error('Dosyalar yüklenirken hata:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpload = async () => {
    console.log('📤 [FilesScreen] handleUpload başladı');
    
    // Master key kontrolü - yoksa güvenlik modal'ı göster
    if (!hasEncryptionKey) {
      console.log('❌ [FilesScreen] Master key yok, security modal gösteriliyor');
      setShowSecurityExpiredModal(true);
      return;
    }
    
    try {
      console.log('🔍 [FilesScreen] DocumentPicker açılıyor...');
      
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      
      console.log('📄 [FilesScreen] DocumentPicker tamamlandı:', { canceled: result.canceled, assetsLength: result.assets?.length });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Büyük dosya uyarısı kontrolü
        const largeFileWarningEnabled = await storage.getLargeFileWarning();
        const LARGE_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
        
        for (const asset of result.assets) {
          if (largeFileWarningEnabled && asset.size && asset.size > LARGE_FILE_SIZE) {
            const sizeInMB = (asset.size / (1024 * 1024)).toFixed(2);
            const shouldContinue = await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Büyük Dosya Uyarısı',
                `${asset.name} dosyası ${sizeInMB} MB boyutunda. Yüklemek istediğinize emin misiniz?`,
                [
                  { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Yükle', onPress: () => resolve(true) },
                ]
              );
            });
            
            if (!shouldContinue) {
              continue;
            }
          }
        }
        
        setUploading(true);
        setIsEncrypting(true);
        
        const token = await getToken();
        if (!token) {
          Alert.alert('Hata', 'Oturum bulunamadı');
          return;
        }
        
        const masterKey = getMasterKey();
        
        let successCount = 0;
        let versionCount = 0;
        
        for (const asset of result.assets) {
          try {
            // V3 Envelope encryption ile şifreli upload
            const response = await encryptAndUploadFileV3(
              asset.uri,
              asset.name,
              asset.mimeType || 'application/octet-stream',
              masterKey,
              token,
              API_BASE,
              currentFolder?.id
            );
            
            successCount++;
            
            // Backend'den dönen response'u kontrol et
            if (response && response.isNewVersion) {
              versionCount++;
              Alert.alert(
                'Yeni Sürüm',
                response.message || `"${asset.name}" yeni sürüm olarak kaydedildi`,
                [{ text: 'Tamam' }]
              );
            }
          } catch (error: any) {
            Alert.alert('Hata', `${asset.name} yüklenemedi: ${error.message}`);
          }
        }
        
        if (successCount > 0) {
          if (versionCount > 0 && versionCount < successCount) {
            Alert.alert('Başarılı', `${successCount - versionCount} yeni dosya, ${versionCount} sürüm güncellendi 🔐`);
          } else if (versionCount === 0) {
            Alert.alert('Başarılı', `${successCount} dosya V3 ile şifrelenerek yüklendi 🔐`);
          }
        }
        
        loadFiles();
      }
    } catch (error: any) {
      console.error('❌ [FilesScreen] handleUpload hatası:', error);
      Alert.alert('Hata', error.message || 'Dosya seçilemedi');
    } finally {
      setUploading(false);
      setIsEncrypting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFiles();
  };

  const navigateToFolder = (folder: FolderItem) => {
    if (currentFolder) {
      setFolderStack([...folderStack, currentFolder]);
    }
    setCurrentFolder(folder);
    setLoading(true);
  };

  const navigateBack = () => {
    if (folderStack.length > 0) {
      const prevFolder = folderStack[folderStack.length - 1];
      setFolderStack(folderStack.slice(0, -1));
      setCurrentFolder(prevFolder);
    } else {
      setCurrentFolder(null);
    }
    setLoading(true);
  };

  const getFileIcon = (mimeType: string | null | undefined): keyof typeof Ionicons.glyphMap => {
    if (!mimeType) return 'document-outline';
    if (mimeType.startsWith('image/')) return 'image-outline';
    if (mimeType.startsWith('video/')) return 'videocam-outline';
    if (mimeType.startsWith('audio/')) return 'musical-notes-outline';
    if (mimeType.includes('pdf')) return 'document-text-outline';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive-outline';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document-outline';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'grid-outline';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'easel-outline';
    return 'document-outline';
  };

  const getFileIconColor = (mimeType: string | null | undefined): string => {
    if (!mimeType) return colors.fileDefault;
    if (mimeType.startsWith('image/')) return colors.fileImage;
    if (mimeType.startsWith('video/')) return colors.fileVideo;
    if (mimeType.startsWith('audio/')) return colors.fileAudio;
    if (mimeType.includes('pdf')) return colors.filePdf;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return colors.fileZip;
    if (mimeType.includes('word')) return colors.fileDoc;
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return colors.fileXls;
    if (mimeType.includes('presentation')) return colors.filePpt;
    return colors.fileDefault;
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
  const TURKISH_MONTHS_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  
  const formatDateTurkish = (date: Date, includeYear: boolean = false): string => {
    const day = date.getDate();
    const month = TURKISH_MONTHS[date.getMonth()];
    if (includeYear) {
      return `${day} ${month} ${date.getFullYear()}`;
    }
    return `${day} ${month}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return formatDateTurkish(date);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Hata', 'Klasör adı boş olamaz');
      return;
    }

    try {
      await api.createFolder(newFolderName, currentFolder?.id);
      setNewFolderName('');
      setShowCreateFolder(false);
      loadFiles();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Klasör oluşturulamadı');
    }
  };

  const handleItemOptions = (item: FileItem | FolderItem, type: 'file' | 'folder') => {
    setSelectedItem(item);
    setSelectedType(type);
    setShowOptions(true);
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    
    Alert.alert(
      'Silme Onayı',
      `"${selectedType === 'file' ? (selectedItem as FileItem).filename : (selectedItem as FolderItem).name}" silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedType === 'file') {
                await api.deleteFile(selectedItem.id);
              } else {
                await api.deleteFolder(selectedItem.id);
              }
              setShowOptions(false);
              loadFiles();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Silinemedi');
            }
          },
        },
      ]
    );
  };

  // Ekiple Paylaş modalını aç
  const openTeamShare = async () => {
    setShowOptions(false);
    setSelectedTeamId('');
    try {
      const teams = await api.getMyTeamsWithRole();
      const editableTeams = teams.filter((t: any) => 
        t.role === 'OWNER' || t.role === 'ADMIN' || t.role === 'EDITOR'
      );
      setUserTeams(editableTeams);
      setShowTeamShareModal(true);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Hata', 'Ekipler yüklenemedi');
    }
  };

  // Ekiple paylaş işlemi
  const handleShareWithTeam = async () => {
    if (!selectedItem || !selectedTeamId || teamShareLoading) return;
    setTeamShareLoading(true);
    try {
      let encryptionData: { teamDek: string; teamDekIv: string } | undefined;
      
      // Şifreli dosya ise DEK'i çöz ve ekip için hazırla
      const fileItem = selectedItem as FileItem;
      if (fileItem.encryptionVersion && fileItem.edek && fileItem.edekIv) {
        const { gcm } = require('@noble/ciphers/aes');
        const { base64ToBytes, bytesToBase64 } = require('../crypto');
        
        const masterKey = await getMasterKey();
        if (masterKey) {
          const edekBytes = base64ToBytes(fileItem.edek);
          const edekIvBytes = base64ToBytes(fileItem.edekIv);
          
          // EDEK'i çöz -> plain DEK
          const cipher = gcm(masterKey, edekIvBytes);
          const plainDek = cipher.decrypt(edekBytes);
          
          // teamDek olarak base64 encode et
          encryptionData = {
            teamDek: bytesToBase64(plainDek),
            teamDekIv: fileItem.cipherIv || ''
          };
        }
      }
      
      await api.shareFileWithTeam(selectedItem.id, selectedTeamId, encryptionData);
      setShowTeamShareModal(false);
      Alert.alert('Başarılı', 'Dosya ekiple paylaşıldı');
    } catch (error: any) {
      console.error(error);
      Alert.alert('Hata', error.message || 'Dosya ekiple paylaşılamadı');
    } finally {
      setTeamShareLoading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) return;

    try {
      if (selectedType === 'file') {
        await api.updateFile(selectedItem.id, { originalName: renameValue });
      } else {
        await api.updateFolder(selectedItem.id, { name: renameValue });
      }
      setShowRename(false);
      setRenameValue('');
      loadFiles();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Yeniden adlandırılamadı');
    }
  };

  const handleFilePress = (file: FileItem) => {
    // Dosyanın gerçek klasör adını bul
    let folderName = 'Ana Klasör';
    
    if (file.folderId) {
      // Dosyanın folderId'si varsa, klasör adını bul
      // Önce mevcut klasörlerde ara
      const folder = folders.find(f => f.id === file.folderId);
      if (folder) {
        folderName = folder.name;
      } else if (currentFolder && currentFolder.id === file.folderId) {
        // Şu an içinde olduğumuz klasör
        folderName = currentFolder.name;
      } else {
        // Klasör bulunamadı, folderId var ama ismi bilinmiyor
        folderName = 'Klasör';
      }
    } else if (currentFolder) {
      // Dosyanın folderId'si yok ama bir klasör içindeyiz
      folderName = currentFolder.name;
    }
    
    // Dosya detay sayfasını aç
    navigation.navigate('FileDetails' as never, { 
      file,
      folderName
    } as never);
  };
  
  const handleViewFile = (file: FileItem) => {
    // Dosyayı görüntüle
    navigation.navigate('FileViewer' as never, { file } as never);
  };

  const filteredFiles = files.filter(f => 
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFolders = folders.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFolder = ({ item, index }: { item: FolderItem; index: number }) => {
    const folderColor = getFolderColor(item.id, index);
    
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => navigateToFolder(item)}
        onLongPress={() => handleItemOptions(item, 'folder')}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={[folderColor.start, folderColor.end]}
          style={styles.folderIconContainer}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="folder" size={24} color="#fff" />
        </LinearGradient>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {item.fileCount || 0} öğe • {formatDate(item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.moreButton}
          onPress={() => handleItemOptions(item, 'folder')}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderFile = ({ item }: { item: FileItem }) => {
    const iconColor = getFileIconColor(item.mimeType);
    
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleFilePress(item)}
        onLongPress={() => handleItemOptions(item, 'file')}
        activeOpacity={0.7}
      >
        <View style={[styles.fileIconContainer, { backgroundColor: `${iconColor}20` }]}>
          <Ionicons name={getFileIcon(item.mimeType)} size={24} color={iconColor} />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{item.filename}</Text>
          <Text style={styles.itemMeta}>
            {formatFileSize(item.sizeBytes)} • {formatDate(item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.moreButton}
          onPress={() => handleItemOptions(item, 'file')}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {filteredFolders.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Klasörler</Text>
          {filteredFolders.map(folder => (
            <View key={folder.id}>{renderFolder({ item: folder })}</View>
          ))}
          {filteredFiles.length > 0 && (
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Dosyalar</Text>
          )}
        </>
      )}
    </View>
  );

  if (loading && !refreshing) {
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
          <View style={styles.headerLeft}>
            {currentFolder && (
              <TouchableOpacity onPress={navigateBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
            <View>
              <Text style={styles.headerTitle}>
                {currentFolder ? currentFolder.name : 'Dosyalarım'}
              </Text>
              {!currentFolder && (
                <Text style={styles.headerSubtitle}>
                  {folders.length + files.length} öğe
                </Text>
              )}
            </View>
          </View>
          
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => setShowSearch(!showSearch)}
            >
              <Ionicons name="search" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => setShowCreateFolder(true)}
            >
              <Ionicons name="folder-open-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Arama */}
        {showSearch && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Ara..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Breadcrumb */}
        {folderStack.length > 0 && (
          <View style={styles.breadcrumb}>
            <TouchableOpacity onPress={() => { setFolderStack([]); setCurrentFolder(null); }}>
              <Text style={styles.breadcrumbItem}>Ana Klasör</Text>
            </TouchableOpacity>
            {folderStack.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                <TouchableOpacity onPress={() => {
                  setFolderStack(folderStack.slice(0, index));
                  setCurrentFolder(folder);
                }}>
                  <Text style={styles.breadcrumbItem}>{folder.name}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
            {currentFolder && (
              <>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                <Text style={[styles.breadcrumbItem, styles.breadcrumbActive]}>
                  {currentFolder.name}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Dosya Listesi */}
        <FlatList
          data={filteredFolders.length > 0 ? filteredFiles : filteredFiles}
          keyExtractor={(item) => item.id}
          renderItem={renderFile}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>Bu klasör boş</Text>
              <Text style={styles.emptySubtext}>
                Dosya yükleyin veya klasör oluşturun
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* FAB - Yükle */}
        <TouchableOpacity
          style={styles.fab}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={gradients.secondary as [string, string]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="cloud-upload" size={26} color="#fff" />
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Yeni Klasör Modal */}
        <Modal visible={showCreateFolder} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Yeni Klasör</Text>
              <View style={styles.modalInputWrapper}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Klasör adı"
                  placeholderTextColor={colors.textMuted}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  autoFocus
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setShowCreateFolder(false)}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleCreateFolder}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Oluştur</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Seçenekler Modal */}
        <Modal visible={showOptions} transparent animationType="slide">
          <TouchableOpacity 
            style={styles.bottomSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowOptions(false)}
          >
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.bottomSheetTitle}>
                {selectedType === 'file' 
                  ? (selectedItem as FileItem)?.filename 
                  : (selectedItem as FolderItem)?.name}
              </Text>
              
              {/* Görüntüle - Dosya içeriğini göster */}
              {selectedType === 'file' && (
                <TouchableOpacity style={styles.bottomSheetOption} onPress={() => {
                  setShowOptions(false);
                  handleViewFile(selectedItem as FileItem);
                }}>
                  <Ionicons name="eye" size={22} color={colors.textPrimary} />
                  <Text style={styles.bottomSheetOptionText}>Görüntüle</Text>
                </TouchableOpacity>
              )}

              {/* Paylaş */}
              <TouchableOpacity style={styles.bottomSheetOption} onPress={() => {
                setShowOptions(false);
                // Paylaşım modal'ını aç
                setShareLink(null);
                setShareExpiry('24');
                setSharePermission('DOWNLOAD');
                setShowPermissionPicker(false);
                setCopied(false);
                setShowShareModal(true);
              }}>
                <Ionicons name="share-social" size={22} color={colors.textPrimary} />
                <Text style={styles.bottomSheetOptionText}>Paylaş</Text>
              </TouchableOpacity>

              {/* Ekiple Paylaş */}
              {selectedType === 'file' && (
                <TouchableOpacity style={styles.bottomSheetOption} onPress={openTeamShare}>
                  <Ionicons name="people" size={22} color={colors.success} />
                  <Text style={styles.bottomSheetOptionText}>Ekiple Paylaş</Text>
                </TouchableOpacity>
              )}

              {/* Favorilere Ekle/Çıkar */}
              <TouchableOpacity style={styles.bottomSheetOption} onPress={async () => {
                try {
                  setShowOptions(false);
                  if (selectedType === 'file') {
                    await api.toggleFavorite(selectedItem!.id, (selectedItem as FileItem).isFavorite);
                  } else {
                    await api.toggleFolderFavorite(selectedItem!.id);
                  }
                  loadFiles();
                  Alert.alert('Başarılı', 'Favori durumu güncellendi');
                } catch (error: any) {
                  Alert.alert('Hata', error.message || 'İşlem başarısız');
                }
              }}>
                <Ionicons 
                  name={(selectedType === 'file' && (selectedItem as FileItem)?.isFavorite) ? "star" : "star-outline"} 
                  size={22} 
                  color={colors.warning} 
                />
                <Text style={styles.bottomSheetOptionText}>
                  {(selectedType === 'file' && (selectedItem as FileItem)?.isFavorite) ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                </Text>
              </TouchableOpacity>

              {/* İndir */}
              {selectedType === 'file' && (
                <TouchableOpacity style={styles.bottomSheetOption} onPress={async () => {
                  const file = selectedItem as FileItem;
                  
                  // Şifreli dosya kontrolü
                  if (file?.isEncrypted) {
                    if (!hasEncryptionKey) {
                      setShowOptions(false);
                      setShowSecurityExpiredModal(true);
                      return;
                    }
                    
                    try {
                      setShowOptions(false);
                      setIsDecrypting(true);
                      
                      const localUri = await downloadAndDecryptFileV3(file.id, file.filename);
                      
                      // Dosyayı paylaş (indirme için)
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(localUri, {
                          mimeType: file.mimeType || 'application/octet-stream',
                          dialogTitle: file.filename
                        });
                      } else {
                        Alert.alert('Başarılı', `${file.filename} şifresi çözüldü 🔓`);
                      }
                    } catch (error: any) {
                      Alert.alert('Hata', error.message || 'Dosya çözümlenemedi');
                    } finally {
                      setIsDecrypting(false);
                    }
                  } else {
                    // Normal dosya indirme
                    try {
                      setShowOptions(false);
                      const url = await api.getDownloadUrl(selectedItem!.id);
                      Alert.alert('İndirme Linki', 'Dosyayı indirmek için linke tıklayın.', [
                        { text: 'Tamam' }
                      ]);
                    } catch (error: any) {
                      Alert.alert('Hata', error.message || 'İndirme linki alınamadı');
                    }
                  }
                }}>
                  <Ionicons name="download" size={22} color={colors.textPrimary} />
                  <Text style={styles.bottomSheetOptionText}>
                    {(selectedItem as FileItem)?.isEncrypted ? 'İndir 🔓' : 'İndir'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {/* Yeniden Adlandır */}
              <TouchableOpacity style={styles.bottomSheetOption} onPress={() => {
                setRenameValue(selectedType === 'file' 
                  ? (selectedItem as FileItem)?.filename || ''
                  : (selectedItem as FolderItem)?.name || '');
                setShowOptions(false);
                setShowRename(true);
              }}>
                <Ionicons name="pencil" size={22} color={colors.textPrimary} />
                <Text style={styles.bottomSheetOptionText}>Yeniden Adlandır</Text>
              </TouchableOpacity>

              {/* Gizle */}
              {selectedType === 'file' && (
                <TouchableOpacity style={styles.bottomSheetOption} onPress={async () => {
                  try {
                    setShowOptions(false);
                    await api.toggleHidden(selectedItem!.id);
                    loadFiles();
                    Alert.alert('Başarılı', 'Dosya gizlendi');
                  } catch (error: any) {
                    Alert.alert('Hata', error.message || 'İşlem başarısız');
                  }
                }}>
                  <Ionicons name="eye-off" size={22} color={colors.textPrimary} />
                  <Text style={styles.bottomSheetOptionText}>Gizle</Text>
                </TouchableOpacity>
              )}
              
              {/* Sil */}
              <TouchableOpacity 
                style={[styles.bottomSheetOption, styles.bottomSheetOptionDanger]} 
                onPress={handleDelete}
              >
                <Ionicons name="trash" size={22} color={colors.error} />
                <Text style={[styles.bottomSheetOptionText, { color: colors.error }]}>Sil</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Yeniden Adlandır Modal */}
        <Modal visible={showRename} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Yeniden Adlandır</Text>
              <View style={styles.modalInputWrapper}>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Yeni ad"
                  placeholderTextColor={colors.textMuted}
                  value={renameValue}
                  onChangeText={setRenameValue}
                  autoFocus
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setShowRename(false)}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleRename}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Kaydet</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
                  <Text style={styles.shareModalSubtitle} numberOfLines={1}>
                    {selectedType === 'file' 
                      ? (selectedItem as FileItem)?.filename 
                      : (selectedItem as FolderItem)?.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowShareModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Süre Ayarı */}
              <View style={styles.shareOptionSection}>
                <View style={styles.shareOptionLabel}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <Text style={styles.shareOptionLabelText}>Geçerlilik Süresi</Text>
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

                {/* Saat Girişi */}
                {!useCustomExpiry ? (
                  <>
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
                  </>
                ) : (
                  <>
                    {/* Tarih ve Saat Seçici Butonları */}
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
                    <Text style={styles.shareOptionHint}>
                      Paylaşım {formatDateTurkish(customExpiryDate, true)} {`${String(customExpiryDate.getHours()).padStart(2, '0')}:${String(customExpiryDate.getMinutes()).padStart(2, '0')}`} tarihinde sona erecek
                    </Text>
                    
                    {/* iOS için DateTimePicker */}
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
                    <Ionicons 
                      name={sharePermission === 'VIEW' ? 'eye-outline' : sharePermission === 'DOWNLOAD' ? 'download-outline' : 'create-outline'} 
                      size={20} 
                      color={colors.primary} 
                    />
                    <Text style={styles.permissionSelectorText}>
                      {sharePermission === 'VIEW' ? 'Sadece Görüntüleme' : 
                       sharePermission === 'DOWNLOAD' ? 'Görüntüleme ve İndirme' : 
                       'Tam Erişim'}
                    </Text>
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
                    <TouchableOpacity 
                      style={styles.copyButton} 
                      onPress={async () => {
                        await Clipboard.setStringAsync(shareLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
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
                  onPress={async () => {
                    try {
                      setShareLoading(true);
                      let expiresIn: string | number;
                      
                      if (useCustomExpiry) {
                        // Tarih seçilmişse, saat cinsinden hesapla
                        const now = Date.now();
                        const diff = customExpiryDate.getTime() - now;
                        const hours = Math.ceil(diff / (1000 * 60 * 60));
                        expiresIn = hours > 0 ? hours : 1;
                      } else {
                        expiresIn = shareExpiry ? parseInt(shareExpiry) : 'unlimited';
                      }
                      
                      let result;
                      if (selectedType === 'file') {
                        result = await api.createShareLink(selectedItem!.id, { 
                          expiresIn: expiresIn === 'unlimited' ? 'unlimited' : `${expiresIn}h`,
                          permission: sharePermission 
                        });
                      } else {
                        result = await api.shareFolder(selectedItem!.id);
                      }
                      
                      let finalShareUrl = result.shareUrl;
                      
                      // Dosya şifreliyse DEK'i URL fragment'ına ekle
                      if (selectedType === 'file' && result.encryptionInfo?.isEncrypted) {
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
                  }}
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

        {/* Güvenlik Oturumu Sona Erdi Modal */}
        <Modal
          visible={showSecurityExpiredModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowSecurityExpiredModal(false)}
        >
          <View style={styles.shareModalOverlay}>
            <View style={[styles.shareModalContent, { maxWidth: 360 }]}>
              {/* Modal Header */}
              <View style={styles.shareModalHeader}>
                <View style={[styles.shareModalIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <Ionicons name="shield-outline" size={28} color="#ef4444" />
                </View>
                <Text style={styles.shareModalTitle}>Güvenlik Oturumu Sona Erdi</Text>
                <Text style={styles.shareModalSubtitle}>Şifreleme anahtarınız süresi doldu</Text>
              </View>

              {/* Açıklama */}
              <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <Ionicons name="lock-closed" size={20} color="#ef4444" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                      Dosyalarınızı korumak için güvenlik oturumu 30 dakika hareketsizlik sonunda otomatik olarak sonlanır.
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: 8 }}>
                      Devam etmek için <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>tekrar giriş yapmanız</Text> gerekmektedir.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Butonlar */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={[styles.shareModalCancelButton, { flex: 1 }]}
                  onPress={() => setShowSecurityExpiredModal(false)}
                >
                  <Text style={styles.shareModalCancelText}>Kapat</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}
                  onPress={async () => {
                    setShowSecurityExpiredModal(false);
                    clearMasterKey();
                    await api.logout();
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' as any }],
                    });
                  }}
                >
                  <LinearGradient
                    colors={gradients.primary as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  >
                    <Ionicons name="log-in-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Giriş Yap</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Ekiple Paylaş Modal */}
        <Modal
          visible={showTeamShareModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTeamShareModal(false)}
        >
          <View style={styles.shareModalOverlay}>
            <View style={styles.shareModalContent}>
              {/* Modal Header */}
              <View style={styles.shareModalHeader}>
                <View style={[styles.shareModalIcon, { backgroundColor: `${colors.success}20` }]}>
                  <Ionicons name="people" size={24} color={colors.success} />
                </View>
                <View style={styles.shareModalHeaderText}>
                  <Text style={styles.shareModalTitle}>Ekiple Paylaş</Text>
                  <Text style={styles.shareModalSubtitle} numberOfLines={1}>
                    {selectedType === 'file' 
                      ? (selectedItem as FileItem)?.filename 
                      : (selectedItem as FolderItem)?.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowTeamShareModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {userTeams.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
                    Henüz bir ekibe üye değilsiniz{'\n'}veya dosya paylaşma yetkiniz yok.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 12 }}>
                    Ekip Seç
                  </Text>
                  {userTeams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 12,
                        backgroundColor: selectedTeamId === team.id ? `${colors.success}20` : colors.surface,
                        borderRadius: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: selectedTeamId === team.id ? colors.success : colors.border,
                      }}
                      onPress={() => setSelectedTeamId(team.id)}
                    >
                      <Ionicons name="people" size={20} color={selectedTeamId === team.id ? colors.success : colors.textMuted} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{team.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {team.role === 'OWNER' ? 'Sahip' : team.role === 'ADMIN' ? 'Yönetici' : 'Editör'}
                        </Text>
                      </View>
                      {selectedTeamId === team.id && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Butonlar */}
              <View style={styles.shareModalActions}>
                <TouchableOpacity
                  style={[styles.shareModalButton, styles.shareModalButtonCancel]}
                  onPress={() => setShowTeamShareModal(false)}
                >
                  <Text style={styles.shareModalButtonCancelText}>İptal</Text>
                </TouchableOpacity>
                {userTeams.length > 0 && (
                  <TouchableOpacity
                    style={[styles.shareModalButton, styles.shareModalButtonPrimary, !selectedTeamId && { opacity: 0.5 }]}
                    onPress={handleShareWithTeam}
                    disabled={!selectedTeamId || teamShareLoading}
                  >
                    <LinearGradient
                      colors={[colors.success, '#059669'] as [string, string]}
                      style={styles.shareModalButtonGradient}
                    >
                      {teamShareLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.shareModalButtonText}>Ekiple Paylaş</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  headerRight: {
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
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  breadcrumbItem: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  breadcrumbActive: {
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  listHeader: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  folderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  moreButton: {
    padding: spacing.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
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
    maxWidth: 400,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalInputWrapper: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
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
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  bottomSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  bottomSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  bottomSheetOptionText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  bottomSheetOptionDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
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
    backgroundColor: colors.surface,
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

export default FilesScreen;
