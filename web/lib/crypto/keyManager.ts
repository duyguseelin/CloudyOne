/**
 * Secure Key Manager - Session-Persistent Master Key Storage
 * 
 * Security Principles:
 * - Master key stored in sessionStorage (cleared on browser close)
 * - Key encrypted with session-specific random key
 * - Survives page refresh within same tab/session
 * - Auto-expires after inactivity timeout
 * - Cleared on logout or browser close
 */

import { deriveKey, type KdfParams } from "./kdf";

/**
 * In-memory key storage + sessionStorage backup
 */
let masterKeyCache: Uint8Array | null = null;
let keyExpiryTimer: NodeJS.Timeout | null = null;
let lastActivityTime: number = Date.now();

const KEY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes of inactivity (increased from 30)
const ACTIVITY_CHECK_INTERVAL = 60 * 1000; // Check every minute
const SESSION_KEY_NAME = "cloudyone_mk_session";
const SESSION_EXPIRY_NAME = "cloudyone_mk_expiry";

/**
 * Generate a random session encryption key
 */
function getOrCreateSessionKey(): Uint8Array {
  if (typeof window === "undefined") return new Uint8Array(32);
  
  const existing = sessionStorage.getItem("cloudyone_session_key");
  if (existing) {
    return Uint8Array.from(atob(existing), c => c.charCodeAt(0));
  }
  
  const newKey = crypto.getRandomValues(new Uint8Array(32));
  sessionStorage.setItem("cloudyone_session_key", btoa(String.fromCharCode(...newKey)));
  return newKey;
}

/**
 * Simple XOR encryption for session storage
 * Not cryptographically strong, but adds obfuscation layer
 */
function xorEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Save master key to sessionStorage (survives page refresh)
 */
function persistMasterKey(key: Uint8Array): void {
  if (typeof window === "undefined") return;
  
  try {
    const sessionKey = getOrCreateSessionKey();
    const encrypted = xorEncrypt(key, sessionKey);
    sessionStorage.setItem(SESSION_KEY_NAME, btoa(String.fromCharCode(...encrypted)));
    sessionStorage.setItem(SESSION_EXPIRY_NAME, String(Date.now() + KEY_TIMEOUT_MS));
  } catch (e) {
    console.warn("Failed to persist master key:", e);
  }
}

/**
 * Restore master key from sessionStorage
 */
function restoreMasterKey(): Uint8Array | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_NAME);
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_NAME);
    
    if (!stored || !expiry) return null;
    
    // Check expiry
    if (Date.now() > parseInt(expiry, 10)) {
      clearSessionStorage();
      return null;
    }
    
    const sessionKey = getOrCreateSessionKey();
    const encrypted = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return xorEncrypt(encrypted, sessionKey);
  } catch (e) {
    console.warn("Failed to restore master key:", e);
    return null;
  }
}

/**
 * Clear session storage
 */
function clearSessionStorage(): void {
  if (typeof window === "undefined") return;
  
  sessionStorage.removeItem(SESSION_KEY_NAME);
  sessionStorage.removeItem(SESSION_EXPIRY_NAME);
  sessionStorage.removeItem("cloudyone_session_key");
}

/**
 * Initialize master key from password
 * Stores in memory + sessionStorage, auto-expires after timeout
 */
export async function initializeMasterKey(
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams
): Promise<void> {
  // Derive key
  console.log("🔐 [Web] Deriving key with params:", kdfParams);
  console.log("🔐 [Web] Salt (base64):", kdfSalt.substring(0, 20) + "...");
  console.log("🔐 [Web] Iterations:", kdfParams.iterations);
  
  const key = await deriveKey(password, kdfSalt, kdfParams);
  
  // Debug: Key'in ilk 4 byte'ını göster (güvenlik için tamamı değil)
  const keyPrefix = Array.from(key.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log("🔐 [Web] Key prefix (ilk 4 byte):", keyPrefix);
  console.log("🔐 [Web] Key uzunluğu:", key.length, "bytes");
  
  // Store in memory
  masterKeyCache = key;
  lastActivityTime = Date.now();
  
  // Persist to sessionStorage (survives refresh)
  persistMasterKey(key);
  
  // Start expiry timer
  startExpiryTimer();
  
  console.log("✅ [Web] Master key initialized (session-persistent, auto-expires in 60min)");
}

/**
 * Get master key (if still valid)
 * First checks memory, then tries to restore from sessionStorage
 */
export function getMasterKey(): Uint8Array {
  // Try memory first
  if (masterKeyCache) {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity <= KEY_TIMEOUT_MS) {
      updateActivity();
      return masterKeyCache;
    }
  }
  
  // Try to restore from sessionStorage
  const restored = restoreMasterKey();
  if (restored) {
    masterKeyCache = restored;
    lastActivityTime = Date.now();
    startExpiryTimer();
    console.log("🔐 Master key restored from session");
    return restored;
  }
  
  throw new Error("MASTER_KEY_NOT_INITIALIZED");
}

