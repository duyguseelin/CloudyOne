import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, API_BASE } from '../services/api';
import { initializeMasterKey } from '../crypto';
import { 
  saveToken, 
  saveUser,
  storage,
} from '../utils/storage';
import { colors, gradients, shadows, borderRadius, fontSize, spacing } from '../constants/theme';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Main: undefined;
};

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // 2FA states
  const [requires2FA, setRequires2FA] = useState(false);
  const [temp2FAToken, setTemp2FAToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Uygulama açıldığında kayıtlı email'i yükle
  useEffect(() => {
    loadRememberedEmail();
  }, []);

  const loadRememberedEmail = async () => {
    const savedEmail = await storage.getRememberedEmail();
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  };

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    const emailToUse = loginEmail || email;
    const passwordToUse = loginPassword || password;

    if (!emailToUse || !passwordToUse) {
      Alert.alert('Hata', 'Lütfen e-posta ve şifrenizi girin');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login(emailToUse, passwordToUse);
      
      // ⚡ 2FA kontrolü
      if ((response as any).requires2FA) {
        setRequires2FA(true);
        setTemp2FAToken((response as any).temp2FAToken);
        setLoading(false);
        return;
      }
      
      // Normal login (2FA yok)
      await completeLogin(response, passwordToUse, emailToUse);
    } catch (error: any) {
      Alert.alert('Giriş Hatası', error.message || 'Giriş yapılamadı');
    } finally {
      setLoading(false);
    }
  };

  const handle2FALogin = async () => {
    if (twoFactorCode.length !== 6) {
      Alert.alert('Hata', '6 haneli kodu girin');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/2fa/verify-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          temp2FAToken,
          code: twoFactorCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Doğrulama başarısız');
      }

      const data = await response.json();
      await completeLogin(data, password, email);
    } catch (error: any) {
      Alert.alert('Hata', error.message || '2FA doğrulama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (response: any, passwordToUse: string, emailToUse: string) => {
    await saveToken(response.token);
    await saveUser(response.user);
    
    // Beni Hatırla - email'i kaydet veya sil
    if (rememberMe) {
      await storage.setRememberedEmail(emailToUse);
    } else {
      await storage.clearRememberedEmail();
    }
    
    // Kullanıcıyı hemen yönlendir
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
    
    // 🔐 Master key türet (şifreleme için) - ARKA PLANDA
    (async () => {
      try {
        console.log("🔍 [Mobile] Crypto init çağrılıyor (arka plan)...", `${API_BASE}/api/crypto/init`);
        const cryptoInitResponse = await fetch(`${API_BASE}/api/crypto/init`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${response.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (cryptoInitResponse.ok) {
          const cryptoData = await cryptoInitResponse.json();
          const { kdfSalt, kdfParams: kdfParamsStr } = cryptoData;
          
          let kdfParams;
          try {
            kdfParams = typeof kdfParamsStr === 'string' ? JSON.parse(kdfParamsStr) : kdfParamsStr;
          } catch {
            kdfParams = null;
          }
          
          await initializeMasterKey(passwordToUse, kdfSalt, kdfParams);
          
          const iterations = kdfParams?.iterations || 600000;
          await storage.saveEncryptionCredentials(passwordToUse, kdfSalt, iterations);
          console.log("✅ [Mobile] Master key arka planda hazırlandı");
        }
      } catch (cryptoError: any) {
        console.error("❌ Master key türetme hatası:", cryptoError?.message || cryptoError);
      }
    })();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
      
      {/* Arka plan gradient */}
      <LinearGradient
        colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Dekoratif daireler */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={gradients.secondary as [string, string]}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoEmoji}>☁️</Text>
            </LinearGradient>
            <Text style={styles.logoText}>CloudyOne</Text>
          </View>

          {/* Başlık */}
          <View style={styles.headerContainer}>
            <Text style={styles.title}>
              {requires2FA ? 'İki Faktörlü Doğrulama' : 'Hoş Geldiniz'}
            </Text>
            <Text style={styles.subtitle}>
              {requires2FA 
                ? 'Authenticator uygulamanızdaki 6 haneli kodu girin' 
                : 'Dosyalarınıza her yerden erişin'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            {!requires2FA ? (
              <>
                {/* Email Input */}
                <View style={styles.inputWrapper}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="E-posta"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      // Email değiştirilirse "Beni Hatırla" işaretini kaldır
                      if (rememberMe && text !== email) {
                        setRememberMe(false);
                      }
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!rememberMe} // Beni hatırla aktifse email düzenlenemez
                  />
                  {rememberMe && (
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={async () => {
                        setRememberMe(false);
                        setEmail('');
                        await storage.clearRememberedEmail();
                      }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Password Input */}
                <View style={styles.inputWrapper}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Şifre"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity 
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
                      size={20} 
                      color={colors.textMuted} 
                    />
                  </TouchableOpacity>
                </View>

                {/* Beni Hatırla & Şifremi Unuttum */}
                <View style={styles.rememberRow}>
                  <TouchableOpacity 
                    style={styles.rememberMe}
                    onPress={() => setRememberMe(!rememberMe)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={styles.rememberMeText}>Beni Hatırla</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={() => navigation.navigate('ForgotPassword')}
                  >
                    <Text style={styles.forgotPasswordText}>Şifremi Unuttum</Text>
                  </TouchableOpacity>
                </View>

                {/* Giriş Butonu */}
                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={() => handleLogin()}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.loginButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={styles.loginButtonText}>Giriş Yap</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* 2FA Icon */}
                <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="shield-checkmark" size={40} color="#fff" />
                  </LinearGradient>
                </View>

                {/* 2FA Code Input */}
                <View style={styles.inputWrapper}>
                  <View style={styles.inputIconContainer}>
                    <Ionicons name="shield-outline" size={20} color={colors.textMuted} />
                  </View>
                  <TextInput
                    style={[styles.input, { 
                      fontSize: 24, 
                      letterSpacing: 8, 
                      textAlign: 'center',
                      fontWeight: '600'
                    }]}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    value={twoFactorCode}
                    onChangeText={(text) => setTwoFactorCode(text.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>

                {/* 2FA Verify Button */}
                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handle2FALogin}
                  disabled={loading || twoFactorCode.length !== 6}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={gradients.secondary as [string, string]}
                    style={styles.loginButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.loginButtonText}>Doğrula ve Giriş Yap</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Back Button */}
                <TouchableOpacity
                  style={[styles.loginButton, { marginTop: spacing.md }]}
                  onPress={() => {
                    setRequires2FA(false);
                    setTwoFactorCode('');
                    setTemp2FAToken('');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.loginButtonGradient, { 
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderColor: colors.textMuted
                  }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.textMuted} />
                    <Text style={[styles.loginButtonText, { color: colors.textMuted }]}>
                      Geri Dön
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>veya</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Kayıt Ol */}
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.registerButtonText}>Hesabınız yok mu? </Text>
              <Text style={styles.registerButtonTextHighlight}>Kayıt Olun</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadows.large,
  },
  logoEmoji: {
    fontSize: 40,
  },
  logoText: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  formContainer: {
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
  },
  inputIconContainer: {
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  passwordToggle: {
    padding: spacing.md,
  },
  rememberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberMeText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  forgotPasswordText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.medium,
  },
  loginButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    gap: spacing.sm,
  },
  loginButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  dividerText: {
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  registerButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButtonText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  registerButtonTextHighlight: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
});

export default LoginScreen;
