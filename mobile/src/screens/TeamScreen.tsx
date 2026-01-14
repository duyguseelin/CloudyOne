import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  Alert,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Linking,
  Share,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { api } from '../services/api';
import { getMasterKey, base64ToBytes, bytesToBase64 } from '../crypto';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'VIEWER' | 'MEMBER' | 'EDITOR' | 'OWNER';
  joinedAt: string;
}

interface TeamFile {
  id: string;
  filename: string;
  originalName?: string;
  sizeBytes: number;
  mimeType?: string | null;
  createdAt: string;
  uploadedBy: string;
  // Şifreleme bilgileri
  isEncrypted?: boolean;
  encryptionVersion?: string;
  cipherIv?: string;
  metaNameEnc?: string;
  metaNameIv?: string;
  // Ekip DEK bilgileri
  teamDek?: string;
  teamDekIv?: string;
}

interface TeamFolder {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
}

interface Team {
  id: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  VIEWER: { label: 'Görüntüleyici', description: '', color: colors.info },
  MEMBER: { label: 'Yardımcı', description: '', color: colors.success },
  EDITOR: { label: 'Editör', description: '', color: colors.warning },
  OWNER: { label: 'Sahip', description: '', color: colors.primary },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TeamScreen: React.FC = () => {
  const navigation = useNavigation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'VIEWER' | 'MEMBER' | 'EDITOR'>('VIEWER');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'members' | 'files' | 'joined'>('members');
  
  // Team Files state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamFiles, setTeamFiles] = useState<TeamFile[]>([]);
  const [teamFolders, setTeamFolders] = useState<TeamFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Yeni ekip oluşturma modal
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  
  // Dahil olduğum ekipler (üyesi olduğum)
  const [joinedTeams, setJoinedTeams] = useState<Team[]>([]);
  
  // Gönderdiğim davetler
  const [sentInvites, setSentInvites] = useState<any[]>([]);
  
  // Bekleyen davetler (beni davet edenler)
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  
  // Dahil sayfası için özel state'ler
  const [selectedJoinedTeam, setSelectedJoinedTeam] = useState<Team | null>(null);
  const [showJoinedTeamFiles, setShowJoinedTeamFiles] = useState(false);
  const [joinedTeamFiles, setJoinedTeamFiles] = useState<TeamFile[]>([]);
  const [joinedTeamFolders, setJoinedTeamFolders] = useState<TeamFolder[]>([]);
  const [joinedCurrentFolderId, setJoinedCurrentFolderId] = useState<string | null>(null);
  const [joinedFilesLoading, setJoinedFilesLoading] = useState(false);
  
  // Dosya işlemleri için state'ler
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  
  // Yorum sistemi için state'ler
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [fileComments, setFileComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showFileOptionsModal, setShowFileOptionsModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareExpiry, setShareExpiry] = useState('24h');
  const [sharePermission, setSharePermission] = useState<'VIEW' | 'DOWNLOAD' | 'EDIT'>('DOWNLOAD');

  useFocusEffect(
    useCallback(() => {
      loadTeamMembers();
      loadTeams();
      loadJoinedTeams();
      loadSentInvites();
      loadPendingInvites();
    }, [])
  );

  const loadTeamMembers = async () => {
    try {
      const response = await api.getTeamMembers();
      setMembers((response as any)?.members || response || []);
    } catch (error) {
      console.error('Takım üyeleri yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await api.getMyTeamsWithRole();
      console.log('🔍 [Teams] API response:', response);
      
      let ownedTeams = [];
      if (response && typeof response === 'object') {
        // Sadece sahip olunan ekipleri al
        if ((response as any).owned) {
          ownedTeams = (response as any).owned;
        }
      }
      
      console.log('🔍 [Teams] Owned teams:', ownedTeams);
      setTeams(ownedTeams);
      // İlk ekibi seç
      if (ownedTeams.length > 0 && !selectedTeam) {
        setSelectedTeam(ownedTeams[0]);
      }
    } catch (error) {
      console.error('Ekipler yüklenemedi:', error);
    }
  };

  const loadJoinedTeams = async () => {
    try {
      // Üyesi olduğumuz ama sahibi olmadığımız ekipleri yükle
      const response = await api.getMyTeamsWithRole();
      console.log('🔍 [JoinedTeams] API response:', response);
      
      let joinedArray = [];
      if (response && typeof response === 'object' && (response as any).member && Array.isArray((response as any).member)) {
        joinedArray = (response as any).member;
      } else if (Array.isArray(response)) {
        // Eski format uyumluluğu için
        joinedArray = response.filter((t: Team) => t.role !== 'OWNER');
      }
      
      console.log('🔍 [JoinedTeams] Processed joined teams:', joinedArray);
      setJoinedTeams(joinedArray);
    } catch (error) {
      console.error('Dahil olunan ekipler yüklenemedi:', error);
    }
  };

  // Gönderdiğim davetleri yükle
  const loadSentInvites = async () => {
    try {
      const response = await api.getSentInvites();
      setSentInvites(response || []);
    } catch (error: any) {
      // Backend'de henüz bu endpoint mevcut değilse sessiz hata
      if (error.message?.includes('Route not found') || error.message?.includes('404')) {
        setSentInvites([]);
        return;
      }
      console.error('Gönderdiğim davetler yüklenemedi:', error);
      setSentInvites([]);
    }
  };

  // Bekleyen davetleri yükle
  const loadPendingInvites = async () => {
    try {
      const response = await api.getPendingInvites();
      setPendingInvites(response || []);
    } catch (error: any) {
      // Backend'de henüz bu endpoint mevcut değilse sessiz hata
      if (error.message?.includes('Route not found') || error.message?.includes('404')) {
        setPendingInvites([]);
        return;
      }
      console.error('Bekleyen davetler yüklenemedi:', error);
      setPendingInvites([]);
    }
  };

  const loadTeamFiles = async (teamId: string, folderId?: string | null) => {
    setFilesLoading(true);
    try {
      const response = await api.getTeamFiles(teamId, folderId || undefined);
      setTeamFiles(response.files || []);
      setTeamFolders(response.folders || []);
    } catch (error) {
      console.error('Ekip dosyaları yüklenemedi:', error);
      setTeamFiles([]);
      setTeamFolders([]);
    } finally {
      setFilesLoading(false);
    }
  };

  // Dahil olduğum ekibin dosyalarını yükle
  const loadJoinedTeamFiles = async (teamId: string, folderId?: string | null) => {
    setJoinedFilesLoading(true);
    try {
      const response = await api.getTeamFiles(teamId, folderId || undefined);
      setJoinedTeamFiles(response.files || []);
      setJoinedTeamFolders(response.folders || []);
    } catch (error) {
      console.error('Dahil olunan ekip dosyaları yüklenemedi:', error);
      setJoinedTeamFiles([]);
      setJoinedTeamFolders([]);
    } finally {
      setJoinedFilesLoading(false);
    }
  };

  // Ekip seçildiğinde dosyaları yükle
  useEffect(() => {
    if (selectedTeam && activeTab === 'files') {
      loadTeamFiles(selectedTeam.id, currentFolderId);
    }
  }, [selectedTeam, activeTab, currentFolderId]);

  const handleCreateFolder = async () => {
    if (!selectedTeam || !newFolderName.trim()) return;
    
    try {
      await api.createTeamFolder(selectedTeam.id, newFolderName.trim(), currentFolderId || undefined);
      setShowNewFolderModal(false);
      setNewFolderName('');
      loadTeamFiles(selectedTeam.id, currentFolderId);
      Alert.alert('Başarılı', 'Klasör oluşturuldu');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Klasör oluşturulamadı');
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    
    try {
      await api.createTeam(newTeamName.trim());
      setShowCreateTeamModal(false);
      setNewTeamName('');
      loadTeams();
      Alert.alert('Başarılı', 'Ekip oluşturuldu');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Ekip oluşturulamadı');
    }
  };

  const handleUploadFile = async () => {
    if (!selectedTeam) {
      Alert.alert('Hata', 'Lütfen önce bir ekip seçin');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        setUploading(true);
        
        let successCount = 0;
        let versionCount = 0;
        
        for (const asset of result.assets) {
          const formData = new FormData();
          formData.append('file', {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType || 'application/octet-stream',
          } as any);
          formData.append('teamId', selectedTeam.id);
          if (currentFolderId) {
            formData.append('folderId', currentFolderId);
          }

          const response = await api.uploadTeamFile(formData);
          successCount++;
          
          // Sürüm kontrolü
          if (response.isNewVersion) {
            versionCount++;
            Alert.alert(
              'Yeni Sürüm',
              response.message || `"${asset.name}" yeni sürüm olarak kaydedildi`,
              [{ text: 'Tamam' }]
            );
          }
        }

        loadTeamFiles(selectedTeam.id, currentFolderId);
        
        if (versionCount > 0 && versionCount < successCount) {
          Alert.alert('Başarılı', `${successCount - versionCount} yeni dosya, ${versionCount} sürüm güncellendi`);
        } else if (versionCount === 0) {
          Alert.alert('Başarılı', 'Dosya(lar) yüklendi');
        }
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    Alert.alert(
      'Dosyayı Sil',
      'Bu dosya ekipten kaldırılacak. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteTeamFile(fileId);
              if (selectedTeam) {
                loadTeamFiles(selectedTeam.id, currentFolderId);
              }
              Alert.alert('Başarılı', 'Dosya silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Dosya silinemedi');
            }
          },
        },
      ]
    );
  };