/**
 * Check if master key is available
 */
export function hasMasterKey(): boolean {
  // Check memory
  if (masterKeyCache) {
    const timeSinceActivity = Date.now() - lastActivityTime;
    if (timeSinceActivity <= KEY_TIMEOUT_MS) {
      return true;
    }
  }
  
  // Try to restore from sessionStorage
  const restored = restoreMasterKey();
  if (restored) {
    masterKeyCache = restored;
    lastActivityTime = Date.now();
    startExpiryTimer();
    console.log("🔐 Master key restored from session (hasMasterKey check)");
    return true;
  }
  
  return false;
}

/**
 * Clear master key from memory and sessionStorage
 * Called on: logout, timeout, manual clear
 */
export function clearMasterKey(): void {
  if (masterKeyCache) {
    // Overwrite key with zeros (best effort to clear memory)
    masterKeyCache.fill(0);
    masterKeyCache = null;
  }
  
  // Clear sessionStorage
  clearSessionStorage();
  
  if (keyExpiryTimer) {
    clearInterval(keyExpiryTimer);
    keyExpiryTimer = null;
  }
  
  console.log("🗑️ Master key cleared from memory and session");
}

/**
 * Update last activity time (keep key alive)
 */
export function updateActivity(): void {
  lastActivityTime = Date.now();
  // Update expiry in sessionStorage
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SESSION_EXPIRY_NAME, String(Date.now() + KEY_TIMEOUT_MS));
  }
}

/**
 * Start auto-expiry timer
 * Checks every minute if key should expire
 */
function startExpiryTimer(): void {
  // Clear existing timer
  if (keyExpiryTimer) {
    clearInterval(keyExpiryTimer);
  }
  
  // Set new timer
  keyExpiryTimer = setInterval(() => {
    const timeSinceActivity = Date.now() - lastActivityTime;
    
    if (timeSinceActivity > KEY_TIMEOUT_MS) {
      console.warn("⏰ Master key expired due to inactivity");
      clearMasterKey();
      
      // Notify user (optional - implement in UI)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("master-key-expired"));
      }
    }
  }, ACTIVITY_CHECK_INTERVAL);
}

/**
 * Get remaining time before expiry (in seconds)
 */
export function getRemainingTime(): number {
  if (!masterKeyCache) return 0;
  
  const timeSinceActivity = Date.now() - lastActivityTime;
  const remaining = Math.max(0, KEY_TIMEOUT_MS - timeSinceActivity);
  
  return Math.floor(remaining / 1000);
}

/**
 * Extend session (reset timeout)
 */
export function extendSession(): void {
  if (masterKeyCache) {
    updateActivity();
    console.log("⏰ Session extended");
  }
}

// Session-based key persistence
// Key survives page refresh but clears on browser/tab close
if (typeof window !== "undefined") {
  // Try to restore key on page load
  const restored = restoreMasterKey();
  if (restored) {
    masterKeyCache = restored;
    lastActivityTime = Date.now();
    startExpiryTimer();
    console.log("🔐 Master key auto-restored from session on page load");
  }
  
  // Clear key when browser tab/window is actually closed
  // Note: sessionStorage is automatically cleared by browser on tab close
  // So we don't need to manually handle that
  
  // Clear on tab hidden for very extended period (security measure)
  let hiddenTime: number | null = null;
  const TAB_HIDDEN_TIMEOUT = 30 * 60 * 1000; // 30 minutes hidden = clear key
  
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenTime = Date.now();
    } else {
      // Tab became visible again
      if (hiddenTime) {
        const hiddenDuration = Date.now() - hiddenTime;
        if (hiddenDuration > TAB_HIDDEN_TIMEOUT) {
          console.warn("⏰ Key cleared: tab was hidden for too long");
          clearMasterKey();
          window.dispatchEvent(new CustomEvent("master-key-expired"));
        }
        hiddenTime = null;
      }
    }
  });
}

// Export as default object for easier imports
const keyManager = {
  setMasterKey: initializeMasterKey,
  getMasterKey,
  clearKey: clearMasterKey,
  hasKey: hasMasterKey,
  getRemainingTime,
  extendSession,
};

export default keyManager;