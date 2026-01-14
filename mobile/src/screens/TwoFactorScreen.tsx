import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { api } from '../services/api';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function TwoFactorScreen({ navigation }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await api.get2FAStatus();
      setEnabled((response as any).enabled || false);
    } catch (error) {
      console.error('2FA durumu alınamadı:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    try {
      setLoading(true);
      const response = await api.enable2FA();
      setQrCode((response as any).qrCode || '');
      setSecret((response as any).secret || '');
      setShowSetup(true);
    } catch (error: any) {
      Alert.alert('Hata', error.message || '2FA etkinleştirilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      Alert.alert('Hata', '6 haneli kodu girin');
      return;
    }

    setVerifying(true);
    try {
      await api.verify2FA(verifyCode);
      setEnabled(true);
      setShowSetup(false);
      Alert.alert('Başarılı', '2FA başarıyla etkinleştirildi');
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Kod doğrulanamadı');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = () => {
    Alert.alert(
      'İki Faktörlü Doğrulamayı Kapat',
      'Bu işlem hesabınızı daha az güvenli hale getirecektir. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await (api as any).disable2FA('000000'); // Placeholder, gerçek uygulamada kod istenmeli
              setEnabled(false);
              Alert.alert('Bilgi', '2FA kapatıldı');
            } catch (error: any) {
              Alert.alert('Hata', error.message || '2FA kapatılamadı');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

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
          <Text style={styles.headerTitle}>İki Faktörlü Doğrulama</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {showSetup ? (
            // Setup View
            <View style={styles.setupContainer}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={gradients.primary as [string, string]}
                  style={styles.iconGradient}
                >
                  <Ionicons name="qr-code" size={40} color="#fff" />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Authenticator Uygulamasını Ayarla</Text>
              <Text style={styles.subtitle}>
                Google Authenticator veya benzeri bir uygulama ile QR kodunu tarayın
              </Text>

              {/* QR Code */}
              {qrCode ? (
                <View style={styles.qrContainer}>
                  <Image
                    source={{ uri: qrCode }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
              ) : null}

              {/* Secret Key */}
              <View style={styles.secretContainer}>
                <Text style={styles.secretLabel}>Manuel Giriş Anahtarı:</Text>
                <View style={styles.secretBox}>
                  <Text style={styles.secretText} selectable>{secret}</Text>
                </View>
              </View>

              {/* Verification Input */}
              <View style={styles.verifySection}>
                <Text style={styles.label}>Doğrulama Kodu</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    value={verifyCode}
                    onChangeText={setVerifyCode}
                    keyboardType="numeric"
                    maxLength={6}
                    textAlign="center"
                  />
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowSetup(false)}
                >
                  <Text style={styles.cancelButtonText}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.verifyButton}
                  onPress={handleVerify}
                  disabled={verifying}
                >
                  <LinearGradient
                    colors={gradients.primary as [string, string]}
                    style={styles.verifyButtonGradient}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Doğrula</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Status View
            <View style={styles.statusContainer}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={enabled ? ['#10b981', '#059669'] as [string, string] : gradients.accent as [string, string]}
                  style={styles.iconGradient}
                >
                  <Ionicons 
                    name={enabled ? "shield-checkmark" : "shield-outline"} 
                    size={48} 
                    color="#fff" 
                  />
                </LinearGradient>
              </View>

              <Text style={styles.title}>
                {enabled ? '2FA Aktif' : '2FA Kapalı'}
              </Text>
              <Text style={styles.subtitle}>
                {enabled
                  ? 'Hesabınız iki faktörlü doğrulama ile korunuyor.'
                  : 'Hesabınızı daha güvenli hale getirmek için iki faktörlü doğrulamayı etkinleştirin.'
                }
              </Text>

              {/* Info Cards */}
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={[styles.infoIcon, { backgroundColor: `${colors.success}20` }]}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  </View>
                  <Text style={styles.infoText}>Yetkisiz erişime karşı koruma</Text>
                </View>
                <View style={styles.infoRow}>
                  <View style={[styles.infoIcon, { backgroundColor: `${colors.primary}20` }]}>
                    <Ionicons name="phone-portrait" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.infoText}>Authenticator uygulaması gerektirir</Text>
                </View>
                <View style={styles.infoRow}>
                  <View style={[styles.infoIcon, { backgroundColor: `${colors.warning}20` }]}>
                    <Ionicons name="time" size={20} color={colors.warning} />
                  </View>
                  <Text style={styles.infoText}>Her 30 saniyede yeni kod</Text>
                </View>
              </View>

              {enabled ? (
                <TouchableOpacity
                  style={styles.disableButton}
                  onPress={handleDisable}
                >
                  <Ionicons name="shield-outline" size={20} color={colors.error} />
                  <Text style={styles.disableButtonText}>2FA'yı Kapat</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.enableButton}
                  onPress={handleEnable}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={gradients.primary as [string, string]}
                    style={styles.enableButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="shield-checkmark" size={20} color="#fff" />
                    <Text style={styles.enableButtonText}>2FA'yı Etkinleştir</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  statusContainer: {
    alignItems: 'center',
  },
  setupContainer: {
    alignItems: 'center',
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  secretContainer: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  secretLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  secretBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secretText: {
    fontSize: fontSize.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.primary,
    textAlign: 'center',
  },
  verifySection: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    letterSpacing: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  verifyButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  verifyButtonGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  verifyButtonText: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  enableButton: {
    width: '100%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  enableButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  enableButtonText: {
    fontSize: fontSize.md,
    color: '#fff',
    fontWeight: '600',
  },
  disableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.error}15`,
    borderWidth: 1,
    borderColor: colors.error,
    gap: spacing.sm,
  },
  disableButtonText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '500',
  },
});
