import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Image,
  Alert,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { storage, getUser, removeToken, removeUser, saveUser } from '../utils/storage';
import { User, ActivityItem } from '../types';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { clearMasterKey } from '../crypto';

type RootStackParamList = {
  Login: undefined;
  Settings: undefined;
};

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const PLAN_OPTIONS = [
  { id: 'FREE', name: 'Başlangıç', storage: '1 GB', icon: 'star-outline' as const, color: colors.textMuted },
  { id: 'PRO', name: 'Pro', storage: '100 GB', icon: 'star' as const, color: colors.primary },
  { id: 'BUSINESS', name: 'İşletme', storage: '1 TB', icon: 'diamond' as const, color: colors.secondary },
];

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Aktivite Modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Profil Düzenleme Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Plan Değiştirme Modal
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Profil Fotoğrafı
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      // Backend'den güncel user bilgisi al (emailVerified gibi yeni alanlar için)
      try {
        const freshUserData = await api.getMe();
        await saveUser(freshUserData); // Storage'ı güncelle
        setUser(freshUserData);
      } catch (err) {
        // Backend'den alınamazsa storage'daki veriyi kullan
        const userData = await getUser();
        setUser(userData);
      }
      
      // Aktiviteleri yükle
      try {
        const activitiesResponse = await api.getActivities();
        const activitiesData = activitiesResponse?.activities || activitiesResponse || [];
        setActivities(Array.isArray(activitiesData) ? activitiesData : []);
        setUnreadCount(Array.isArray(activitiesData) ? activitiesData.filter((a: ActivityItem) => !a.isRead).length : 0);
      } catch {}
    } catch (error) {
      console.error('Kullanıcı verisi yüklenemedi:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleEditProfile = () => {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Hata', 'Kullanıcı adı boş olamaz');
      return;
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      Alert.alert('Hata', 'Geçerli bir e-posta adresi giriniz');
      return;
    }

    setIsUpdating(true);
    try {
      await api.updateProfile({ name: editName.trim(), email: editEmail.trim() });
      setUser(prev => prev ? { ...prev, name: editName.trim(), email: editEmail.trim() } : null);
      setShowEditModal(false);
      Alert.alert('Başarılı', 'Profil bilgileriniz güncellendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Profil güncellenemedi');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await api.resendVerification();
      Alert.alert('Başarılı', 'Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'E-posta gönderilemedi');
    }
  };

  const handleChangePlan = async (plan: 'FREE' | 'PRO' | 'BUSINESS') => {
    if (user?.plan === plan) {
      setShowPlanModal(false);
      return;
    }
    
    Alert.alert(
      'Plan Değiştir',
      `${PLAN_OPTIONS.find(p => p.id === plan)?.name} planına geçmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Değiştir',
          onPress: async () => {
            try {
              const response = await api.changePlan(plan);
              const updatedUser = { ...user, plan: plan };
              setUser(updatedUser as User);
              await saveUser(updatedUser as User);
              setShowPlanModal(false);
              Alert.alert('Başarılı', 'Planınız güncellendi');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Plan değiştirilemedi');
            }
          }
        }
      ]
    );
  };

  // Pending action ref - modal kapandıktan sonra çalıştırılacak
  const pendingPickerAction = useRef<'camera' | 'gallery' | null>(null);

  const handlePickProfilePhoto = (useCamera: boolean) => {
    console.log('handlePickProfilePhoto çağrıldı, useCamera:', useCamera);
    pendingPickerAction.current = useCamera ? 'camera' : 'gallery';
    setShowPhotoOptions(false);
  };

  const executePendingPickerAction = async () => {
    const action = pendingPickerAction.current;
    if (!action) return;
    
    pendingPickerAction.current = null;
    console.log('executePendingPickerAction başladı, action:', action);
    
    // Modal tamamen kapandıktan sonra biraz bekle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      let result: ImagePicker.ImagePickerResult;
      
      if (action === 'camera') {
        console.log('Kamera izni isteniyor...');
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        console.log('Kamera izni sonucu:', JSON.stringify(cameraPermission));
        if (!cameraPermission.granted) {
          Alert.alert('İzin Gerekli', 'Kamera kullanmak için izin vermeniz gerekiyor');
          return;
        }
        console.log('Kamera başlatılıyor...');
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        console.log('Kamera sonucu:', JSON.stringify(result));
      } else {
        console.log('Galeri izni isteniyor...');
        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        console.log('Galeri izni sonucu:', JSON.stringify(mediaPermission));
        if (!mediaPermission.granted) {
          Alert.alert('İzin Gerekli', 'Galeri erişimi için izin vermeniz gerekiyor');
          return;
        }
        console.log('Galeri başlatılıyor...');
        result = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        console.log('Galeri sonucu:', JSON.stringify(result));
      }

      if (!result.canceled && result.assets && result.assets[0]) {
        console.log('Fotoğraf seçildi, yükleniyor...');
        // Seçilen fotoğrafı hemen göster
        setLocalPhotoUri(result.assets[0].uri);
        await uploadProfilePhoto(result.assets[0]);
      }
    } catch (error) {
      console.error('Fotoğraf seçme hatası:', error);
      Alert.alert('Hata', 'Fotoğraf seçilemedi: ' + (error as Error).message);
    }
  };

  const uploadProfilePhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    setUploadingPhoto(true);
    try {
      console.log('Upload başlıyor, asset:', asset.uri);
      const formData = new FormData();
      formData.append('profilePhoto', {
        uri: asset.uri,
        name: 'profile.jpg',
        type: 'image/jpeg',
      } as any);

      console.log('FormData hazırlandı, API çağrısı yapılıyor...');
      const response = await api.uploadProfilePhoto(formData);
      console.log('API yanıtı:', JSON.stringify(response));
      
      // User state'ini güncelle
      if (response?.profilePhoto) {
        setUser(prev => prev ? { ...prev, profilePhoto: response.profilePhoto } : null);
        // Storage'ı da güncelle
        const updatedUser = { ...user, profilePhoto: response.profilePhoto };
        await saveUser(updatedUser as User);
        setLocalPhotoUri(null); // Local URI'yi temizle
        Alert.alert('Başarılı', 'Profil fotoğrafınız güncellendi');
      } else {
        console.log('Response içinde profilePhoto yok:', response);
        setLocalPhotoUri(null); // Hata durumunda da temizle
        Alert.alert('Hata', 'Fotoğraf yüklendi ancak URL alınamadı');
      }
    } catch (error: any) {
      console.error('Upload hatası:', error);
      setLocalPhotoUri(null); // Hata durumunda temizle
      Alert.alert('Hata', error.message || 'Fotoğraf yüklenemedi');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    setShowPhotoOptions(false);
    
    Alert.alert(
      'Fotoğrafı Kaldır',
      'Profil fotoğrafınızı kaldırmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeProfilePhoto();
              setUser(prev => prev ? { ...prev, profilePhoto: undefined } : null);
              const updatedUser = { ...user, profilePhoto: undefined };
              await saveUser(updatedUser as User);
              Alert.alert('Başarılı', 'Profil fotoğrafınız kaldırıldı');
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Fotoğraf kaldırılamadı');
            }
          }
        }
      ]
    );
  };

  const getPlanName = (plan: string | undefined) => {
    const planNames: { [key: string]: string } = {
      'FREE': 'Başlangıç',
      'PRO': 'Pro',
      'BUSINESS': 'İşletme'
    };
    return planNames[plan || 'FREE'] || plan || 'Başlangıç';
  };

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            // Şifreleme bilgilerini temizle
            await storage.clearEncryptionCredentials();
            clearMasterKey();
            
            await removeToken();
            await removeUser();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const formatActivityTime = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return time.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const getActivityIcon = (type: string): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
    const icons: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
      upload: { icon: 'cloud-upload', color: colors.success },
      download: { icon: 'cloud-download', color: colors.info },
      share: { icon: 'share-social', color: colors.secondary },
      delete: { icon: 'trash', color: colors.error },
      rename: { icon: 'pencil', color: colors.warning },
      restore: { icon: 'refresh', color: colors.success },
    };
    return icons[type] || { icon: 'ellipse', color: colors.textMuted };
  };

  const renderActivityItem = ({ item }: { item: ActivityItem }) => {
    const { icon, color } = getActivityIcon(item.type);
    
    return (
      <View style={[styles.activityItem, !item.isRead && styles.activityItemUnread]}>
        <View style={[styles.activityIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={styles.activityInfo}>
          <Text style={styles.activityText}>
            <Text style={styles.activityActor}>{item.actorName}</Text>
            {' '}{item.description || item.type}{' '}
            <Text style={styles.activityFile}>{item.fileName}</Text>
          </Text>
          <Text style={styles.activityTime}>{formatActivityTime(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
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
          <Text style={styles.headerTitle}>Profil</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile Card */}
          <View style={styles.profileCard}>
            <View style={styles.profileCardHeader}>
              <TouchableOpacity 
                style={styles.avatarContainer}
                onPress={() => setShowPhotoOptions(true)}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <View style={styles.avatarLoading}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    {localPhotoUri && (
                      <Image 
                        source={{ uri: localPhotoUri }} 
                        style={[styles.avatar, { position: 'absolute', opacity: 0.5 }]}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                ) : (localPhotoUri || user?.profilePhoto) ? (
                  <Image 
                    source={{ uri: localPhotoUri || user?.profilePhoto }} 
                    style={styles.avatar}
                    resizeMode="cover"
                    onError={(e) => {
                      console.log('Profil fotoğrafı yüklenemedi:', e.nativeEvent.error);
                      console.log('Yüklenmeye çalışılan URL:', localPhotoUri || user?.profilePhoto);
                    }}
                    onLoad={() => console.log('Profil fotoğrafı başarıyla yüklendi:', localPhotoUri || user?.profilePhoto)}
                  />
                ) : (
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.avatarGradient}
                  >
                    <Text style={styles.avatarText}>
                      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                )}
                <View style={styles.editAvatarBadge}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
              
              <View style={styles.profileInfo}>
                <Text style={styles.userName}>{user?.name || 'Kullanıcı'}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
                <View style={styles.planBadge}>
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.planBadgeGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="diamond" size={14} color="#fff" />
                    <Text style={styles.planText}>{getPlanName(user?.plan)}</Text>
                  </LinearGradient>
                </View>
              </View>
            </View>

            {/* Kullanıcı Bilgileri */}
            <View style={styles.userInfoSection}>
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="person-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Kullanıcı Adı</Text>
                  <Text style={styles.infoValue}>{user?.name || '-'}</Text>
                </View>
              </View>
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="mail-outline" size={18} color={colors.info} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>E-posta</Text>
                  <Text style={styles.infoValue}>{user?.email || '-'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={user?.emailVerified ? colors.success : colors.error} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>E-posta Durumu</Text>
                  <Text style={[styles.infoValue, { color: user?.emailVerified ? colors.success : colors.error }]}>
                    {user?.emailVerified ? 'Doğrulanmış' : 'Doğrulanmamış'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="calendar-outline" size={18} color={colors.success} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Kayıt Tarihi</Text>
                  <Text style={styles.infoValue}>
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.warning} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>2FA Durumu</Text>
                  <Text style={[styles.infoValue, { color: user?.twoFactorEnabled ? colors.success : colors.textMuted }]}>
                    {user?.twoFactorEnabled ? 'Aktif' : 'Pasif'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              {/* E-posta Doğrulama Butonu */}
              {!user?.emailVerified && (
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={handleResendVerification}
                >
                  <Ionicons name="mail-outline" size={18} color={colors.warning} />
                  <Text style={[styles.actionButtonText, { color: colors.warning }]}>E-posta Doğrula</Text>
                </TouchableOpacity>
              )}
              
              {/* Plan Değiştir Butonu */}
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => setShowPlanModal(true)}
              >
                <Ionicons name="diamond-outline" size={18} color={colors.secondary} />
                <Text style={[styles.actionButtonText, { color: colors.secondary }]}>Plan Değiştir</Text>
              </TouchableOpacity>
            </View>

            {/* Düzenle Butonu */}
            <TouchableOpacity style={styles.editProfileButton} onPress={handleEditProfile}>
              <LinearGradient
                colors={gradients.secondary as [string, string]}
                style={styles.editProfileButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.editProfileButtonText}>Profili Düzenle</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Plan Change Modal */}
        <Modal visible={showPlanModal} transparent animationType="fade">
          <View style={styles.planModalOverlay}>
            <View style={styles.planModalContent}>
              <View style={styles.planModalHeader}>
                <Text style={styles.planModalTitle}>Plan Seçin</Text>
                <TouchableOpacity onPress={() => setShowPlanModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              
              {PLAN_OPTIONS.map((plan) => (
                <TouchableOpacity 
                  key={plan.id}
                  style={[
                    styles.planOption,
                    user?.plan === plan.id && styles.planOptionActive
                  ]}
                  onPress={() => handleChangePlan(plan.id as 'FREE' | 'PRO' | 'BUSINESS')}
                >
                  <View style={[styles.planIcon, { backgroundColor: `${plan.color}20` }]}>
                    <Ionicons name={plan.icon} size={24} color={plan.color} />
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planStorage}>{plan.storage}</Text>
                  </View>
                  {user?.plan === plan.id && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* Activity Modal */}
        <Modal visible={showActivityModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.activityModal}>
              <View style={styles.activityModalHeader}>
                <Text style={styles.activityModalTitle}>Etkinlikler</Text>
                <TouchableOpacity onPress={() => setShowActivityModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              
              <FlatList
                data={activities}
                keyExtractor={(item) => item.id}
                renderItem={renderActivityItem}
                contentContainerStyle={styles.activityList}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
                    <Text style={styles.emptyText}>Etkinlik yok</Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>

        {/* Edit Profile Modal */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.editModal}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Profili Düzenle</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.editForm}>
                <View style={styles.editInputGroup}>
                  <Text style={styles.editInputLabel}>Kullanıcı Adı</Text>
                  <View style={styles.editInputContainer}>
                    <Ionicons name="person-outline" size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.editInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Kullanıcı adınız"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
                
                <View style={styles.editInputGroup}>
                  <Text style={styles.editInputLabel}>E-posta</Text>
                  <View style={styles.editInputContainer}>
                    <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.editInput}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder="E-posta adresiniz"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>
              
              <View style={styles.editModalActions}>
                <TouchableOpacity
                  style={styles.editCancelButton}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.editCancelButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editSaveButton}
                  onPress={handleSaveProfile}
                  disabled={isUpdating}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.editSaveButtonGradient}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.editSaveButtonText}>
                      {isUpdating ? 'Kaydediliyor...' : 'Kaydet'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Profile Photo Options Modal */}
        <Modal 
          visible={showPhotoOptions} 
          transparent 
          animationType="fade"
          onRequestClose={() => setShowPhotoOptions(false)}
          onDismiss={() => {
            console.log('Modal kapandı, pending action kontrol ediliyor...');
            executePendingPickerAction();
          }}
        >
          <View style={styles.photoModalOverlay}>
            <TouchableOpacity 
              style={styles.photoModalBackdrop}
              activeOpacity={1}
              onPress={() => setShowPhotoOptions(false)}
            />
            <View style={styles.photoModalContent}>
              <Text style={styles.photoModalTitle}>Profil Fotoğrafı</Text>
              
              <TouchableOpacity 
                style={styles.photoOption}
                onPress={() => {
                  console.log('Galeriden Seç tıklandı');
                  handlePickProfilePhoto(false);
                }}
              >
                <View style={[styles.photoOptionIcon, { backgroundColor: `${colors.primary}20` }]}>
                  <Ionicons name="images" size={24} color={colors.primary} />
                </View>
                <Text style={styles.photoOptionText}>Galeriden Seç</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.photoOption}
                onPress={() => {
                  console.log('Fotoğraf Çek tıklandı');
                  handlePickProfilePhoto(true);
                }}
              >
                <View style={[styles.photoOptionIcon, { backgroundColor: `${colors.info}20` }]}>
                  <Ionicons name="camera" size={24} color={colors.info} />
                </View>
                <Text style={styles.photoOptionText}>Fotoğraf Çek</Text>
              </TouchableOpacity>
              
              {user?.profilePhoto && (
                <TouchableOpacity 
                  style={styles.photoOption}
                  onPress={handleRemoveProfilePhoto}
                >
                  <View style={[styles.photoOptionIcon, { backgroundColor: `${colors.error}20` }]}>
                    <Ionicons name="trash" size={24} color={colors.error} />
                  </View>
                  <Text style={[styles.photoOptionText, { color: colors.error }]}>Fotoğrafı Kaldır</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={styles.photoModalCancel}
                onPress={() => setShowPhotoOptions(false)}
              >
                <Text style={styles.photoModalCancelText}>İptal</Text>
              </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgLight,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.bgDark,
  },
  userName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  planBadge: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  planBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  planText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  userInfoSection: {
    width: '100%',
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  verifyButtonText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  editProfileButton: {
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  editProfileButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  editProfileButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  planModalOverlay: {
    flex: 1,
    backgroundColor: colors.bgDarker,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  planModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  planModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgDark,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planOptionActive: {
    borderColor: colors.success,
    backgroundColor: `${colors.success}10`,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  planStorage: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.error}15`,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.error}30`,
  },
  logoutText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
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
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  activityModal: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
  },
  activityModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  activityList: {
    padding: spacing.md,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityItemUnread: {
    backgroundColor: `${colors.primary}10`,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  activityText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  activityActor: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  activityFile: {
    fontWeight: '500',
    color: colors.primary,
  },
  activityTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  editModal: {
    backgroundColor: colors.bgDarker,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  editForm: {
    marginBottom: spacing.lg,
  },
  editInputGroup: {
    marginBottom: spacing.md,
  },
  editInputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  editInput: {
    flex: 1,
    height: 48,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  editCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editCancelButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  editSaveButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  editSaveButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editSaveButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  // Photo Modal Styles
  avatarLoading: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  photoModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  photoModalContent: {
    backgroundColor: colors.bgDark,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photoModalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  photoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  photoOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoOptionText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  photoModalCancel: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  photoModalCancelText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default ProfileScreen;