  const handleDeleteFolder = async (folderId: string) => {
    Alert.alert(
      'Klasörü Sil',
      'Bu klasör ve içindeki tüm dosyalar silinecek. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteTeamFolder(folderId);
              if (selectedTeam) {
                loadTeamFiles(selectedTeam.id, currentFolderId);
              }
              Alert.alert('Başarılı', 'Klasör silindi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Klasör silinemedi');
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Tüm ekip üyeleri dosya/klasör yükleyebilir
  const canUpload = selectedTeam !== null;
  
  // İzinler - Rol bazlı sistem:
  // VIEWER: Sadece görüntüleme ve yorum
  // MEMBER: Görüntüleme, indirme, yorum
  // EDITOR: Görüntüleme, indirme, yorum, silme
  // OWNER: Tüm yetkiler ama silme yetkisi yok
  
  // Klasör ve dosya silme yetkisi - sadece EDITOR
  const canDelete = (selectedTeam?.role === 'EDITOR') || (selectedJoinedTeam?.role === 'EDITOR');

  // Dosya türüne göre önizleme yapılabilir mi?
  const canPreview = (mimeType?: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || 
           mimeType === 'application/pdf' ||
           mimeType.startsWith('video/') ||
           mimeType.startsWith('audio/');
  };

  // Dosya indirme
  const handleDownloadFile = async (file: TeamFile) => {
    try {
      setProcessing(true);
      
      // Şifreli ekip dosyası için client-side decrypt
      if (file.isEncrypted && file.teamDek && file.cipherIv) {
        const url = await api.getTeamFileDownloadUrl(file.id);
        const { downloadAndDecryptFileV3 } = require('../crypto/encrypt');
        const { base64ToBytes } = require('../crypto');
        
        // teamDek'i kullanarak dosyayı indir ve çöz
        const dek = base64ToBytes(file.teamDek);
        const result = await downloadAndDecryptFileV3(
          file.id,
          dek,
          file.cipherIv,
          file.metaNameEnc,
          file.metaNameIv
        );
        
        // Dosyayı paylaş/kaydet
        const { shareAsync } = require('expo-sharing');
        await shareAsync(result.uri);
      } else {
        // Şifresiz dosya - doğrudan aç
        const url = await api.getTeamFileDownloadUrl(file.id);
        await Linking.openURL(url);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya indirilemedi');
    } finally {
      setProcessing(false);
    }
  };

  // Dosya önizleme
  const handlePreviewFile = async (file: TeamFile) => {
    try {
      setProcessing(true);
      const url = await api.getTeamFileViewUrl(file.id);
      
      if (file.mimeType?.startsWith('image/')) {
        setPreviewUrl(url);
        setSelectedFile(file);
        setShowPreviewModal(true);
      } else {
        // PDF, video, audio vb. için tarayıcıda aç
        await Linking.openURL(url);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Dosya önizlenemedi');
    } finally {
      setProcessing(false);
    }
  };

  // Dosya seçenekleri modalını aç
  const openFileOptions = (file: TeamFile) => {
    setSelectedFile(file);
    setShowFileOptionsModal(true);
  };

  // Yorum sistemi fonksiyonları
  const loadFileComments = async (fileId: string) => {
    try {
      setCommentsLoading(true);
      const response = await api.getFileComments(fileId);
      setFileComments(response || []);
    } catch (error: any) {
      // Backend'de henüz bu endpoint mevcut değilse sessiz hata
      if (error.message?.includes('Route not found') || error.message?.includes('404')) {
        setFileComments([]);
        return;
      }
      console.error('Dosya yorumları yüklenemedi:', error);
      setFileComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const addFileComment = async () => {
    if (!selectedFile || !newComment.trim()) return;

    try {
      await api.addFileComment(selectedFile.id, newComment.trim());
      setNewComment('');
      await loadFileComments(selectedFile.id);
    } catch (error: any) {
      if (error.message?.includes('Route not found') || error.message?.includes('404')) {
        Alert.alert('Bilgi', 'Yorum özelliği henüz aktif değil');
        return;
      }
      Alert.alert('Hata', error.message || 'Yorum eklenemedi');
    }
  };

  const showFileComments = (file: TeamFile) => {
    setSelectedFile(file);
    setShowCommentsModal(true);
    loadFileComments(file.id);
  };

  // Gönderdiğim daveti sil
  const handleDeleteSentInvite = async (inviteId: string) => {
    Alert.alert(
      'Daveti İptal Et',
      'Bu daveti iptal etmek istediğinizden emin misiniz?',
      [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSentInvite(inviteId);
              Alert.alert('Başarılı', 'Davet iptal edildi');
              loadSentInvites();
            } catch (error: any) {
              if (error.message?.includes('Route not found') || error.message?.includes('404')) {
                Alert.alert('Bilgi', 'Bu özellik henüz aktif değil');
                return;
              }
              Alert.alert('Hata', error.message || 'Davet iptal edilemedi');
            }
          },
        },
      ]
    );
  };

  // Ekipten çıkış
  const handleLeaveTeam = async (teamId: string) => {
    Alert.alert(
      'Ekipten Çık',
      'Bu ekipten çıkmak istediğinizden emin misiniz? Ekip dosyalarına erişiminiz kesilecek.',
      [
        { text: 'Hayır', style: 'cancel' },
        {
          text: 'Evet, Çık',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveTeam(teamId);
              Alert.alert('Başarılı', 'Ekipten çıktınız');
              setShowJoinedTeamFiles(false);
              setSelectedJoinedTeam(null);
              setJoinedCurrentFolderId(null);
              loadJoinedTeams();
            } catch (error: any) {
              if (error.message?.includes('Route not found') || error.message?.includes('404')) {
                Alert.alert('Bilgi', 'Bu özellik henüz aktif değil');
                return;
              }
              Alert.alert('Hata', error.message || 'Ekipten çıkılamadı');
            }
          },
        },
      ]
    );
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Hata', 'E-posta adresi gerekli');
      return;
    }

    try {
      await api.inviteTeamMember(inviteEmail, inviteRole);
      setShowInviteModal(false);
      setInviteEmail('');
      Alert.alert('Başarılı', 'Davet gönderildi');
      loadTeamMembers();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Davet gönderilemedi');
    }
  };

