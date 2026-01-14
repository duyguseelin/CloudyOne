"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearAuth, getStoredUser, getAccountStorage, hasHiddenFilesPin, setHiddenFilesPin } from "../../lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
  const [autoDeleteTrashDays, setAutoDeleteTrashDays] = useState(30);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [disable2FAPassword, setDisable2FAPassword] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);
  
  // Hidden Files PIN states
  const [hasPinSet, setHasPinSet] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinAction, setPinAction] = useState<'set' | 'change' | 'remove'>('set');
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [isPinLoading, setIsPinLoading] = useState(false);
  
  // Preferences states
  const [warnLargeFiles, setWarnLargeFiles] = useState(true);
  const [trackShareLinks, setTrackShareLinks] = useState(true);
  
  // Email verification states
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  const getPlanName = (plan: string) => {
    const planNames: { [key: string]: string } = {
      'FREE': 'Başlangıç',
      'PRO': 'Pro',
      'BUSINESS': 'İşletme'
    };
    return planNames[plan] || plan;
  };

  useEffect(() => {
    async function load() {
      try {
        const stored = getStoredUser();
        if (!stored) {
          router.push("/login");
          return;
        }
        setUser(stored);

        const meData = await apiFetch("/auth/me", {}, true);
        if (meData?.user) {
          setUser(meData.user);
          
          // E-posta doğrulama durumunu al
          if (meData.user.emailVerified !== undefined) {
            setEmailVerified(meData.user.emailVerified);
          }
          
          // Backend'den gelen tercihleri kullan
          if (meData.user.trackShareLinks !== undefined) {
            setTrackShareLinks(meData.user.trackShareLinks);
            localStorage.setItem('trackShareLinks', String(meData.user.trackShareLinks));
          }
          
          if (meData.user.warnLargeFiles !== undefined) {
            setWarnLargeFiles(meData.user.warnLargeFiles);
            localStorage.setItem('warnLargeFiles', String(meData.user.warnLargeFiles));
          }
        }

        const storageData = await getAccountStorage();
        if (storageData) {
          setStorageInfo(storageData);
        }

        // localStorage'dan çöp kutusu otomatik silme tercihini oku
        const savedTrashDays = localStorage.getItem('autoDeleteTrashDays');
        if (savedTrashDays) {
          setAutoDeleteTrashDays(Number(savedTrashDays));
        }

        // Fetch 2FA status
        try {
          const status2FA = await apiFetch("/auth/2fa/status", {}, true);
          if (status2FA?.enabled !== undefined) {
            setIsTwoFactorEnabled(status2FA.enabled);
          }
        } catch {}
        
        // Check if hidden files PIN is set
        try {
          const pinStatus = await hasHiddenFilesPin();
          setHasPinSet(pinStatus.hasPinSet);
        } catch {}
      } catch (err: any) {
        console.error(err);
        if (err?.message === "UNAUTHORIZED") {
          clearAuth();
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const usedStorageBytes = storageInfo?.usedStorageBytes || 0;
  const storageLimitBytes = storageInfo?.storageLimitBytes || 1;
  const trashStorageBytes = storageInfo?.trashStorageBytes || 0;
  const trashLimitBytes = storageInfo?.trashLimitBytes || 1;
  
  // Kategori bazlı depolama bilgileri
  const categoryBytes = storageInfo?.categoryBytes || { image: 0, media: 0, document: 0, other: 0 };
  const categoryCounts = storageInfo?.categoryCounts || { image: 0, media: 0, document: 0, other: 0 };
  
  // Kategori renkleri ve ikonları (sadece 4 kategori)
  const storageCategories = [
    { key: 'image', label: 'Resimler', bytes: categoryBytes.image, count: categoryCounts.image, color: '#22c55e', icon: '🖼️' },
    { key: 'media', label: 'Medya', bytes: categoryBytes.media, count: categoryCounts.media, color: '#f59e0b', icon: '🎬' },
    { key: 'document', label: 'Dökümanlar', bytes: categoryBytes.document, count: categoryCounts.document, color: '#3b82f6', icon: '📄' },
    { key: 'other', label: 'Diğer', bytes: categoryBytes.other, count: categoryCounts.other, color: '#6b7280', icon: '📁' },
  ];
  
  // Toplam aktif dosya boyutu
  const totalCategoryBytes = storageCategories.reduce((sum, cat) => sum + cat.bytes, 0);
  
  console.log('Storage Info:', {
    usedStorageBytes,
    storageLimitBytes,
    trashStorageBytes,
    trashLimitBytes,
    categoryBytes,
    rawStorageInfo: storageInfo
  });
  
  const usedPercent = Math.min(100, (usedStorageBytes / storageLimitBytes) * 100);
  const trashPercent = Math.min(100, (trashStorageBytes / trashLimitBytes) * 100);

  const formatSize = (bytes: number) => {
    const mb = 1024 * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return (bytes / gb).toFixed(2) + " GB";
    if (bytes >= mb) return (bytes / mb).toFixed(2) + " MB";
    return (bytes / 1024).toFixed(2) + " KB";
  };

  const handleChangePassword = () => {
    setShowPasswordModal(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleUpdateProfile = () => {
    setIsEditingProfile(true);
    setNewName(user?.name || "");
    setNewEmail(user?.email || "");
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    setNewName("");
    setNewEmail("");
  };

  const handleSubmitProfileUpdate = async () => {
    if (!newName.trim()) {
      setToast({ message: "Kullanıcı adı boş olamaz.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setToast({ message: "Geçerli bir e-posta adresi giriniz.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIsUpdating(true);
    try {
      await apiFetch("/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() })
      }, true);
      setUser({ ...user, name: newName.trim(), email: newEmail.trim() });
      setToast({ message: "Profil başarıyla güncellendi!", type: 'success' });
      setTimeout(() => setToast(null), 3000);
      setIsEditingProfile(false);
    } catch (err: any) {
      setToast({ message: err.message || "Profil güncellenemedi.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSubmitPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Tüm alanları doldurmalısın.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Yeni şifreler eşleşmiyor.");
      return;
    }
    if (newPassword.length < 6) {
      alert("Yeni şifre en az 6 karakter olmalı.");
      return;
    }
    setIsUpdating(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      }, true);
      alert("Şifre başarıyla değiştirildi!");
      setShowPasswordModal(false);
    } catch (err: any) {
      alert(err.message || "Şifre değiştirilemedi.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEmptyTrash = async () => {
    setShowEmptyTrashConfirm(true);
  };

  const handleConfirmEmptyTrash = async () => {
    setEmptyingTrash(true);
    try {
      console.log("[Settings] Emptying trash...");
      
      // Token kontrolü
      const token = localStorage.getItem('cloudyone_token') || localStorage.getItem('token');
      console.log("[Settings] Token exists:", !!token);
      if (!token) {
        console.error("[Settings] No token found, redirecting to login");
        clearAuth();
        router.push('/login');
        return;
      }
      
      const result = await apiFetch("/files/trash", { method: "DELETE" }, true);
      console.log("[Settings] Trash emptied successfully:", result);
      
      // Mesajı kontrol et - çöp kutusu boş mu yoksa boşaltıldı mı?
      const message = result?.message || "";
      if (message.includes("zaten boş")) {
        setToast({ message: "Çöp kutusu zaten boş.", type: 'success' });
      } else {
        setToast({ message: "Çöp kutusu başarıyla boşaltıldı!", type: 'success' });
      }
      
      setTimeout(() => setToast(null), 3000);
      // Reload storage info
      const storageData = await getAccountStorage();
      if (storageData) {
        setStorageInfo(storageData);
      }
      setShowEmptyTrashConfirm(false);
    } catch (err: any) {
      console.error("[Settings] Error emptying trash:", err);
      
      // Eğer 401 hatası ise, login'e yönlendir
      if (err.message && err.message.includes('token')) {
        clearAuth();
        router.push('/login');
        return;
      }
      
      setToast({ message: err.message || "Çöp kutusu boşaltılamadı.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      setShowEmptyTrashConfirm(false);
    } finally {
      setEmptyingTrash(false);
    }
  };

  const handleOpenTrash = () => {
    router.push("/files?view=trash");
  };

  const handleGoToPlanPage = () => {
    router.push("/select-plan?change=true");
  };

  const handleResendVerificationEmail = async () => {
    setSendingVerification(true);
    try {
      await apiFetch("/account/resend-verification", {
        method: "POST"
      }, true);
      setToast({ message: "Doğrulama e-postası gönderildi! E-posta adresinizi kontrol edin.", type: 'success' });
      setTimeout(() => setToast(null), 5000);
    } catch (err: any) {
      setToast({ message: err.message || "E-posta gönderilemedi.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSendingVerification(false);
    }
  };

  const handleToggle2FA = async () => {
    if (isTwoFactorEnabled) {
      // Devre dışı bırakma - şifre sor
      setShow2FAModal(true);
      setQrCode(null);
    } else {
      // Aktif etme - QR kod al
      setIs2FALoading(true);
      try {
        const response = await apiFetch("/auth/2fa/enable", { method: "POST" }, true);
        setQrCode(response.qrCode);
        setShow2FAModal(true);
      } catch (err: any) {
        setToast({ message: err.message || "2FA başlatılamadı.", type: 'error' });
        setTimeout(() => setToast(null), 3000);
      } finally {
        setIs2FALoading(false);
      }
    }
  };

  const handleVerify2FA = async () => {
    if (!verificationCode) {
      setToast({ message: "Doğrulama kodunu girin.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIs2FALoading(true);
    try {
      await apiFetch("/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationCode })
      }, true);
      setIsTwoFactorEnabled(true);
      setShow2FAModal(false);
      setVerificationCode("");
      setQrCode(null);
      setToast({ message: "İki aşamalı doğrulama aktif edildi!", type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "Doğrulama başarısız.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disable2FAPassword) {
      setToast({ message: "Şifrenizi girin.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIs2FALoading(true);
    try {
      await apiFetch("/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disable2FAPassword })
      }, true);
      setIsTwoFactorEnabled(false);
      setShow2FAModal(false);
      setDisable2FAPassword("");
      setToast({ message: "İki aşamalı doğrulama devre dışı bırakıldı.", type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "İşlem başarısız.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIs2FALoading(false);
    }
  };
  
  const handlePinAction = (action: 'set' | 'change' | 'remove') => {
    setPinAction(action);
    setShowPinModal(true);
    setPinInput("");
    setPinConfirmInput("");
    setCurrentPinInput("");
  };
  
  const handleSubmitPin = async () => {
    if (pinAction === 'remove') {
      // Remove PIN
      setIsPinLoading(true);
      try {
        await setHiddenFilesPin(null);
        setHasPinSet(false);
        setShowPinModal(false);
        setToast({ message: "Gizli dosyalar PIN'i kaldırıldı.", type: 'success' });
        setTimeout(() => setToast(null), 3000);
      } catch (err: any) {
        setToast({ message: err.message || "PIN kaldırılamadı.", type: 'error' });
        setTimeout(() => setToast(null), 3000);
      } finally {
        setIsPinLoading(false);
      }
      return;
    }
    
    // Set or change PIN
    if (!pinInput || pinInput.length !== 4) {
      setToast({ message: "PIN 4 haneli olmalıdır.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    if (!/^\d{4}$/.test(pinInput)) {
      setToast({ message: "PIN sadece rakamlardan oluşmalıdır.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    if (pinInput !== pinConfirmInput) {
      setToast({ message: "PIN'ler eşleşmiyor.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    setIsPinLoading(true);
    try {
      await setHiddenFilesPin(pinInput);
      setHasPinSet(true);
      setShowPinModal(false);
      setToast({ message: pinAction === 'set' ? "Gizli dosyalar PIN'i ayarlandı." : "Gizli dosyalar PIN'i değiştirildi.", type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: err.message || "PIN ayarlanamadı.", type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsPinLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#050816', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div>Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
      {/* Header with back button */}
      <div style={{ 
        background: 'rgba(15, 23, 42, 0.8)', 
        backdropFilter: 'blur(12px)', 
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '1.5rem 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.push('/files')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '0.75rem',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.transform = 'translateX(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', margin: 0 }}>Ayarlar</h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0' }}>Hesap ve depolama ayarlarını yönet</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {/* Profile Summary Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(99,102,241,0.1) 100%)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: '24px',
          padding: '2rem',
          marginBottom: '2rem',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              color: 'white',
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(139,92,246,0.3)'
            }}>
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'white', margin: '0 0 0.5rem' }}>
                {user?.name || user?.email?.split('@')[0] || 'Kullanıcı'}
              </h2>
              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: '0' }}>
                {user?.email || 'email@example.com'}
              </p>
              
              {/* Depolama Dolu Uyarısı */}
              {storageInfo && (() => {
                const usedBytes = storageInfo.usedStorageBytes || 0;
                const limitBytes = storageInfo.storageLimitBytes || 1;
                const usagePercent = (usedBytes / limitBytes) * 100;
                
                if (usagePercent >= 95) {
                  return (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.2))',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="#ef4444">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#fca5a5' }}>
                          Depolama Alanınız Dolmuştur
                        </p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#fecaca' }}>
                          Plan değişikliği yaparak daha fazla alan kazanabilirsiniz
                        </p>
                      </div>
                    </div>
                  );
                } else if (usagePercent >= 90) {
                  return (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.2))',
                      border: '1px solid rgba(251, 191, 36, 0.4)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="#fbbf24">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: '#fcd34d', flex: 1 }}>
                        Depolama alanınızın %{usagePercent.toFixed(0)}'i dolu
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div style={{ 
              position: 'absolute', 
              top: '2rem', 
              right: '2rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.75rem', 
              alignItems: 'flex-end' 
            }}>
              <span style={{
                padding: '0.5rem 1rem',
                background: 'rgba(139,92,246,0.3)',
                border: '1px solid rgba(139,92,246,0.5)',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'white'
              }}>
                {getPlanName(storageInfo?.plan || 'FREE')} Plan
              </span>
              <button
                onClick={handleGoToPlanPage}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
              >
                Planı Yükselt
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Account Settings */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '1.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Hesap Bilgileri
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.5rem' }}>Kullanıcı Adı</label>
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(139,92,246,0.5)',
                      borderRadius: 12,
                      color: 'white',
                      fontSize: '0.95rem',
                      outline: 'none'
                    }}
                    placeholder="Kullanıcı adı"
                    autoFocus
                  />
                ) : (
                  <p style={{ color: 'white', fontSize: '0.95rem', margin: 0 }}>{user?.name || '—'}</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.5rem' }}>E-posta</label>
                {isEditingProfile ? (
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(139,92,246,0.5)',
                      borderRadius: 12,
                      color: 'white',
                      fontSize: '0.95rem',
                      outline: 'none'
                    }}
                    placeholder="E-posta adresi"
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <p style={{ color: 'white', fontSize: '0.95rem', margin: 0, wordBreak: 'break-word' }}>{user?.email || '—'}</p>
                    {emailVerified ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(16, 185, 129, 0.2)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#10b981',
                        fontWeight: 600
                      }}>
                        ✓ Doğrulandı
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        background: 'rgba(245, 158, 11, 0.2)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#f59e0b',
                        fontWeight: 600
                      }}>
                        ⚠ Doğrulanmadı
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Email Verification Section */}
              {!emailVerified && !isEditingProfile && (
                <div style={{
                  padding: '1rem',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#fbbf24', fontSize: '0.9rem', margin: '0 0 0.25rem', fontWeight: 600 }}>E-posta Doğrulama Gerekli</p>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(251, 191, 36, 0.8)', margin: 0 }}>
                      Hesabınızın güvenliği için e-posta adresinizi doğrulayın
                    </p>
                  </div>
                  <button
                    onClick={handleResendVerificationEmail}
                    disabled={sendingVerification}
                    style={{
                      padding: '0.625rem 1.25rem',
                      background: sendingVerification ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid rgba(245, 158, 11, 0.5)',
                      borderRadius: '8px',
                      color: '#fbbf24',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: sendingVerification ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (!sendingVerification) {
                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!sendingVerification) {
                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)';
                      }
                    }}
                  >
                    {sendingVerification ? 'Gönderiliyor...' : 'E-posta Doğrula'}
                  </button>
                </div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div>
                  <p style={{ color: 'white', fontSize: '0.95rem', margin: '0 0 0.25rem', fontWeight: 600 }}>İki Aşamalı Doğrulama</p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Ekstra güvenlik katmanı</p>
                </div>
                <button
                  onClick={handleToggle2FA}
                  disabled={is2FALoading}
                  style={{
                    position: 'relative',
                    width: '48px',
                    height: '26px',
                    borderRadius: '999px',
                    background: isTwoFactorEnabled ? '#10b981' : '#4b5563',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    flexShrink: 0
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: '3px',
                    left: isTwoFactorEnabled ? '24px' : '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}></span>
                </button>
              </div>
              
              {/* Hidden Files PIN Section */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '0.95rem', margin: '0 0 0.25rem', fontWeight: 600 }}>Gizli Dosyalar PIN'i</p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                    {hasPinSet ? 'PIN aktif, gizli dosyalara erişim korumalı' : 'Gizli dosyalar için 4 haneli PIN ayarlayın'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {hasPinSet ? (
                    <>
                      <button
                        onClick={() => handlePinAction('change')}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(59,130,246,0.2)',
                          border: '1px solid rgba(59,130,246,0.5)',
                          borderRadius: '8px',
                          color: '#60a5fa',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(59,130,246,0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(59,130,246,0.2)';
                        }}
                      >
                        Değiştir
                      </button>
                      <button
                        onClick={() => handlePinAction('remove')}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(239,68,68,0.2)',
                          border: '1px solid rgba(239,68,68,0.5)',
                          borderRadius: '8px',
                          color: '#f87171',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239,68,68,0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                        }}
                      >
                        Kaldır
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handlePinAction('set')}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(139,92,246,0.2)',
                        border: '1px solid rgba(139,92,246,0.5)',
                        borderRadius: '8px',
                        color: '#a78bfa',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.2)';
                      }}
                    >
                      PIN Ayarla
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                {isEditingProfile ? (
                  <>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      }}
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSubmitProfileUpdate}
                      disabled={isUpdating}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(16,185,129,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,185,129,0.3)';
                      }}
                    >
                      {isUpdating ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleUpdateProfile}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      }}
                    >
                      Profili Güncelle
                    </button>
                    <button
                      onClick={handleChangePassword}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        border: 'none',
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(99,102,241,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)';
                      }}
                    >
                      Şifre Değiştir
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Storage Overview */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '1.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
              </svg>
              Depolama Durumu
            </h3>
            
            {/* Active Storage - Toplam */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Toplam Kullanım</span>
                <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 600 }}>
                  {formatSize(usedStorageBytes)} / {formatSize(storageLimitBytes)}
                </span>
              </div>
              {/* Çok renkli bar - kategorileri gösterir */}
              <div style={{ 
                height: '16px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '999px', 
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative',
                display: 'flex'
              }}>
                {storageCategories.map((cat, idx) => {
                  const catPercent = storageLimitBytes > 0 ? (cat.bytes / storageLimitBytes) * 100 : 0;
                  if (catPercent <= 0) return null;
                  return (
                    <div 
                      key={cat.key}
                      style={{ 
                        width: `${Math.max(catPercent, 0.5)}%`,
                        height: '100%', 
                        background: cat.color,
                        transition: 'width 0.3s ease',
                        borderRight: idx < storageCategories.length - 1 ? '1px solid rgba(0,0,0,0.2)' : 'none'
                      }}
                      title={`${cat.label}: ${formatSize(cat.bytes)} (${cat.count} dosya)`}
                    />
                  );
                })}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                %{usedPercent < 1 ? usedPercent.toFixed(2) : usedPercent.toFixed(1)} kullanılıyor
              </div>
            </div>

            {/* Kategori Detayları */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.75rem' }}>Kategori Dağılımı</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {storageCategories.map((cat) => (
                  <div 
                    key={cat.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: cat.color,
                      flexShrink: 0
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                        {formatSize(cat.bytes)} · {cat.count} dosya
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trash Storage */}
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Çöp Kutusu</span>
                <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 600 }}>
                  {formatSize(trashStorageBytes)} / {formatSize(trashLimitBytes)}
                </span>
              </div>
              <div style={{ 
                height: '12px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '999px', 
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative'
              }}>
                <div style={{ 
                  width: trashPercent > 0 ? `${Math.max(trashPercent, 2)}%` : '0%',
                  height: '100%', 
                  background: 'linear-gradient(90deg, #f87171 0%, #fb923c 100%)',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                  boxShadow: trashPercent > 0 ? '0 0 12px rgba(248,113,113,0.5)' : 'none'
                }}></div>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                %{trashPercent < 1 ? trashPercent.toFixed(2) : trashPercent.toFixed(1)} kullanılıyor
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={handleOpenTrash}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
              >
                Çöp Kutusunu Aç
              </button>
              <button
                onClick={handleEmptyTrash}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '12px',
                  color: '#fca5a5',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                }}
              >
                Boşalt
              </button>
            </div>
          </div>

          {/* Preferences */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '1.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'white', margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Tercihler
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.75rem' }}>Çöp Kutusu Otomatik Silme</label>
                <select
                  value={autoDeleteTrashDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setAutoDeleteTrashDays(days);
                    localStorage.setItem('autoDeleteTrashDays', String(days));
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value={7}>7 gün sonra</option>
                  <option value={30}>30 gün sonra</option>
                  <option value={60}>60 gün sonra</option>
                  <option value={0}>Otomatik silme yok</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: '0.5rem 0 0' }}>
                  Çöp kutusundaki dosyalar seçilen süreyi aşınca kalıcı silinir
                </p>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <input 
                  type="checkbox" 
                  checked={warnLargeFiles}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setWarnLargeFiles(newValue);
                    localStorage.setItem('warnLargeFiles', String(newValue));
                    
                    // Backend'e kaydet
                    try {
                      await apiFetch('/auth/update-preferences', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ warnLargeFiles: newValue })
                      }, true);
                    } catch (err) {
                      console.error('Tercih kaydedilemedi:', err);
                    }
                  }}
                  style={{ marginTop: '0.125rem', width: '18px', height: '18px', cursor: 'pointer' }} 
                />
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '0.9rem', margin: '0 0 0.25rem', fontWeight: 500 }}>Büyük dosyalar için uyarı göster</p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>500 MB üzerindeki dosyalarda ek onay iste</p>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <input 
                  type="checkbox" 
                  checked={trackShareLinks}
                  onChange={async (e) => {
                    const newValue = e.target.checked;
                    setTrackShareLinks(newValue);
                    localStorage.setItem('trackShareLinks', String(newValue));
                    
                    // Backend'e kaydet
                    try {
                      await apiFetch('/auth/update-preferences', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trackShareLinks: newValue })
                      }, true);
                    } catch (err) {
                      console.error('Tercih kaydedilemedi:', err);
                    }
                  }}
                  style={{ marginTop: '0.125rem', width: '18px', height: '18px', cursor: 'pointer' }} 
                />
                <div style={{ flex: 1 }}>
                  <p style={{ color: 'white', fontSize: '0.9rem', margin: '0 0 0.25rem', fontWeight: 500 }}>Paylaşım loglarını sakla</p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Link tıklamalarını istatistikler için saklar</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 70 }}>
          <div style={{ width: 'min(460px,90%)', background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', backdropFilter: 'blur(20px)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 24, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: 0, fontSize: 18, marginBottom: 16, color: 'white', fontWeight: 600 }}>Şifre Değiştir</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 8 }}>Mevcut Şifre</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 14,
                    outline: 'none'
                  }}
                  placeholder="Mevcut şifreniz"
                />
              </div>
              <div>
                <label style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 8 }}>Yeni Şifre</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 14,
                    outline: 'none'
                  }}
                  placeholder="Yeni şifre (en az 6 karakter)"
                />
              </div>
              <div>
                <label style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: 8 }}>Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 14,
                    outline: 'none'
                  }}
                  placeholder="Yeni şifrenizi tekrar girin"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPasswordModal(false)} disabled={isUpdating} style={{ padding: '10px 20px', fontSize: 14, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>İptal</button>
              <button onClick={handleSubmitPasswordChange} disabled={isUpdating} style={{ padding: '10px 20px', fontSize: 14, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {isUpdating ? 'Değiştiriliyor...' : 'Değiştir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty Trash Confirm Modal */}
      {showEmptyTrashConfirm && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 70 }}>
          <div style={{ 
            width: 'min(460px,90%)', 
            background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)', 
            backdropFilter: 'blur(20px)', 
            border: '1px solid rgba(148,163,184,0.2)', 
            borderRadius: 24, 
            padding: 28, 
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)' 
          }}>
            <h3 style={{ margin: 0, fontSize: 18, marginBottom: 16, color: 'white', fontWeight: 600 }}>
              Çöp Kutusunu Boşalt
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 0, marginBottom: 24, lineHeight: 1.6 }}>
              Çöp kutusundaki tüm dosyalar kalıcı olarak silinecek. Devam etmek istiyor musun?
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowEmptyTrashConfirm(false)} 
                disabled={emptyingTrash} 
                style={{ 
                  padding: '10px 20px', 
                  fontSize: 14, 
                  borderRadius: 12, 
                  background: 'rgba(255,255,255,0.1)', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  color: 'white', 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
              >
                İptal
              </button>
              <button 
                onClick={handleConfirmEmptyTrash} 
                disabled={emptyingTrash} 
                style={{ 
                  padding: '10px 20px', 
                  fontSize: 14, 
                  borderRadius: 12, 
                  background: emptyingTrash ? 'rgba(239,68,68,0.5)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                  border: 'none', 
                  color: 'white', 
                  cursor: emptyingTrash ? 'not-allowed' : 'pointer', 
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  opacity: emptyingTrash ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!emptyingTrash) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(239,68,68,0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {emptyingTrash ? 'Boşaltılıyor...' : 'Tamam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Files PIN Modal */}
      {showPinModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '16px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ 
              margin: '0 0 1.5rem 0', 
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#1f2937'
            }}>
              {pinAction === 'set' && 'Gizli Dosyalar PIN\'i Ayarla'}
              {pinAction === 'change' && 'PIN\'i Değiştir'}
              {pinAction === 'remove' && 'PIN\'i Kaldır'}
            </h3>

            {pinAction === 'remove' ? (
              <div>
                <p style={{ 
                  marginBottom: '1.5rem',
                  color: '#6b7280',
                  lineHeight: 1.6
                }}>
                  Gizli dosyalar PIN korumasını kaldırmak istediğinize emin misiniz? Gizli dosyalarınız PIN olmadan erişilebilir olacak.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleSubmitPin}
                    disabled={isPinLoading}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: isPinLoading ? 0.7 : 1
                    }}
                  >
                    {isPinLoading ? 'Kaldırılıyor...' : 'PIN\'i Kaldır'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPinModal(false);
                      setPinInput("");
                      setPinConfirmInput("");
                    }}
                    disabled={isPinLoading}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: 'white',
                      color: '#6b7280',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ 
                  marginBottom: '1.5rem',
                  color: '#6b7280',
                  lineHeight: 1.6
                }}>
                  {pinAction === 'set' 
                    ? 'Gizli dosyalarınızı korumak için 4 haneli bir PIN oluşturun.'
                    : 'Yeni 4 haneli PIN kodunuzu girin.'}
                </p>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem', 
                    color: '#374151',
                    fontSize: '0.9rem',
                    fontWeight: 600
                  }}>
                    {pinAction === 'set' ? 'PIN' : 'Yeni PIN'}
                  </label>
                  <input
                    type="password"
                    placeholder="4 haneli PIN"
                    value={pinInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 4) setPinInput(val);
                    }}
                    maxLength={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1.2rem',
                      textAlign: 'center',
                      letterSpacing: '0.5em'
                    }}
                  />
                </div>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem', 
                    color: '#374151',
                    fontSize: '0.9rem',
                    fontWeight: 600
                  }}>
                    PIN\'i Onayla
                  </label>
                  <input
                    type="password"
                    placeholder="PIN\'i tekrar girin"
                    value={pinConfirmInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 4) setPinConfirmInput(val);
                    }}
                    maxLength={4}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pinInput.length === 4 && pinConfirmInput.length === 4) {
                        handleSubmitPin();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1.2rem',
                      textAlign: 'center',
                      letterSpacing: '0.5em'
                    }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleSubmitPin}
                    disabled={isPinLoading || pinInput.length !== 4 || pinConfirmInput.length !== 4}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: (pinInput.length === 4 && pinConfirmInput.length === 4)
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: (pinInput.length === 4 && pinConfirmInput.length === 4) ? 'pointer' : 'not-allowed',
                      opacity: isPinLoading ? 0.7 : 1
                    }}
                  >
                    {isPinLoading ? 'Kaydediliyor...' : pinAction === 'set' ? 'PIN\'i Ayarla' : 'PIN\'i Değiştir'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPinModal(false);
                      setPinInput("");
                      setPinConfirmInput("");
                    }}
                    disabled={isPinLoading}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: 'white',
                      color: '#6b7280',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ 
              margin: '0 0 1.5rem 0', 
              fontSize: '1.5rem',
              fontWeight: 600
            }}>
              {isTwoFactorEnabled ? 'İki Aşamalı Doğrulamayı Devre Dışı Bırak' : 'İki Aşamalı Doğrulamayı Etkinleştir'}
            </h3>

            {!isTwoFactorEnabled ? (
              // Enable 2FA Flow
              <div>
                {qrCode ? (
                  <div>
                    <p style={{ 
                      marginBottom: '1.5rem',
                      color: '#6b7280',
                      lineHeight: 1.6
                    }}>
                      Authenticator uygulamanızla (Google Authenticator, Authy, vb.) bu QR kodunu tarayın ve ardından uygulamadaki 6 haneli kodu girin.
                    </p>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: '1.5rem',
                      padding: '1rem',
                      background: '#f9fafb',
                      borderRadius: '12px'
                    }}>
                      <img src={qrCode} alt="QR Code" style={{ width: '200px', height: '200px' }} />
                    </div>
                    <input
                      type="text"
                      placeholder="6 haneli doğrulama kodu"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      maxLength={6}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        marginBottom: '1.5rem',
                        textAlign: 'center',
                        letterSpacing: '0.5em'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button
                        onClick={handleVerify2FA}
                        disabled={is2FALoading || verificationCode.length !== 6}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          background: verificationCode.length === 6 
                            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                            : '#9ca3af',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          fontWeight: 600,
                          cursor: verificationCode.length === 6 ? 'pointer' : 'not-allowed',
                          opacity: is2FALoading ? 0.7 : 1
                        }}
                      >
                        {is2FALoading ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
                      </button>
                      <button
                        onClick={() => {
                          setShow2FAModal(false);
                          setQrCode(null);
                          setVerificationCode('');
                        }}
                        disabled={is2FALoading}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          background: 'white',
                          color: '#6b7280',
                          border: '2px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{
                      width: '50px',
                      height: '50px',
                      border: '4px solid #e5e7eb',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto'
                    }}></div>
                    <p style={{ marginTop: '1rem', color: '#6b7280' }}>QR kod oluşturuluyor...</p>
                  </div>
                )}
              </div>
            ) : (
              // Disable 2FA Flow
              <div>
                <p style={{ 
                  marginBottom: '1.5rem',
                  color: '#6b7280',
                  lineHeight: 1.6
                }}>
                  İki aşamalı doğrulamayı devre dışı bırakmak için lütfen şifrenizi girin.
                </p>
                <input
                  type="password"
                  placeholder="Şifreniz"
                  value={disable2FAPassword}
                  onChange={(e) => setDisable2FAPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    marginBottom: '1.5rem'
                  }}
                />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleDisable2FA}
                    disabled={is2FALoading || !disable2FAPassword}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: disable2FAPassword 
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: disable2FAPassword ? 'pointer' : 'not-allowed',
                      opacity: is2FALoading ? 0.7 : 1
                    }}
                  >
                    {is2FALoading ? 'Devre Dışı Bırakılıyor...' : 'Devre Dışı Bırak'}
                  </button>
                  <button
                    onClick={() => {
                      setShow2FAModal(false);
                      setDisable2FAPassword('');
                    }}
                    disabled={is2FALoading}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      background: 'white',
                      color: '#6b7280',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'success' 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 100,
          animation: 'slideUp 0.3s ease-out',
          minWidth: '300px',
          justifyContent: 'center'
        }}>
          {toast.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateX(-50%) translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
