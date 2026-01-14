import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';
import { api, API_BASE } from '../services/api';
import { initializeMasterKey } from '../crypto';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Hata', 'Lütfen email ve şifrenizi girin');
      return;
    }

    if (!emailVerified) {
      Alert.alert('Hata', 'Lütfen email adresinizi doğrulayın');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor');
      return;
    }

    // Güçlü şifre validasyonu
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,#^()\-_=+])[A-Za-z\d@$!%*?&.,#^()\-_=+]{8,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert(
        'Zayıf Şifre',
        'Şifreniz en az 8 karakter olmalı ve şunları içermelidir:\n• En az 1 büyük harf\n• En az 1 küçük harf\n• En az 1 rakam\n• En az 1 özel karakter (@$!%*?&.,#)'
      );
      return;
    }

    setLoading(true);
    try {
      const response = await api.register(email, password, name || undefined);
      
      // 🔐 Master key türet (şifreleme için)
      try {
        const cryptoInitResponse = await fetch(`${API_BASE}/api/crypto/init`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${response.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (cryptoInitResponse.ok) {
          const { kdfSalt, kdfParams } = await cryptoInitResponse.json();
          await initializeMasterKey(password, kdfSalt, kdfParams);
          console.log("🔐 [Mobile] Master key başlatıldı (register)");
        }
      } catch (cryptoError) {
        console.warn("Master key türetilemedi:", cryptoError);
      }
      
      // Bilgilendirme Alert'i göster
      Alert.alert(
        'Hesabınız Oluşturuldu! 🎉',
        'Hesabınız başarıyla oluşturuldu.\n\n🔒 Gizli Dosyalar: Hassas dosyalarınızı korumak için "Gizli Dosyalar" bölümünü kullanabilirsiniz. İlk kullanımda 4 haneli bir PIN oluşturmanız gerekecek.',
        [
          {
            text: 'Anladım',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
              });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Kayıt Hatası', error.message || 'Kayıt oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationCode = async () => {
    console.log('🔄 [Register] sendVerificationCode fonksiyonu çağrıldı, email:', email);
    
    if (!email) {
      Alert.alert('Hata', 'Lütfen email adresinizi girin');
      console.log('❌ [Register] Email boş');
      return;
    }

    setLoading(true);
    console.log('🌐 [Register] API çağrısı yapılıyor...', `${API_BASE}/auth/send-verification`);
    
    try {
      const response = await fetch(`${API_BASE}/auth/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      console.log('📡 [Register] Response status:', response.status);
      console.log('📡 [Register] Response ok:', response.ok);

      if (response.ok) {
        setVerificationSent(true);
        Alert.alert('Başarılı', 'Doğrulama kodu e-mail adresinize gönderildi');
        console.log('✅ [Register] Doğrulama kodu gönderildi');
      } else {
        const error = await response.json();
        Alert.alert('Hata', error.message || 'Doğrulama kodu gönderilemedi');
        console.log('❌ [Register] API Hatası:', error);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Doğrulama kodu gönderilemedi');
      console.log('❌ [Register] Fetch Hatası:', error);
    } finally {
      setLoading(false);
      console.log('🏁 [Register] Loading durumu false yapıldı');
    }
  };

  const verifyEmail = async () => {
    if (!verificationCode) {
      Alert.alert('Hata', 'Lütfen doğrulama kodunu girin');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code: verificationCode })
      });

      if (response.ok) {
        setEmailVerified(true);
        Alert.alert('Başarılı', 'Email adresiniz doğrulandı');
      } else {
        const error = await response.json();
        Alert.alert('Hata', error.message || 'Email doğrulaması başarısız');
      }
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Email doğrulaması başarısız');
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (pwd: string): number => {
    let strength = 0;
    if (pwd.length >= 8) strength += 20;
    if (pwd.length >= 12) strength += 10;
    if (pwd.length >= 16) strength += 10;
    if (/[a-z]/.test(pwd)) strength += 10;
    if (/[A-Z]/.test(pwd)) strength += 10;
    if (/\d/.test(pwd)) strength += 10;
    if (/[@$!%*?&.,#^()\-_=+]/.test(pwd)) strength += 20;
    return Math.min(strength, 100);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
      <LinearGradient
        colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Dekoratif Daireler */}
      <View style={[styles.decorCircle, styles.decorCircle1]} />
      <View style={[styles.decorCircle, styles.decorCircle2]} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={gradients.primary as [string, string]}
                style={styles.logoIcon}
              >
                <Ionicons name="cloud" size={40} color="#fff" />
              </LinearGradient>
              <Text style={styles.logoText}>CloudyOne</Text>
            </View>

            <Text style={styles.title}>Hesap Oluştur</Text>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>İsim (Opsiyonel)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Adınız Soyadınız"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="ornek@email.com"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!emailVerified}
                  />
                  {emailVerified && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  )}
                </View>
                
                {console.log('🔍 [Register] Button render kontrol - emailVerified:', emailVerified, 'verificationSent:', verificationSent)}
                {!emailVerified && !verificationSent && (
                  <TouchableOpacity onPress={() => {
                    console.log('👆 [Register] Doğrulama kodu gönder butonuna tıklandı');
                    console.log('🔍 [Register] Button disabled durumu:', loading || !email);
                    console.log('🔍 [Register] Loading:', loading, 'Email:', email);
                    sendVerificationCode();
                  }} disabled={loading || !email} style={{ opacity: (loading || !email) ? 0.5 : 1.0 }}>
                    <Text style={{color: colors.primary, fontSize: fontSize.sm, marginTop: spacing.xs}}>
                      {loading ? 'Gönderiliyor...' : 'Doğrulama Kodu Gönder'}
                    </Text>
                  </TouchableOpacity>
                )}

                {verificationSent && !emailVerified && (
                  <View style={{marginTop: spacing.md}}>
                    <TextInput
                      style={[styles.input, {marginBottom: spacing.sm}]}
                      placeholder="Doğrulama kodunu girin (6 hane)"
                      placeholderTextColor={colors.textMuted}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={[styles.buttonWrapper, {marginTop: spacing.sm}]}
                      onPress={verifyEmail}
                      disabled={loading || !verificationCode}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={gradients.primary as [string, string]}
                        style={[styles.button, loading && styles.buttonDisabled]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.buttonText}>{loading ? "Doğrulanıyor..." : "Doğrula"}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Şifre</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons 
                      name={showPassword ? "eye-off-outline" : "eye-outline"} 
                      size={20} 
                      color={colors.textMuted} 
                    />
                  </TouchableOpacity>
                </View>

                {/* Şifre Gücü */}
                {password && (
                  <View style={{marginTop: spacing.md}}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs}}>
                      <Text style={{fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600'}}>ŞİFRE GÜCÜ</Text>
                      <Text style={{fontSize: fontSize.xs, color: getPasswordStrength(password) < 50 ? colors.error : getPasswordStrength(password) < 80 ? colors.warning : colors.success, fontWeight: '600'}}>
                        {getPasswordStrength(password) < 50 ? 'Zayıf' : getPasswordStrength(password) < 80 ? 'Orta' : 'Güçlü'}
                      </Text>
                    </View>
                    <View style={{height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden'}}>
                      <View style={{
                        width: `${getPasswordStrength(password)}%`,
                        height: '100%',
                        backgroundColor: getPasswordStrength(password) < 50 ? colors.error : getPasswordStrength(password) < 80 ? colors.warning : colors.success
                      }} />
                    </View>

                    {/* Şifre Koşulları */}
                    <View style={{
                      marginTop: spacing.md,
                      padding: spacing.md,
                      backgroundColor: `${colors.primary}15`,
                      borderRadius: borderRadius.md,
                      borderColor: `${colors.primary}30`,
                      borderWidth: 1
                    }}>
                      <Text style={{fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm}}>
                        ŞİFRE KOŞULLARI
                      </Text>
                      <View style={{gap: spacing.xs}}>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.xs}}>
                          <Ionicons name={password.length >= 8 ? "checkmark-circle" : "circle-outline"} size={16} color={password.length >= 8 ? colors.success : colors.textMuted} />
                          <Text style={{fontSize: fontSize.xs, color: password.length >= 8 ? colors.success : colors.textMuted}}>En az 8 karakter</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.xs}}>
                          <Ionicons name={/[a-z]/.test(password) ? "checkmark-circle" : "circle-outline"} size={16} color={/[a-z]/.test(password) ? colors.success : colors.textMuted} />
                          <Text style={{fontSize: fontSize.xs, color: /[a-z]/.test(password) ? colors.success : colors.textMuted}}>1 küçük harf (a-z)</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.xs}}>
                          <Ionicons name={/[A-Z]/.test(password) ? "checkmark-circle" : "circle-outline"} size={16} color={/[A-Z]/.test(password) ? colors.success : colors.textMuted} />
                          <Text style={{fontSize: fontSize.xs, color: /[A-Z]/.test(password) ? colors.success : colors.textMuted}}>1 büyük harf (A-Z)</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.xs}}>
                          <Ionicons name={/\d/.test(password) ? "checkmark-circle" : "circle-outline"} size={16} color={/\d/.test(password) ? colors.success : colors.textMuted} />
                          <Text style={{fontSize: fontSize.xs, color: /\d/.test(password) ? colors.success : colors.textMuted}}>1 rakam (0-9)</Text>
                        </View>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: spacing.xs}}>
                          <Ionicons name={/[@$!%*?&.,#^()\-_=+]/.test(password) ? "checkmark-circle" : "circle-outline"} size={16} color={/[@$!%*?&.,#^()\-_=+]/.test(password) ? colors.success : colors.textMuted} />
                          <Text style={{fontSize: fontSize.xs, color: /[@$!%*?&.,#^()\-_=+]/.test(password) ? colors.success : colors.textMuted}}>1 özel karakter (@$!%*?&)</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Şifre Tekrar</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <Ionicons 
                      name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                      size={20} 
                      color={colors.textMuted} 
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.buttonWrapper}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={gradients.secondary as [string, string]}
                  style={[styles.button, loading && styles.buttonDisabled]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Kayıt Ol</Text>
                      <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.linkText}>
                  Zaten hesabınız var mı? <Text style={styles.linkTextBold}>Giriş Yapın</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDarker,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },
  decorCircle1: {
    width: 200,
    height: 200,
    top: -50,
    right: -80,
  },
  decorCircle2: {
    width: 150,
    height: 150,
    bottom: 100,
    left: -60,
    backgroundColor: colors.secondary,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  title: {
    fontSize: fontSize.xxl,
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
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  buttonWrapper: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  linkTextBold: {
    color: colors.primary,
    fontWeight: '600',
  },
});