  const handleChangeRole = async (newRole: 'VIEWER' | 'MEMBER' | 'EDITOR') => {
    if (!selectedMember) return;

    try {
      await api.updateTeamMemberRole(selectedMember.id, newRole);
      setShowOptionsModal(false);
      loadTeamMembers();
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Rol değiştirilemedi');
    }
  };

  const handleRemoveMember = () => {
    if (!selectedMember) return;

    Alert.alert(
      'Üyeyi Çıkar',
      `${selectedMember.name} takımdan çıkarılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeShare(selectedMember.id);
              setShowOptionsModal(false);
              loadTeamMembers();
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Üye çıkarılamadı');
            }
          },
        },
      ]
    );
  };

  // Paylaşım fonksiyonları
  const handleCreateShareLink = async () => {
    if (!selectedFile) return;
    try {
      setProcessing(true);
      const response = await api.createShareLink(selectedFile.id, {
        expiresIn: shareExpiry,
        permission: sharePermission
      });
      setShareLink(response.shareUrl);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Paylaşım linki oluşturulamadı');
    } finally {
      setProcessing(false);
    }
  };

  const copyShareLink = async () => {
    if (shareLink) {
      await Clipboard.setStringAsync(shareLink);
      Alert.alert('Başarılı', 'Link panoya kopyalandı');
    }
  };

  const shareShareLink = async () => {
    if (shareLink) {
      try {
        await Share.share({
          message: shareLink,
          title: 'Dosya Paylaşımı',
        });
      } catch (error) {
        console.error('Paylaşım hatası:', error);
      }
    }
  };

  const renderMember = ({ item }: { item: TeamMember }) => {
    const roleInfo = ROLE_LABELS[item.role] || ROLE_LABELS.VIEWER;
    
    return (
      <TouchableOpacity
        style={styles.memberCard}
        onPress={() => {
          setSelectedMember(item);
          setShowOptionsModal(true);
        }}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={gradients.secondary as [string, string]}
          style={styles.avatarGradient}
        >
          <Text style={styles.avatarText}>
            {item.name?.charAt(0)?.toUpperCase() || 'U'}
          </Text>
        </LinearGradient>
        
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.name}</Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
        </View>
        
        <View style={[styles.roleBadge, { backgroundColor: `${roleInfo.color}20` }]}>
          <Text style={[styles.roleText, { color: roleInfo.color }]}>
            {roleInfo.label}
          </Text>
        </View>
      </TouchableOpacity>
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

  const renderFileItem = ({ item }: { item: TeamFile }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => openFileOptions(item)}
      activeOpacity={0.7}
    >
      <View style={styles.fileIconContainer}>
        <Ionicons 
          name={item.mimeType?.startsWith('image/') ? 'image' : 
                item.mimeType?.startsWith('video/') ? 'videocam' :
                item.mimeType?.startsWith('audio/') ? 'musical-notes' :
                item.mimeType === 'application/pdf' ? 'document-text' : 'document'} 
          size={24} 
          color={colors.primary} 
        />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
        <Text style={styles.fileMeta}>
          {formatFileSize(item.sizeBytes)} • {item.uploadedBy}
        </Text>
      </View>
      <View style={styles.fileActions}>
        {/* Üç nokta menü butonu */}
        <TouchableOpacity 
          style={styles.fileMenuBtn}
          onPress={() => openFileOptions(item)}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderFolderItem = ({ item }: { item: TeamFolder }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => setCurrentFolderId(item.id)}
      onLongPress={() => canDelete && handleDeleteFolder(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.fileIconContainer, { backgroundColor: `${colors.warning}20` }]}>
        <Ionicons name="folder" size={24} color={colors.warning} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>{item.createdBy}</Text>
      </View>
      {canDelete && (
        <TouchableOpacity 
          style={styles.fileDeleteBtn}
          onPress={() => handleDeleteFolder(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderJoinedFileItem = ({ item }: { item: TeamFile }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => openFileOptions(item)}
      activeOpacity={0.7}
    >
      <View style={styles.fileIconContainer}>
        <Ionicons 
          name={item.mimeType?.startsWith('image/') ? 'image' : 
                item.mimeType?.startsWith('video/') ? 'videocam' :
                item.mimeType?.startsWith('audio/') ? 'musical-notes' :
                item.mimeType === 'application/pdf' ? 'document-text' : 'document'} 
          size={24} 
          color={colors.primary} 
        />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
        <Text style={styles.fileMeta}>
          {formatFileSize(item.sizeBytes)} • {item.uploadedBy}
        </Text>
      </View>
      <View style={styles.fileActions}>
        {/* Üç nokta menü butonu */}
        <TouchableOpacity 
          style={styles.fileMenuBtn}
          onPress={() => openFileOptions(item)}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderJoinedFolderItem = ({ item }: { item: TeamFolder }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => {
        setJoinedCurrentFolderId(item.id);
        if (selectedJoinedTeam) {
          loadJoinedTeamFiles(selectedJoinedTeam.id, item.id);
        }
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.fileIconContainer, { backgroundColor: `${colors.warning}20` }]}>
        <Ionicons name="folder" size={24} color={colors.warning} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>{item.createdBy}</Text>
      </View>
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ekip</Text>
          
          {activeTab === 'members' ? (
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowInviteModal(true)}
            >
              <Ionicons name="person-add" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (activeTab === 'files' || activeTab === 'joined') && (selectedTeam || selectedJoinedTeam) ? (
            <View style={styles.headerActions}>
              {/* Klasör Oluştur */}
              <TouchableOpacity 
                style={styles.headerActionBtn}
                onPress={() => setShowNewFolderModal(true)}
              >
                <Ionicons name="folder-open" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              
              {/* Dosya Yükle */}
              <TouchableOpacity 
                style={styles.headerActionBtn}
                onPress={handleUploadFile}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Ionicons name="cloud-upload" size={20} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'members' && styles.tabItemActive]}
            onPress={() => setActiveTab('members')}
          >
            <Ionicons 
              name="people" 
              size={20} 
              color={activeTab === 'members' ? colors.primary : colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>
              Üyeler
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'files' && styles.tabItemActive]}
            onPress={() => setActiveTab('files')}
          >
            <Ionicons 
              name="folder" 
              size={20} 
              color={activeTab === 'files' ? colors.primary : colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>
              Ekibim
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabItem, activeTab === 'joined' && styles.tabItemActive]}
            onPress={() => setActiveTab('joined')}
          >
            <Ionicons 
              name="business" 
              size={20} 
              color={activeTab === 'joined' ? colors.primary : colors.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'joined' && styles.tabTextActive]}>
              Dahil
            </Text>
          </TouchableOpacity>
        </View>

        {/* Üyeler Tab */}
        {activeTab === 'members' && (
          <ScrollView contentContainerStyle={styles.listContent}>
            {/* Davet Ettiklerim */}
            <View style={styles.sectionHeader}>
              <Ionicons name="person-add" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Davet Ettiklerim</Text>
            </View>
            
            <FlatList
              data={members}
              keyExtractor={(item) => item.id}
              renderItem={renderMember}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptySectionContainer}>
                  <Text style={styles.emptySectionText}>Henüz kimseyi davet etmediniz</Text>
                  <TouchableOpacity 
                    style={styles.inviteButton}
                    onPress={() => setShowInviteModal(true)}
                  >
                    <Ionicons name="person-add" size={18} color={colors.primary} />
                    <Text style={styles.inviteButtonText}>Davet Gönder</Text>
                  </TouchableOpacity>
                </View>
              }
            />
            
            {/* Gönderdiğim Davetler */}
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Ionicons name="mail-outline" size={20} color={colors.warning} />
              <Text style={styles.sectionTitle}>Gönderdiğim Davetler</Text>
            </View>
            
            <FlatList
              data={sentInvites}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.inviteCard}>
                  <View style={styles.inviteIcon}>
                    <Ionicons name="mail" size={20} color={colors.warning} />
                  </View>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteName}>{item.email}</Text>
                    <Text style={styles.inviteRole}>
                      {item.teamName} • {item.role === 'OWNER' ? 'Sahip' : 
                       item.role === 'EDITOR' ? 'Editör' : 
                       item.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                    </Text>
                    <Text style={styles.inviteDate}>
                      {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.inviteDeleteBtn}
                    onPress={() => handleDeleteSentInvite(item.id)}
                  >
                    <Ionicons name="close" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              )}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptySectionContainer}>
                  <Text style={styles.emptySectionText}>Henüz davet göndermediniz</Text>
                </View>
              }
            />
            
            {/* Beni Davet Edenler */}
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Ionicons name="mail" size={20} color={colors.secondary} />
              <Text style={styles.sectionTitle}>Beni Davet Edenler</Text>
            </View>
            
            <FlatList
              data={pendingInvites}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.inviterCard}>
                  <View style={styles.inviterIcon}>
                    <Ionicons name="person" size={20} color={colors.secondary} />
                  </View>
                  <View style={styles.inviterInfo}>
                    <Text style={styles.inviterName}>{item.teamName}</Text>
                    <Text style={styles.inviterRole}>
                      {item.inviterName} tarafından {item.role === 'OWNER' ? 'sahip' : 
                       item.role === 'EDITOR' ? 'editör' : 
                       item.role === 'MEMBER' ? 'yardımcı' : 'görüntüleyici'} olarak davet edildi
                    </Text>
                  </View>
                </View>
              )}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptySectionContainer}>
                  <Text style={styles.emptySectionText}>Yeni davet yok</Text>
                </View>
              }
            />
          </ScrollView>
        )}

        {/* Ekibim Tab - Sadece kendi kurduğu ekipler */}
        {activeTab === 'files' && (
          <View style={{ flex: 1 }}>
            {/* Hiç kendi kurduğu ekip yoksa */}
            {teams.filter(team => team.role === 'OWNER').length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="people-outline" size={64} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyText}>Henüz kendi ekibiniz yok</Text>
                <Text style={styles.emptySubtext}>Kendi ekibinizi oluşturun ve ekip üyeleriyle dosya paylaşmaya başlayın</Text>
                <TouchableOpacity
                  style={[styles.createTeamBtn, { marginTop: spacing.lg }]}
                  onPress={() => setShowCreateTeamModal(true)}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.createTeamBtnText}>Yeni Ekip Oluştur</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Mevcut Ekip Göstergesi - sadece owner ekipleri arasında seçim */}
                <View style={styles.currentTeamHeader}>
                  <View style={styles.teamInfo}>
                    <Ionicons name="people" size={20} color={colors.primary} />
                    <View style={styles.teamDetails}>
                      <Text style={styles.teamNameLabel}>Kendi Ekibim</Text>
                      <Text style={styles.currentTeamName}>
                        {selectedTeam?.name || 'Ekip Seçilmedi'}
                      </Text>
                    </View>
                  </View>
                  {teams.filter(team => team.role === 'OWNER').length > 1 && (
                    <TouchableOpacity 
                      style={styles.changeTeamBtn}
                      onPress={() => setShowTeamSelector(true)}
                    >
                      <Text style={styles.changeTeamText}>Değiştir</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Ekip seçilmedi uyarısı */}
                {!selectedTeam || selectedTeam.role !== 'OWNER' ? (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconContainer}>
                      <Ionicons name="hand-left-outline" size={64} color={colors.warning} />
                    </View>
                    <Text style={styles.emptyText}>Lütfen kendi ekibinizi seçin</Text>
                    <Text style={styles.emptySubtext}>Dosya yüklemek için kendi kurduğunuz bir ekibi seçmelisiniz</Text>
                  </View>
                ) : (
                  <>
                    {/* Geri Butonu */}
                    {currentFolderId && (
                      <TouchableOpacity 
                        style={styles.backFolderBtn}
                        onPress={() => setCurrentFolderId(null)}
                      >
                        <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                        <Text style={styles.backFolderText}>Üst Klasöre Git</Text>
                      </TouchableOpacity>
                    )}

                    {filesLoading || uploading ? (
                      <View style={styles.loadingFiles}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        {uploading && <Text style={{ color: colors.textMuted, marginTop: 8 }}>Yükleniyor...</Text>}
                      </View>
                    ) : teamFiles.length === 0 && teamFolders.length === 0 ? (
                      <View style={styles.emptyContainer}>
                        <View style={styles.emptyIconContainer}>
                          <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
                        </View>
                        <Text style={styles.emptyText}>Henüz ekip dosyası yok</Text>
                        <Text style={styles.emptySubtext}>Header'daki butonlarla dosya veya klasör ekleyin</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={[...teamFolders.map(f => ({ ...f, type: 'folder' })), ...teamFiles.map(f => ({ ...f, type: 'file' }))]}
                        keyExtractor={(item) => `${item.type}-${item.id}`}
                        renderItem={({ item }) => 
                          item.type === 'folder' 
                            ? renderFolderItem({ item: item as TeamFolder })
                            : renderFileItem({ item: item as TeamFile })
                        }
                        contentContainerStyle={styles.listContent}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* Dahil Olduğum Ekipler Tab */}
        {activeTab === 'joined' && (
          <View style={{ flex: 1 }}>
            {!showJoinedTeamFiles ? (
              // Ekip Listesi Görünümü
              <ScrollView contentContainerStyle={styles.listContent}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="business" size={20} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Dahil Olduğum Ekipler</Text>
                </View>
                
                {joinedTeams.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconContainer}>
                      <Ionicons name="business-outline" size={48} color={colors.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>Dahil olduğunuz ekip yok</Text>
                    <Text style={styles.emptySubtext}>Bir ekibe davet edildiğinizde burada görünecek</Text>
                  </View>
                ) : (
                  joinedTeams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      style={styles.joinedTeamCard}
                      onPress={() => {
                        setSelectedJoinedTeam(team);
                        setShowJoinedTeamFiles(true);
                        loadJoinedTeamFiles(team.id, null);
                      }}
                    >
                      <View style={styles.joinedTeamIcon}>
                        <Ionicons name="business" size={24} color={colors.primary} />
                      </View>
                      <View style={styles.joinedTeamInfo}>
                        <Text style={styles.joinedTeamName}>{team.name}</Text>
                        <Text style={styles.joinedTeamRole}>
                          {team.role === 'EDITOR' ? 'Editör' : team.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            ) : (
              // Seçilen Ekibin Dosyaları Görünümü
              <View style={{ flex: 1 }}>
                {/* Ekip Başlığı ve Geri Butonu */}
                <View style={styles.currentTeamHeader}>
                  <TouchableOpacity 
                    style={styles.backToTeamsBtn}
                    onPress={() => {
                      setShowJoinedTeamFiles(false);
                      setSelectedJoinedTeam(null);
                      setJoinedCurrentFolderId(null);
                    }}
                  >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={styles.teamInfo}>
                    <Ionicons name="business" size={20} color={colors.primary} />
                    <View style={styles.teamDetails}>
                      <Text style={styles.teamNameLabel}>Ekip Dosyaları</Text>
                      <Text style={styles.currentTeamName}>
                        {selectedJoinedTeam?.name || 'Bilinmeyen Ekip'}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Ekipten Çıkış Butonu */}
                  <TouchableOpacity 
                    style={styles.leaveTeamBtn}
                    onPress={() => selectedJoinedTeam && handleLeaveTeam(selectedJoinedTeam.id)}
                  >
                    <Ionicons name="exit-outline" size={18} color={colors.error} />
                    <Text style={styles.leaveTeamText}>Çık</Text>
                  </TouchableOpacity>
                </View>

                {/* Geri Butonu - Alt klasörlerde */}
                {joinedCurrentFolderId && (
                  <TouchableOpacity 
                    style={styles.backFolderBtn}
                    onPress={() => setJoinedCurrentFolderId(null)}
                  >
                    <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                    <Text style={styles.backFolderText}>Üst Klasöre Git</Text>
                  </TouchableOpacity>
                )}

                {/* Dosya Listesi */}
                {joinedFilesLoading || uploading ? (
                  <View style={styles.loadingFiles}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    {uploading && <Text style={{ color: colors.textMuted, marginTop: 8 }}>Yükleniyor...</Text>}
                  </View>
                ) : joinedTeamFiles.length === 0 && joinedTeamFolders.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconContainer}>
                      <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>Henüz dosya yok</Text>
                    <Text style={styles.emptySubtext}>
                      {selectedJoinedTeam?.role !== 'VIEWER' 
                        ? 'Yukarıdaki butonlarla dosya veya klasör ekleyin' 
                        : 'Bu ekibe henüz dosya eklenmemiş'
                      }
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={[...joinedTeamFolders.map(f => ({ ...f, type: 'folder' })), ...joinedTeamFiles.map(f => ({ ...f, type: 'file' }))]}
                    keyExtractor={(item) => `${item.type}-${item.id}`}
                    renderItem={({ item }) => 
                      item.type === 'folder' 
                        ? renderJoinedFolderItem({ item: item as TeamFolder })
                        : renderJoinedFileItem({ item: item as TeamFile })
                    }
                    contentContainerStyle={styles.listContent}
                  />
                )}
              </View>
            )}
          </View>
        )}

        {/* Davet Modal */}
        <Modal visible={showInviteModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Üye Davet Et</Text>
              
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="E-posta adresi"
                  placeholderTextColor={colors.textMuted}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.roleLabel}>Rol Seçin</Text>
              <View style={styles.roleOptionsVertical}>
                {(['VIEWER', 'MEMBER', 'EDITOR'] as const).map((role) => {
                  const roleInfo = ROLE_LABELS[role];
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOptionVertical,
                        inviteRole === role && styles.roleOptionVerticalActive,
                        inviteRole === role && { borderColor: roleInfo.color }
                      ]}
                      onPress={() => setInviteRole(role)}
                    >
                      <View style={styles.roleOptionContent}>
                        <Text style={[
                          styles.roleOptionLabel,
                          inviteRole === role && { color: roleInfo.color }
                        ]}>
                          {roleInfo.label}
                        </Text>
                        <Text style={styles.roleOptionDesc}>
                          {roleInfo.description}
                        </Text>
                      </View>
                      {inviteRole === role && (
                        <Ionicons name="checkmark-circle" size={22} color={roleInfo.color} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setShowInviteModal(false)}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleInvite}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Davet Et</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Seçenekler Modal */}
        <Modal visible={showOptionsModal} transparent animationType="slide">
          <TouchableOpacity
            style={styles.bottomSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsModal(false)}
          >
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />
              
              {selectedMember && (
                <>
                  <View style={styles.selectedMemberInfo}>
                    <LinearGradient
                      colors={gradients.secondary as [string, string]}
                      style={styles.avatarGradientSmall}
                    >
                      <Text style={styles.avatarTextSmall}>
                        {selectedMember.name?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </LinearGradient>
                    <View>
                      <Text style={styles.selectedMemberName}>{selectedMember.name}</Text>
                      <Text style={styles.selectedMemberEmail}>{selectedMember.email}</Text>
                    </View>
                  </View>

                  <Text style={styles.bottomSheetLabel}>Rol Değiştir</Text>
                  {(['VIEWER', 'MEMBER', 'EDITOR'] as const).map((role) => {
                    const roleInfo = ROLE_LABELS[role];
                    const isActive = selectedMember.role === role;
                    
                    const iconName = role === 'EDITOR' ? 'pencil' : role === 'MEMBER' ? 'download' : 'eye';
                    
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.bottomSheetOption, isActive && styles.bottomSheetOptionActive]}
                        onPress={() => handleChangeRole(role)}
                      >
                        <View style={[styles.roleIcon, { backgroundColor: `${roleInfo.color}20` }]}>
                          <Ionicons 
                            name={iconName} 
                            size={18} 
                            color={roleInfo.color} 
                          />
                        </View>
                        <Text style={styles.bottomSheetOptionText}>{roleInfo.label}</Text>
                        {isActive && (
                          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.bottomSheetOption, styles.removeOption]}
                    onPress={handleRemoveMember}
                  >
                    <View style={[styles.roleIcon, { backgroundColor: `${colors.error}20` }]}>
                      <Ionicons name="person-remove" size={18} color={colors.error} />
                    </View>
                    <Text style={[styles.bottomSheetOptionText, { color: colors.error }]}>
                      Takımdan Çıkar
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Yeni Klasör Modal */}
        <Modal visible={showNewFolderModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Yeni Klasör</Text>
              
              <View style={styles.inputWrapper}>
                <Ionicons name="folder-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Klasör adı"
                  placeholderTextColor={colors.textMuted}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowNewFolderModal(false);
                    setNewFolderName('');
                  }}
                >
                  <Text style={styles.modalButtonCancel}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleCreateFolder}
                >
                  <LinearGradient
                    colors={gradients.primary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonConfirmText}>Oluştur</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Yeni Ekip Oluşturma Modal */}
        <Modal visible={showCreateTeamModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Yeni Ekip Oluştur</Text>
              
              <View style={styles.inputWrapper}>
                <Ionicons name="people-outline" size={20} color={colors.textMuted} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ekip adı"
                  placeholderTextColor={colors.textMuted}
                  value={newTeamName}
                  onChangeText={setNewTeamName}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setShowCreateTeamModal(false);
                    setNewTeamName('');
                  }}
                >
                  <Text style={styles.modalButtonCancel}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleCreateTeam}
                >
                  <LinearGradient
                    colors={gradients.primary as [string, string]}
                    style={styles.modalButtonGradient}
                  >
                    <Text style={styles.modalButtonConfirmText}>Oluştur</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Ekip Seçici Modal */}
        <Modal visible={showTeamSelector} transparent animationType="slide">
          <TouchableOpacity
            style={styles.bottomSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowTeamSelector(false)}
          >
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.bottomSheetTitle}>Kendi Ekibim Seç</Text>
              
              {teams.filter(team => team.role === 'OWNER').map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.bottomSheetOption, 
                    selectedTeam?.id === team.id && styles.bottomSheetOptionActive
                  ]}
                  onPress={() => {
                    setSelectedTeam(team);
                    setCurrentFolderId(null);
                    setShowTeamSelector(false);
                  }}
                >
                  <View style={[styles.roleIcon, { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons name="people" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bottomSheetOptionText}>{team.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {team.role === 'OWNER' ? 'Sahip' : team.role === 'EDITOR' ? 'Editör' : team.role === 'MEMBER' ? 'Yardımcı' : 'Görüntüleyici'}
                    </Text>
                  </View>
                  {selectedTeam?.id === team.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Dosya Seçenekleri Modal */}
        <Modal visible={showFileOptionsModal} transparent animationType="slide">
          <TouchableOpacity
            style={styles.bottomSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowFileOptionsModal(false)}
          >
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.bottomSheetTitle}>{selectedFile?.filename}</Text>
              
              {/* Yorum Yap */}
              <TouchableOpacity 
                style={styles.bottomSheetOption}
                onPress={() => {
                  setShowFileOptionsModal(false);
                  selectedFile && showFileComments(selectedFile);
                }}
              >
                <View style={[styles.roleIcon, { backgroundColor: `${colors.secondary}20` }]}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.secondary} />
                </View>
                <Text style={styles.bottomSheetOptionText}>Yorum Yap</Text>
              </TouchableOpacity>
              
              {/* İndir - VIEWER dışındaki roller için */}
              {((selectedTeam?.role === 'MEMBER' || selectedTeam?.role === 'EDITOR' || selectedTeam?.role === 'OWNER') ||
                (selectedJoinedTeam?.role === 'MEMBER' || selectedJoinedTeam?.role === 'EDITOR' || selectedJoinedTeam?.role === 'OWNER')) && (
                <TouchableOpacity
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    setShowFileOptionsModal(false);
                    if (selectedFile) handleDownloadFile(selectedFile);
                  }}
                >
                  <View style={[styles.roleIcon, { backgroundColor: `${colors.success}20` }]}>
                    <Ionicons name="download-outline" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.bottomSheetOptionText}>İndir</Text>
                </TouchableOpacity>
              )}
              
              {/* Önizle */}
              {selectedFile && canPreview(selectedFile.mimeType) && (
                <TouchableOpacity
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    setShowFileOptionsModal(false);
                    if (selectedFile) handlePreviewFile(selectedFile);
                  }}
                >
                  <View style={[styles.roleIcon, { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons name="eye-outline" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.bottomSheetOptionText}>Önizle</Text>
                </TouchableOpacity>
              )}
              
              {/* Paylaş */}
              <TouchableOpacity
                style={styles.bottomSheetOption}
                onPress={() => {
                  setShowFileOptionsModal(false);
                  setShowShareModal(true);
                }}
              >
                <View style={[styles.roleIcon, { backgroundColor: `${colors.warning}20` }]}>
                  <Ionicons name="share-outline" size={18} color={colors.warning} />
                </View>
                <Text style={styles.bottomSheetOptionText}>Paylaşım Linki Oluştur</Text>
              </TouchableOpacity>
              
              {/* Sil - Sadece EDITOR için */}
              {(selectedTeam?.role === 'EDITOR' || selectedJoinedTeam?.role === 'EDITOR') && (
                <TouchableOpacity
                  style={styles.bottomSheetOption}
                  onPress={() => {
                    setShowFileOptionsModal(false);
                    if (selectedFile) handleDeleteFile(selectedFile.id);
                  }}
                >
                  <View style={[styles.roleIcon, { backgroundColor: `${colors.error}20` }]}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </View>
                  <Text style={[styles.bottomSheetOptionText, { color: colors.error }]}>Sil</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Paylaşım Modal */}
        <Modal visible={showShareModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Dosya Paylaş</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: spacing.md }}>
                {selectedFile?.filename}
              </Text>
              
              {!shareLink ? (
                <>
                  {/* Süre seçimi */}
                  <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>Geçerlilik Süresi</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
                    {[
                      { value: '1h', label: '1 Saat' },
                      { value: '1d', label: '1 Gün' },
                      { value: '7d', label: '7 Gün' },
                      { value: '30d', label: '30 Gün' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.optionChip,
                          shareExpiry === opt.value && styles.optionChipActive
                        ]}
                        onPress={() => setShareExpiry(opt.value)}
                      >
                        <Text style={[
                          styles.optionChipText,
                          shareExpiry === opt.value && styles.optionChipTextActive
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* İzin türü */}
                  <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>İzin Türü</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      style={[
                        styles.optionChip,
                        { flex: 1 },
                        sharePermission === 'DOWNLOAD' && styles.optionChipActive
                      ]}
                      onPress={() => setSharePermission('DOWNLOAD')}
                    >
                      <Text style={[
                        styles.optionChipText,
                        sharePermission === 'DOWNLOAD' && styles.optionChipTextActive
                      ]}>
                        📥 İndirilebilir
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.optionChip,
                        { flex: 1 },
                        sharePermission === 'VIEW' && styles.optionChipActive
                      ]}
                      onPress={() => setSharePermission('VIEW')}
                    >
                      <Text style={[
                        styles.optionChipText,
                        sharePermission === 'VIEW' && styles.optionChipTextActive
                      ]}>
                        👁️ Sadece Görüntüle
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonCancel]}
                      onPress={() => setShowShareModal(false)}
                    >
                      <Text style={styles.modalButtonCancelText}>İptal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonConfirm]}
                      onPress={handleCreateShareLink}
                      disabled={processing}
                    >
                      <LinearGradient
                        colors={gradients.primary as [string, string]}
                        style={styles.modalButtonGradient}
                      >
                        {processing ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.modalButtonConfirmText}>Link Oluştur</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {/* Link gösterimi */}
                  <View style={styles.shareLinkContainer}>
                    <Text style={styles.shareLinkText} numberOfLines={2}>{shareLink}</Text>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
                    <TouchableOpacity
                      style={[styles.shareLinkBtn, { backgroundColor: `${colors.success}20` }]}
                      onPress={copyShareLink}
                    >
                      <Ionicons name="copy-outline" size={20} color={colors.success} />
                      <Text style={{ color: colors.success, marginLeft: 6 }}>Kopyala</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.shareLinkBtn, { backgroundColor: `${colors.primary}20` }]}
                      onPress={shareShareLink}
                    >
                      <Ionicons name="share-outline" size={20} color={colors.primary} />
                      <Text style={{ color: colors.primary, marginLeft: 6 }}>Paylaş</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel, { width: '100%' }]}
                    onPress={() => {
                      setShowShareModal(false);
                      setShareLink('');
                    }}
                  >
                    <Text style={styles.modalButtonCancelText}>Kapat</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>



        {/* Resim Önizleme Modal */}
        <Modal visible={showPreviewModal} transparent animationType="fade">
          <View style={styles.previewModalOverlay}>
            <TouchableOpacity
              style={styles.previewCloseBtn}
              onPress={() => setShowPreviewModal(false)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            
            {previewUrl ? (
              <Image
                source={{ uri: previewUrl }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <ActivityIndicator size="large" color="#fff" />
            )}
            
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => selectedFile && handleDownloadFile(selectedFile)}
              >
                <Ionicons name="download-outline" size={24} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 8 }}>İndir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewActionBtn}
                onPress={() => setShowShareModal(true)}
              >
                <Ionicons name="share-outline" size={24} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 8 }}>Paylaş</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.previewFileName}>{selectedFile?.filename}</Text>
          </View>
        </Modal>

        {/* Yorum Modal */}
        <Modal visible={showCommentsModal} transparent animationType="slide">
          <TouchableOpacity
            style={styles.bottomSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowCommentsModal(false)}
          >
            <TouchableOpacity
              style={[styles.bottomSheet, { maxHeight: '80%' }]}
              activeOpacity={1}
            >
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.bottomSheetTitle}>
                {selectedFile?.filename} - Yorumlar
              </Text>
              
              {commentsLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : (
                <ScrollView style={{ flex: 1, maxHeight: 400 }}>
                  {fileComments.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Henüz yorum yok</Text>
                      <Text style={styles.emptySubtext}>İlk yorumu siz yapın</Text>
                    </View>
                  ) : (
                    fileComments.map((comment) => (
                      <View key={comment.id} style={styles.commentCard}>
                        <View style={styles.commentHeader}>
                          <View style={styles.commentUserIcon}>
                            <Ionicons name="person" size={16} color={colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.commentUser}>{comment.user}</Text>
                            <Text style={styles.commentDate}>
                              {new Date(comment.createdAt).toLocaleDateString('tr-TR')}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.commentText}>{comment.comment}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
              
              {/* Yorum Ekleme */}
              <View style={styles.commentInputContainer}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Yorumunuzu yazın..."
                  placeholderTextColor={colors.textMuted}
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.commentSendBtn, { opacity: newComment.trim() ? 1 : 0.5 }]}
                  onPress={addFileComment}
                  disabled={!newComment.trim()}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  roleText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
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
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  createTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  createTeamBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  modalInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    marginLeft: spacing.sm,
  },
  roleLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  roleOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  roleOptionsVertical: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  roleOptionVertical: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleOptionVerticalActive: {
    borderWidth: 2,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  roleOptionContent: {
    flex: 1,
  },
  roleOptionLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  roleOptionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  roleOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  roleOptionActive: {
    borderWidth: 2,
  },
  roleOptionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalButtonCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
  },
  modalButtonPrimary: {
    backgroundColor: 'transparent',
  },
  modalButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  modalButtonText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
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
  selectedMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarGradientSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarTextSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  selectedMemberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  selectedMemberEmail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  bottomSheetLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bottomSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  bottomSheetOptionActive: {
    backgroundColor: colors.surface,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  bottomSheetOptionText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  roleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeOption: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  bottomSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  // Tab Bar Styles
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.bgDark,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  // Team Files Styles
  currentTeamHeader: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamDetails: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  teamNameLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentTeamName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  changeTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.primary}10`,
  },
  changeTeamText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  teamSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  teamSelectorText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  fileActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  fileActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileActionBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  fileActionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.primary,
  },
  joinedTeamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinedTeamIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  joinedTeamInfo: {
    flex: 1,
  },
  joinedTeamName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  joinedTeamRole: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  backFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
  },
  backFolderText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  loadingFiles: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  fileDeleteBtn: {
    padding: spacing.sm,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  optionChipText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  optionChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  shareLinkContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareLinkText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  shareLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  previewImage: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH - 40,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 30,
  },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.md,
  },
  previewFileName: {
    position: 'absolute',
    bottom: 50,
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.md,
  },
  // Yeni Stiller
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptySectionContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
  },
  emptySectionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: `${colors.primary}15`,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  inviteButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.primary,
  },
  inviterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviterIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.secondary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  inviterInfo: {
    flex: 1,
  },
  inviterName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  inviterRole: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  backToTeamsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  commentUserIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  commentUser: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  commentText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    maxHeight: 80,
  },
  commentSendBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.warning}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  inviteRole: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  inviteDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  inviteDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.error}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaveTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: `${colors.error}15`,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  leaveTeamText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.error,
  },
  fileMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.textSecondary}10`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonCancelText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  modalButtonConfirmContainer: {
    backgroundColor: colors.primary,
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

export default TeamScreen;
