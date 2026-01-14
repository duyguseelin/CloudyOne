import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

interface UserInfo {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  storageUsed: number;
  storageLimit: number;
  plan?: string;
  twoFactorEnabled?: boolean;
}

const UserInfoScreen: React.FC = () => {
  const navigation = useNavigation();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const response = await api.getProfile() as any;
      const userData = response.user || response;
      setUser(userData);
      setEditName(userData.name || '');
    } catch (error) {
      console.error('Kullanıcı bilgileri yüklenemedi:', error);
      Alert.alert('Hata', 'Bilgiler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      Alert.alert('Hata', 'İsim boş olamaz');
      return;
    }

    setSaving(true);
    try {
      await api.updateProfile({ name: editName.trim() });
      setUser((prev) => prev ? { ...prev, name: editName.trim() } : null);
      setEditModal(false);
      Alert.alert('Başarılı', 'İsminiz güncellendi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Güncelleme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatStorage = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || 'U';
  };

  const storagePercentage = user 
    ? Math.min((user.storageUsed / user.storageLimit) * 100, 100) 
    : 0;

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Hesap Bilgileri</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={gradients.primary as [string, string]}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>
                {getInitials(user?.name, user?.email)}
              </Text>
            </LinearGradient>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{user?.name || 'İsim belirtilmemiş'}</Text>
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => setEditModal(true)}
              >
                <Ionicons name="pencil" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>

          {/* Storage Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="cloud" size={24} color={colors.primary} />
              <Text style={styles.cardTitle}>Depolama Alanı</Text>
            </View>
            <View style={styles.storageBar}>
              <LinearGradient
                colors={gradients.primary as [string, string]}
                style={[styles.storageProgress, { width: `${storagePercentage}%` }]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
            </View>
            <View style={styles.storageInfo}>
              <Text style={styles.storageText}>
                {formatStorage(user?.storageUsed || 0)} / {formatStorage(user?.storageLimit || 0)}
              </Text>
              <Text style={styles.storagePercent}>{storagePercentage.toFixed(1)}%</Text>
            </View>
          </View>

          {/* Info Cards */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Hesap Detayları</Text>
            
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Kayıt Tarihi</Text>
                <Text style={styles.infoValue}>{formatDate(user?.createdAt || '')}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="diamond-outline" size={20} color={colors.warning} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Plan</Text>
                <Text style={styles.infoValue}>{user?.plan || '-'}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons 
                  name={user?.twoFactorEnabled ? "shield-checkmark" : "shield-outline"} 
                  size={20} 
                  color={user?.twoFactorEnabled ? colors.success : colors.textMuted} 
                />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>İki Faktörlü Doğrulama</Text>
                <Text style={[styles.infoValue, { color: user?.twoFactorEnabled ? colors.success : colors.warning }]}>
                  {user?.twoFactorEnabled ? 'Aktif' : 'Kapalı'}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => (navigation as any).navigate('ChangePassword')}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.warning}20` }]}>
                <Ionicons name="key-outline" size={20} color={colors.warning} />
              </View>
              <Text style={styles.actionText}>Şifre Değiştir</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => (navigation as any).navigate('Settings')}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="settings-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.actionText}>Ayarlar</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Edit Name Modal */}
        <Modal visible={editModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>İsmi Düzenle</Text>
              
              <View style={styles.modalInput}>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="Adınız Soyadınız"
                  placeholderTextColor={colors.textMuted}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setEditModal(false)}
                >
                  <Text style={styles.modalButtonText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleSaveName}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <LinearGradient
                      colors={gradients.primary as [string, string]}
                      style={styles.modalButtonGradient}
                    >
                      <Text style={styles.modalButtonTextPrimary}>Kaydet</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userEmail: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  storageBar: {
    height: 8,
    backgroundColor: colors.bgDark,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  storageProgress: {
    height: '100%',
    borderRadius: 4,
  },
  storageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  storagePercent: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 40,
    height: 40,
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
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  actionsSection: {
    marginTop: spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  actionText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
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
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalTextInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    padding: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  modalButtonGradient: {
    width: '100%',
    paddingVertical: spacing.md,
    alignItems: 'center',
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
});

export default UserInfoScreen;
