import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { 
  storage,
} from '../utils/storage';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { api } from '../services/api';

// Güvenli depolama anahtarları (LoginScreen ile aynı)
const SECURE_EMAIL_KEY = 'cloudyone_saved_email';
const SECURE_PASSWORD_KEY = 'cloudyone_saved_password';

type RootStackParamList = {
  ChangePassword: undefined;
  TwoFactor: undefined;
};

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SettingItem {
  icon: string;
  label: string;
  color: string;
  type: 'switch' | 'navigate' | 'info';
  value?: boolean | string;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  subtitle?: string;
}

interface SettingsSection {
  title: string;
  items: SettingItem[];
}

// Çöp kutusu otomatik silme seçenekleri
const TRASH_DELETE_OPTIONS = [
  { label: '7 gün sonra', value: 7 },
  { label: '14 gün sonra', value: 14 },
  { label: '30 gün sonra', value: 30 },
  { label: '60 gün sonra', value: 60 },
  { label: '90 gün sonra', value: 90 },
];

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Tercih ayarları
  const [trashAutoDeleteDays, setTrashAutoDeleteDays] = useState(30);
  const [largeFileWarning, setLargeFileWarning] = useState(true);
  const [shareLogsEnabled, setShareLogsEnabled] = useState(true);
  const [trashPickerVisible, setTrashPickerVisible] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    // Önce AsyncStorage'dan yükle
    const days = await storage.getTrashAutoDeleteDays();
    const largeFile = await storage.getLargeFileWarning();
    const shareLogs = await storage.getShareLogsEnabled();
    setTrashAutoDeleteDays(days);
    setLargeFileWarning(largeFile);
    setShareLogsEnabled(shareLogs);
    
    // Backend'den güncel tercihleri al
    try {
      const user = await api.getMe();
      if (user.trackShareLinks !== undefined) {
        setShareLogsEnabled(user.trackShareLinks);
        await storage.setShareLogsEnabled(user.trackShareLinks);
      }
      if (user.warnLargeFiles !== undefined) {
        setLargeFileWarning(user.warnLargeFiles);
        await storage.setLargeFileWarning(user.warnLargeFiles);
      }
    } catch (err) {
      console.error('Tercihler yüklenemedi:', err);
    }
  };

  const handleTrashAutoDeleteChange = async (days: number) => {
    setTrashAutoDeleteDays(days);
    await storage.setTrashAutoDeleteDays(days);
    setTrashPickerVisible(false);
  };

  const handleLargeFileWarningChange = async (value: boolean) => {
    setLargeFileWarning(value);
    await storage.setLargeFileWarning(value);
    
    // Backend'e kaydet
    try {
      await api.updatePreferences({ warnLargeFiles: value });
    } catch (err) {
      console.error('Tercih kaydedilemedi:', err);
    }
  };

  const handleShareLogsChange = async (value: boolean) => {
    setShareLogsEnabled(value);
    await storage.setShareLogsEnabled(value);
    
    // Backend'e kaydet
    try {
      await api.updatePreferences({ trackShareLinks: value });
    } catch (err) {
      console.error('Tercih kaydedilemedi:', err);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabı Sil',
      'Hesabınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve tüm dosyalarınız kalıcı olarak silinecektir.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Devam Et',
          style: 'destructive',
          onPress: () => setDeleteModalVisible(true),
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Hata', 'Lütfen şifrenizi girin.');
      return;
    }

    setDeleteLoading(true);
    try {
      await api.deleteAccount(deletePassword);
      await storage.clearAll();
      setDeleteModalVisible(false);
      Alert.alert(
        'Hesap Silindi',
        'Hesabınız başarıyla silindi.',
        [
          {
            text: 'Tamam',
            onPress: () => {
              // Login ekranına yönlendir
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' as never }],
              });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Hesap silinirken bir hata oluştu.');
    } finally {
      setDeleteLoading(false);
      setDeletePassword('');
    }
  };

  const settingsSections: SettingsSection[] = [
    {
      title: 'Güvenlik',
      items: [
        {
          icon: 'key',
          label: 'Şifre Değiştir',
          color: colors.warning,
          type: 'navigate',
          onPress: () => navigation.navigate('ChangePassword'),
        },
        {
          icon: 'shield-checkmark',
          label: 'İki Faktörlü Doğrulama',
          color: colors.info,
          type: 'navigate',
          onPress: () => navigation.navigate('TwoFactor'),
        },
        {
          icon: 'finger-print',
          label: 'Hızlı Giriş',
          color: colors.success,
          type: 'info',
          value: 'Aktif',
          subtitle: 'Şifreniz cihazınızın "Parolalar" bölümüne kaydedilir. Giriş yaparken Face ID/Touch ID ile otomatik doldurulur.',
        },
      ],
    },
    {
      title: 'Bildirimler',
      items: [
        {
          icon: 'notifications',
          label: 'Bildirimler',
          color: colors.secondary,
          type: 'switch',
          value: notificationsEnabled,
          onValueChange: setNotificationsEnabled,
        },
      ],
    },
    {
      title: 'Tercihler',
      items: [
        {
          icon: 'trash',
          label: 'Çöp Kutusu Otomatik Silme',
          color: colors.warning,
          type: 'navigate',
          value: TRASH_DELETE_OPTIONS.find(o => o.value === trashAutoDeleteDays)?.label || '30 gün sonra',
          onPress: () => setTrashPickerVisible(true),
          subtitle: 'Çöp kutusundaki dosyalar seçilen süreyi aşınca kalıcı silinir',
        },
        {
          icon: 'warning',
          label: 'Büyük dosyalar için uyarı göster',
          color: colors.error,
          type: 'switch',
          value: largeFileWarning,
          onValueChange: handleLargeFileWarningChange,
          subtitle: '500 MB üzerindeki dosyalarda ek onay iste',
        },
        {
          icon: 'analytics',
          label: 'Paylaşım loglarını sakla',
          color: colors.info,
          type: 'switch',
          value: shareLogsEnabled,
          onValueChange: handleShareLogsChange,
          subtitle: 'Link tıklamalarını istatistikler için sakla',
        },
      ],
    },
    {
      title: 'Hakkında',
      items: [
        {
          icon: 'information-circle',
          label: 'Uygulama Hakkında',
          color: colors.textMuted,
          type: 'info',
          value: 'Versiyon 1.0.0',
        },
        {
          icon: 'document-text',
          label: 'Gizlilik Politikası',
          color: colors.fileDoc,
          type: 'navigate',
          onPress: () => Alert.alert(
            'Gizlilik Politikası',
            'CloudyOne Gizlilik Politikası\n\n' +
            '1. Veri Toplama\n' +
            'Uygulamamız sadece hizmet sunumu için gerekli verileri toplar: e-posta adresi, şifre (şifrelenmiş) ve yüklediğiniz dosyalar.\n\n' +
            '2. Veri Güvenliği\n' +
            'Tüm verileriniz AES-256 şifreleme ile korunur. Şifreleriniz bcrypt ile hashlenir.\n\n' +
            '3. Veri Paylaşımı\n' +
            'Verileriniz üçüncü taraflarla paylaşılmaz, satılmaz veya kiralanmaz.\n\n' +
            '4. Veri Silme\n' +
            'Hesabınızı istediğiniz zaman silebilir, tüm verilerinizin kalıcı olarak silinmesini sağlayabilirsiniz.\n\n' +
            '5. İletişim\n' +
            'Sorularınız için: destek@cloudyone.com',
            [{ text: 'Tamam' }]
          ),
        },
        {
          icon: 'help-circle',
          label: 'Yardım & Destek',
          color: colors.info,
          type: 'navigate',
          onPress: () => Alert.alert(
            'Yardım & Destek',
            'CloudyOne Destek Merkezi\n\n' +
            '📧 E-posta Desteği\n' +
            'destek@cloudyone.com\n\n' +
            '⏰ Yanıt Süresi\n' +
            'Genellikle 24 saat içinde yanıt verilir.\n\n' +
            '❓ Sık Sorulan Sorular\n\n' +
            '• Dosya yükleme limiti nedir?\n' +
            '  Free: 1GB, Pro: 100GB, Business: 1TB\n\n' +
            '• Dosyalarım güvende mi?\n' +
            '  Evet, tüm dosyalar şifrelenir.\n\n' +
            '• Şifremi unuttum?\n' +
            '  Giriş ekranında "Şifremi Unuttum" seçeneğini kullanın.\n\n' +
            '• Hesabımı nasıl silerim?\n' +
            '  Ayarlar > Hesabımı Sil',
            [{ text: 'Tamam' }]
          ),
        },
      ],
    },
    {
      title: 'Tehlikeli Bölge',
      items: [
        {
          icon: 'trash',
          label: 'Hesabımı Sil',
          color: colors.error,
          type: 'navigate',
          onPress: handleDeleteAccount,
          subtitle: 'Bu işlem geri alınamaz',
        },
      ],
    },
  ];

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
          <Text style={styles.headerTitle}>Ayarlar</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {settingsSections.map((section, sectionIndex) => (
            <View key={sectionIndex} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionContent}>
                {section.items.map((item, itemIndex) => (
                  <TouchableOpacity
                    key={itemIndex}
                    style={[
                      styles.settingItem,
                      itemIndex < section.items.length - 1 && styles.settingItemBorder,
                    ]}
                    onPress={item.type === 'navigate' ? item.onPress : undefined}
                    disabled={item.type !== 'navigate' || item.disabled}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
                      <Ionicons name={item.icon as any} size={22} color={item.color} />
                    </View>
                    <View style={styles.settingInfo}>
                      <Text style={[styles.settingLabel, item.disabled && styles.disabledText]}>
                        {item.label}
                      </Text>
                      {item.subtitle && (
                        <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                      )}
                    </View>
                    {item.type === 'switch' && (
                      <Switch
                        value={typeof item.value === 'boolean' ? item.value : false}
                        onValueChange={item.onValueChange}
                        disabled={item.disabled}
                        trackColor={{ false: colors.surface, true: `${colors.primary}60` }}
                        thumbColor={typeof item.value === 'boolean' && item.value ? colors.primary : colors.textMuted}
                      />
                    )}
                    {item.type === 'navigate' && (
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    )}
                    {item.type === 'info' && (
                      <Text style={styles.infoValue}>{item.value}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={48} color={colors.error} />
              <Text style={styles.modalTitle}>Hesabı Sil</Text>
              <Text style={styles.modalDescription}>
                Bu işlem geri alınamaz. Tüm dosyalarınız, klasörleriniz ve hesap bilgileriniz kalıcı olarak silinecektir.
              </Text>
            </View>

            <Text style={styles.inputLabel}>Onaylamak için şifrenizi girin:</Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="Şifreniz"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeletePassword('');
                }}
                disabled={deleteLoading}
              >
                <Text style={styles.cancelButtonText}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={confirmDeleteAccount}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteButtonText}>Hesabı Sil</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trash Auto Delete Picker Modal */}
      <Modal
        visible={trashPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTrashPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable} 
            activeOpacity={1} 
            onPress={() => setTrashPickerVisible(false)}
          />
          <View style={styles.pickerModalContent}>
            <Text style={styles.pickerTitle}>Çöp Kutusu Otomatik Silme</Text>
            <Text style={styles.pickerSubtitle}>
              Çöp kutusundaki dosyalar seçilen süreyi aşınca kalıcı silinir
            </Text>
            {TRASH_DELETE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.pickerOption,
                  trashAutoDeleteDays === option.value && styles.pickerOptionSelected,
                ]}
                onPress={() => handleTrashAutoDeleteChange(option.value)}
              >
                <Text style={[
                  styles.pickerOptionText,
                  trashAutoDeleteDays === option.value && styles.pickerOptionTextSelected,
                ]}>
                  {option.label}
                </Text>
                {trashAutoDeleteDays === option.value && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: spacing.xs,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  settingSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  disabledText: {
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.error,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  passwordInput: {
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: colors.error,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pickerModalContent: {
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  pickerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  pickerOptionSelected: {
    backgroundColor: `${colors.primary}20`,
  },
  pickerOptionText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  pickerOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});

export default SettingsScreen;
