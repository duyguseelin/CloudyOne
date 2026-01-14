import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER_DATA: 'userData',
  REMEMBER_ME: 'rememberMe',
  REMEMBERED_EMAIL: 'rememberedEmail',
  BIOMETRIC_ENABLED: 'biometricEnabled',
  BIOMETRIC_CREDENTIALS: 'biometricCredentials',
  // Tercih ayarları
  TRASH_AUTO_DELETE_DAYS: 'trashAutoDeleteDays',
  LARGE_FILE_WARNING: 'largeFileWarning',
  SHARE_LOGS_ENABLED: 'shareLogsEnabled',
};

// SecureStore keys (güvenli depolama)
const SECURE_KEYS = {
  ENCRYPTION_PASSWORD: 'encryptionPassword',
  KDF_SALT: 'kdfSalt',
  KDF_ITERATIONS: 'kdfIterations',
};

class Storage {
  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  }

  async setAccessToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, token);
  }

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  }

  async setRefreshToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, token);
  }

  async getUserData(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USER_DATA);
  }

  async setUserData(data: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_DATA, data);
  }

  async getRememberMe(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.REMEMBER_ME);
    return value === 'true';
  }

  async setRememberMe(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.REMEMBER_ME, value.toString());
  }

  async getRememberedEmail(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.REMEMBERED_EMAIL);
  }

  async setRememberedEmail(email: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.REMEMBERED_EMAIL, email);
  }

  async clearRememberedEmail(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.REMEMBERED_EMAIL);
  }

  async getBiometricEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.BIOMETRIC_ENABLED);
    return value === 'true';
  }

  async setBiometricEnabled(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.BIOMETRIC_ENABLED, value.toString());
  }

  async getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
    const value = await AsyncStorage.getItem(KEYS.BIOMETRIC_CREDENTIALS);
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }

  async setBiometricCredentials(email: string, password: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.BIOMETRIC_CREDENTIALS, JSON.stringify({ email, password }));
  }

  async clearBiometricCredentials(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.BIOMETRIC_CREDENTIALS);
  }

  // Tercih Ayarları
  async getTrashAutoDeleteDays(): Promise<number> {
    const value = await AsyncStorage.getItem(KEYS.TRASH_AUTO_DELETE_DAYS);
    return value ? parseInt(value, 10) : 30; // Varsayılan 30 gün
  }

  async setTrashAutoDeleteDays(days: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.TRASH_AUTO_DELETE_DAYS, days.toString());
  }

  async getLargeFileWarning(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.LARGE_FILE_WARNING);
    return value === null ? true : value === 'true'; // Varsayılan açık
  }

  async setLargeFileWarning(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.LARGE_FILE_WARNING, value.toString());
  }

  async getShareLogsEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.SHARE_LOGS_ENABLED);
    return value === null ? true : value === 'true'; // Varsayılan açık
  }

  async setShareLogsEnabled(value: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.SHARE_LOGS_ENABLED, value.toString());
  }

  async clearAll(): Promise<void> {
    const rememberMe = await this.getRememberMe();
    const biometricEnabled = await this.getBiometricEnabled();
    const biometricCredentials = await this.getBiometricCredentials();
    
    await AsyncStorage.multiRemove([
      KEYS.ACCESS_TOKEN,
      KEYS.REFRESH_TOKEN,
      KEYS.USER_DATA,
    ]);
    
    // Beni hatırla ve biyometrik ayarlarını koru
    if (rememberMe) {
      await this.setRememberMe(rememberMe);
    }
    if (biometricEnabled) {
      await this.setBiometricEnabled(biometricEnabled);
    }
    if (biometricCredentials) {
      await this.setBiometricCredentials(biometricCredentials.email, biometricCredentials.password);
    }
  }

  // === SECURE STORE (Şifreleme için güvenli depolama) ===
  
  /**
   * Login sonrası şifreleme bilgilerini güvenli şekilde sakla
   * Bu sayede uygulama yeniden başlatıldığında master key otomatik türetilebilir
   */
  async saveEncryptionCredentials(password: string, kdfSalt: string, kdfIterations: number): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.ENCRYPTION_PASSWORD, password);
      await SecureStore.setItemAsync(SECURE_KEYS.KDF_SALT, kdfSalt);
      await SecureStore.setItemAsync(SECURE_KEYS.KDF_ITERATIONS, kdfIterations.toString());
      console.log('🔐 Şifreleme bilgileri güvenli depoya kaydedildi');
    } catch (error) {
      console.error('❌ Şifreleme bilgileri kaydedilemedi:', error);
    }
  }

  /**
   * Güvenli depodan şifreleme bilgilerini al
   */
  async getEncryptionCredentials(): Promise<{ password: string; kdfSalt: string; kdfIterations: number } | null> {
    try {
      const password = await SecureStore.getItemAsync(SECURE_KEYS.ENCRYPTION_PASSWORD);
      const kdfSalt = await SecureStore.getItemAsync(SECURE_KEYS.KDF_SALT);
      const kdfIterations = await SecureStore.getItemAsync(SECURE_KEYS.KDF_ITERATIONS);
      
      if (password && kdfSalt && kdfIterations) {
        return {
          password,
          kdfSalt,
          kdfIterations: parseInt(kdfIterations, 10),
        };
      }
      return null;
    } catch (error) {
      console.error('❌ Şifreleme bilgileri alınamadı:', error);
      return null;
    }
  }

  /**
   * Güvenli depodan şifreleme bilgilerini temizle (logout için)
   */
  async clearEncryptionCredentials(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.ENCRYPTION_PASSWORD);
      await SecureStore.deleteItemAsync(SECURE_KEYS.KDF_SALT);
      await SecureStore.deleteItemAsync(SECURE_KEYS.KDF_ITERATIONS);
      console.log('🔐 Şifreleme bilgileri güvenli depodan silindi');
    } catch (error) {
      console.error('❌ Şifreleme bilgileri silinemedi:', error);
    }
  }

  /**
   * Şifreleme bilgileri var mı kontrol et
   */
  async hasEncryptionCredentials(): Promise<boolean> {
    const credentials = await this.getEncryptionCredentials();
    return credentials !== null;
  }
}

export const storage = new Storage();

// Helper functions for backward compatibility
export const saveToken = async (token: string): Promise<void> => {
  await storage.setAccessToken(token);
};

export const getToken = async (): Promise<string | null> => {
  return storage.getAccessToken();
};

export const removeToken = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.ACCESS_TOKEN);
};

export const saveUser = async (user: any): Promise<void> => {
  await storage.setUserData(JSON.stringify(user));
};

export const getUser = async (): Promise<any | null> => {
  const data = await storage.getUserData();
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
};

export const removeUser = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.USER_DATA);
};

export const getBiometricCredentials = async (): Promise<{ email: string; password: string } | null> => {
  return storage.getBiometricCredentials();
};

export const saveBiometricCredentials = async (email: string, password: string): Promise<void> => {
  await storage.setBiometricCredentials(email, password);
};

export const hasBiometricCredentials = async (): Promise<boolean> => {
  const credentials = await storage.getBiometricCredentials();
  return credentials !== null;
};

export const clearBiometricCredentials = async (): Promise<void> => {
  await storage.clearBiometricCredentials();
};
