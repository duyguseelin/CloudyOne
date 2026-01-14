/**
 * Mobile Key Manager - Memory-only Master Key Storage
 * React Native / Expo için güvenli anahtar yönetimi
 * 
 * Güvenlik özellikleri:
 * - Master key SADECE bellekte saklanır (AsyncStorage'da DEĞİL)
 * - 30 dakika hareketsizlik sonrası otomatik temizleme
 * - Uygulama arka plana alındığında süre devam eder
 * - Uygulama kapatılınca key silinir
 */

// Master key bellekte - uygulama kapatılınca kaybolur
let masterKey: Uint8Array | null = null;

// Son aktivite zamanı
let lastActivity: number = 0;

// Otomatik temizleme süresi (30 dakika)
const KEY_TIMEOUT_MS = 30 * 60 * 1000;

// Timeout referansı
let cleanupTimeout: NodeJS.Timeout | null = null;

/**
 * Master key'i bellekte sakla
 */
export function setMasterKey(key: Uint8Array): void {
  masterKey = key;
  lastActivity = Date.now();
  
  // Önceki timeout'u temizle
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
  }
  
  // Yeni timeout başlat
  cleanupTimeout = setTimeout(() => {
    clearMasterKey();
    console.log("🔐 Master key süresi doldu, bellekten temizlendi");
  }, KEY_TIMEOUT_MS);
  
  console.log("🔐 Master key bellekte saklandı");
}

/**
 * Master key'i al
 */
export function getMasterKey(): Uint8Array {
  if (!masterKey) {
    throw new Error("Master key mevcut değil. Lütfen tekrar giriş yapın.");
  }
  
  // Aktiviteyi güncelle
  touchActivity();
  
  return masterKey;
}

/**
 * Master key var mı kontrol et
 */
export function hasMasterKey(): boolean {
  if (!masterKey) return false;
  
  // Süre dolmuş mu kontrol et
  if (Date.now() - lastActivity > KEY_TIMEOUT_MS) {
    clearMasterKey();
    return false;
  }
  
  return true;
}

/**
 * Master key'i bellekten temizle
 */
export function clearMasterKey(): void {
  if (masterKey) {
    // Güvenli silme - belleği sıfırla
    masterKey.fill(0);
  }
  masterKey = null;
  lastActivity = 0;
  
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  
  console.log("🔐 Master key bellekten temizlendi");
}

/**
 * Aktiviteyi güncelle (timeout'u sıfırla)
 */
export function touchActivity(): void {
  if (!masterKey) return;
  
  lastActivity = Date.now();
  
  // Timeout'u yeniden başlat
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
  }
  
  cleanupTimeout = setTimeout(() => {
    clearMasterKey();
    console.log("🔐 Master key süresi doldu, bellekten temizlendi");
  }, KEY_TIMEOUT_MS);
}

/**
 * Kalan süreyi al (saniye cinsinden)
 */
export function getRemainingTime(): number {
  if (!masterKey) return 0;
  
  const elapsed = Date.now() - lastActivity;
  const remaining = KEY_TIMEOUT_MS - elapsed;
  
  return Math.max(0, Math.floor(remaining / 1000));
}
