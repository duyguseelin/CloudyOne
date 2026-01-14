"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { initializeMasterKey } from "../../lib/crypto/keyManager";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  
  // 2FA states
  const [requires2FA, setRequires2FA] = useState(false);
  const [temp2FAToken, setTemp2FAToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // Sayfa yüklendiğinde kayıtlı email'i yükle
  useEffect(() => {
    const savedRememberMe = localStorage.getItem("rememberMe") === "true";
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedRememberMe && savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
      
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Giriş yapılamadı");
      }

      const data = await response.json();
      
      // ⚡ 2FA kontrolü
      if (data.requires2FA) {
        setRequires2FA(true);
        setTemp2FAToken(data.temp2FAToken);
        setLoading(false);
        return;
      }
      
      // Normal login (2FA yok)
      await completeLogin(data);
    } catch (err: any) {
      setError(err.message || "Giriş yapılamadı");
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
      
      const response = await fetch(`${API_BASE}/auth/2fa/verify-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          temp2FAToken, 
          code: twoFactorCode 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Doğrulama başarısız");
      }

      const data = await response.json();
      await completeLogin(data);
    } catch (err: any) {
      setError(err.message || "2FA doğrulama başarısız");
    } finally {
      setLoading(false);
    }
  }

  async function completeLogin(data: any) {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
    
    // Beni Hatırla seçiliyse localStorage, değilse sessionStorage kullan
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("token", data.token);
    storage.setItem("user", JSON.stringify(data.user));
    
    // Hangi storage kullanıldığını işaretle
    localStorage.setItem("authStorage", rememberMe ? "local" : "session");
    
    // Beni Hatırla - email'i kaydet veya sil
    if (rememberMe) {
      localStorage.setItem("rememberMe", "true");
      localStorage.setItem("rememberedEmail", email);
    } else {
      localStorage.setItem("rememberMe", "false");
      localStorage.removeItem("rememberedEmail");
    }
    
    // 🔑 Tarayıcıya şifreyi kaydetmesi için Credential Management API
    if ('credentials' in navigator && 'PasswordCredential' in window) {
      try {
        const credential = new (window as any).PasswordCredential({
          id: email,
          password: password,
          name: email,
        });
        await navigator.credentials.store(credential);
        console.log("🔑 Şifre tarayıcıya kaydedildi");
      } catch (credErr) {
        console.log("Credential API kullanılamadı:", credErr);
      }
    }
    
    // 🔐 Şifreleme için master key türet ve memory'de sakla
    try {
      const cryptoInitRes = await fetch(`${API_BASE}/api/crypto/init`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${data.token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (cryptoInitRes.ok) {
        const cryptoData = await cryptoInitRes.json();
        // Master key'i kullanıcı parolasından türet ve memory'de sakla
        await initializeMasterKey(
          password, 
          cryptoData.kdfSalt, 
          typeof cryptoData.kdfParams === 'string' 
            ? JSON.parse(cryptoData.kdfParams) 
            : cryptoData.kdfParams
        );
        console.log("🔐 Şifreleme anahtarı hazır");
      }
    } catch (cryptoErr) {
      console.warn("Şifreleme anahtarı oluşturulamadı:", cryptoErr);
      // Şifreleme hatası login'i engellemez, sadece log'la
    }
    
    // Redirect parametresini kontrol et
    const redirectUrl = searchParams?.get('redirect');
    const pendingInviteToken = localStorage.getItem('pendingInviteToken');
    const inviteEmail = localStorage.getItem('inviteEmail');
    const inviteTokenFromUrl = searchParams?.get('inviteToken');
    
    if (pendingInviteToken) {
      // Bekleyen davet varsa ona yönlendir
      localStorage.removeItem('pendingInviteToken');
      localStorage.removeItem('inviteEmail');
      router.push(`/team/invite/${pendingInviteToken}`);
    } else if (inviteTokenFromUrl) {
      // Email'den gelen inviteToken'ı localStorage'a sakla
      localStorage.setItem('inviteToken', inviteTokenFromUrl);
      // Ekip yönetim sayfasına yönlendir
      router.push("/files/team");
    } else if (redirectUrl) {
      // URL'de redirect parametresi varsa oraya yönlendir
      router.push(redirectUrl);
    } else {
      // Normal akış
      router.push("/files");
    }
  }

  return (
    <div className="modern-auth-page">
      <Link href="/" className="modern-auth-logo-link" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        position: 'absolute',
        top: '2rem',
        left: '2rem',
        zIndex: 10
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
        }}>
          ☁️
        </div>
        <span style={{ 
          fontSize: '20px', 
          fontWeight: '700',
          color: 'white'
        }}>CloudyOne</span>
      </Link>

      <div className="modern-auth-container">
        {/* Sol taraf - İllüstrasyon */}
        <div className="modern-auth-illustration">
          <div className="illustration-content">
            <div className="floating-cloud cloud-1">
              <svg width="80" height="60" viewBox="0 0 80 60" fill="none">
                <path d="M20 40C20 31.7157 26.7157 25 35 25C35.7364 25 36.4622 25.0486 37.1745 25.1432C38.9033 17.3235 45.7594 11.5 54 11.5C63.665 11.5 71.5 19.335 71.5 29C71.5 29.3444 71.4896 29.6865 71.469 30.0259C75.5487 31.5091 78.5 35.4555 78.5 40C78.5 45.799 73.799 50.5 68 50.5H24C17.0964 50.5 11.5 44.9036 11.5 38C11.5 32.0964 15.5964 27.0964 21 25.6432" 
                      fill="url(#cloud-gradient-1)" opacity="0.8"/>
                <defs>
                  <linearGradient id="cloud-gradient-1" x1="11.5" y1="25" x2="78.5" y2="50.5" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818cf8"/>
                    <stop offset="1" stopColor="#a78bfa"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="floating-cloud cloud-2">
              <svg width="100" height="70" viewBox="0 0 100 70" fill="none">
                <path d="M25 50C25 39.5066 33.5066 31 44 31C44.9205 31 45.8278 31.0608 46.7182 31.1789C48.8791 21.6544 57.1992 14.5 67.5 14.5C79.5812 14.5 89.5 24.4188 89.5 36.5C89.5 36.9305 89.4869 37.3581 89.4613 37.7824C94.4359 39.6364 98 44.4444 98 50C98 57.1797 92.1797 63 85 63H30C21.4401 63 14.5 56.0599 14.5 47.5C14.5 40.1205 19.3704 33.8704 26 31.8039"
                      fill="url(#cloud-gradient-2)" opacity="0.6"/>
                <defs>
                  <linearGradient id="cloud-gradient-2" x1="14.5" y1="31" x2="98" y2="63" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#a78bfa"/>
                    <stop offset="1" stopColor="#c4b5fd"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="floating-cloud cloud-3">
              <svg width="70" height="50" viewBox="0 0 70 50" fill="none">
                <path d="M18 35C18 28.3726 23.3726 23 30 23C30.6205 23 31.2312 23.0405 31.8285 23.1195C33.2527 16.9313 38.7995 12.25 45.5 12.25C53.5081 12.25 60 18.7419 60 26.75C60 27.0537 59.9908 27.3552 59.9726 27.6542C63.366 28.8909 65.75 32.1629 65.75 36C65.75 40.8325 61.8325 44.75 57 44.75H21C15.6152 44.75 11.25 40.3848 11.25 35C11.25 30.2348 14.6152 26.2348 19 24.8526"
                      fill="url(#cloud-gradient-3)" opacity="0.7"/>
                <defs>
                  <linearGradient id="cloud-gradient-3" x1="11.25" y1="23" x2="65.75" y2="44.75" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#c4b5fd"/>
                    <stop offset="1" stopColor="#ddd6fe"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="floating-cloud cloud-4">
              <svg width="90" height="65" viewBox="0 0 90 65" fill="none">
                <path d="M22 45C22 36.7157 28.7157 30 37 30C37.7828 30 38.5535 30.0541 39.3088 30.1596C40.8626 21.3794 48.4794 14.75 57.5 14.75C67.7173 14.75 76 23.0327 76 33.25C76 33.6256 75.9889 33.9987 75.9668 34.3692C80.4358 35.7864 83.5 40.0489 83.5 45C83.5 51.3513 78.3513 56.5 72 56.5H27C19.8203 56.5 14 50.6797 14 43.5C14 37.3203 18.3203 32.1203 24 30.3621"
                      fill="url(#cloud-gradient-4)" opacity="0.5"/>
                <defs>
                  <linearGradient id="cloud-gradient-4" x1="14" y1="30" x2="83.5" y2="56.5" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818cf8"/>
                    <stop offset="1" stopColor="#a78bfa"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="storage-icon">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="50" fill="url(#icon-gradient)" opacity="0.2"/>
                <path d="M40 35C40 31.6863 42.6863 29 46 29H74C77.3137 29 80 31.6863 80 35V85C80 88.3137 77.3137 91 74 91H46C42.6863 91 40 88.3137 40 85V35Z" 
                      fill="url(#icon-gradient-2)" stroke="white" strokeWidth="2"/>
                <path d="M50 45H70M50 55H70M50 65H70" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="60" cy="78" r="3" fill="white"/>
                <defs>
                  <linearGradient id="icon-gradient" x1="10" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b5cf6"/>
                    <stop offset="1" stopColor="#6366f1"/>
                  </linearGradient>
                  <linearGradient id="icon-gradient-2" x1="40" y1="29" x2="80" y2="91" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8b5cf6"/>
                    <stop offset="1" stopColor="#6366f1"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h2 className="illustration-title">Dosyalarınıza<br/>Her Yerden Erişin</h2>
            <p className="illustration-subtitle">Güvenli bulut depolama ile verileriniz her zaman yanınızda</p>
          </div>
        </div>

        {/* Sağ taraf - Form */}
        <div className="modern-auth-form-container">
          <div className="modern-auth-card">
            <div className="auth-welcome">
              <h2 className="auth-welcome-title">
                {requires2FA ? "İki Faktörlü Doğrulama" : "Hoş Geldiniz"}
              </h2>
              <p className="auth-welcome-text">
                {requires2FA 
                  ? "Authenticator uygulamanızdaki 6 haneli kodu girin" 
                  : "Hesabınıza giriş yapın"}
              </p>
            </div>

            {!requires2FA ? (
              <form onSubmit={handleSubmit} className="modern-auth-form" autoComplete="on" name="login-form">
                <div className="modern-form-group">
                  <label className="modern-form-label" htmlFor="email">
                    E-POSTA ADRESİ
                  </label>
                  <div className="modern-input-wrapper">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="input-icon">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="modern-form-input"
                      placeholder="ornek@email.com"
                      autoComplete="username email"
                    />
                  </div>
                </div>

                <div className="modern-form-group">
                  <label className="modern-form-label" htmlFor="password">
                    ŞİFRE
                    <Link href="/forgot-password" className="forgot-link" style={{ float: 'right', textTransform: 'none' }}>
                      Şifremi Unuttum
                    </Link>
                  </label>
                  <div className="modern-input-wrapper" style={{ position: 'relative' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="input-icon">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="modern-form-input"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={{ paddingRight: '45px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(100, 116, 139, 0.7)',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#8b5cf6'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(100, 116, 139, 0.7)'}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="remember-me-container" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem'
                }}>
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: '#8b5cf6',
                      cursor: 'pointer'
                    }}
                  />
                  <label 
                    htmlFor="rememberMe" 
                    style={{
                      fontSize: '14px',
                      color: '#1e293b',
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontWeight: '500'
                    }}
                  >
                    Beni Hatırla
                  </label>
                </div>

                {error && (
                  <div className="modern-auth-error">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="modern-auth-submit"
                  disabled={loading}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                      <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Giriş Yapılıyor...
                    </span>
                  ) : (
                    <>
                      Giriş Yap
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handle2FASubmit} className="modern-auth-form">
                <div style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="white" style={{ margin: '0 auto' }}>
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                  </svg>
                </div>
                
                <div className="modern-form-group">
                  <label className="modern-form-label" htmlFor="twoFactorCode">
                    DOĞRULAMA KODU
                  </label>
                  <div className="modern-input-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="input-icon">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                    </svg>
                    <input
                      id="twoFactorCode"
                      name="twoFactorCode"
                      type="text"
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="modern-form-input"
                      placeholder="000000"
                      maxLength={6}
                      autoComplete="one-time-code"
                      style={{
                        fontSize: '24px',
                        letterSpacing: '0.5em',
                        textAlign: 'center',
                        fontWeight: '600'
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="modern-auth-error">
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="modern-auth-submit"
                  disabled={loading || twoFactorCode.length !== 6}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                      <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Doğrulanıyor...
                    </span>
                  ) : (
                    "Doğrula ve Giriş Yap"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRequires2FA(false);
                    setTwoFactorCode("");
                    setTemp2FAToken("");
                    setError(null);
                  }}
                  style={{
                    marginTop: '1rem',
                    width: '100%',
                    padding: '0.75rem',
                    background: 'transparent',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    color: '#64748b',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#8b5cf6';
                    e.currentTarget.style.color = '#8b5cf6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#64748b';
                  }}
                >
                  ← Geri Dön
                </button>
              </form>
            )}

            <div className="modern-auth-footer">
              <span className="footer-text">Hesabınız yok mu?</span>
              <Link href="/register" className="modern-auth-link" style={{ color: '#000' }}>
                Üye Ol
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modern-auth-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
          position: relative;
          overflow: hidden;
        }

        .modern-auth-logo-link {
          position: absolute;
          top: 2.5rem;
          left: 3rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: white;
          text-decoration: none;
          z-index: 10;
          transition: all 0.3s;
          opacity: 0.95;
        }

        .modern-auth-logo-link:hover {
          opacity: 1;
          transform: translateY(-2px);
        }

        .modern-auth-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 100vh;
          position: relative;
        }

        .modern-auth-illustration {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4rem;
          position: relative;
        }

        .illustration-content {
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .floating-cloud {
          position: absolute;
          animation: float 6s ease-in-out infinite;
        }

        .cloud-1 {
          top: 10%;
          left: 10%;
          animation-delay: 0s;
        }

        .cloud-2 {
          top: 60%;
          right: 10%;
          animation-delay: 1s;
        }

        .cloud-3 {
          top: 30%;
          right: 20%;
          animation-delay: 2s;
        }

        .cloud-4 {
          bottom: 15%;
          left: 15%;
          animation-delay: 1.5s;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        .storage-icon {
          margin: 0 auto 2rem;
          animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .illustration-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: white;
          margin: 0 0 1rem;
          line-height: 1.2;
        }

        .illustration-subtitle {
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.7);
          max-width: 400px;
          margin: 0 auto;
        }

        .modern-auth-form-container {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: transparent;
        }

        .modern-auth-card {
          width: 100%;
          max-width: 440px;
          background: rgba(255, 255, 255, 0.98);
          border-radius: 20px;
          padding: 2rem 2.5rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transform: translateY(30px) scale(0.95);
          animation: cardSlideUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }

        @keyframes cardSlideUp {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-5px) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .auth-logo-section {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .auth-logo-icon-large {
          font-size: 3rem;
          margin-bottom: 0.25rem;
        }

        .auth-brand-title {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }

        .auth-welcome {
          text-align: center;
          margin-bottom: 2rem;
          margin-top: 0;
        }

        .auth-welcome-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 0.5rem;
        }

        .auth-welcome-text {
          font-size: 0.9rem;
          color: #64748b;
          margin: 0;
        }

        .modern-auth-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .modern-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .modern-form-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.5px;
        }

        .modern-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: #94a3b8;
          pointer-events: none;
        }

        .modern-form-input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.75rem;
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.95rem;
          color: #1e293b;
          transition: all 0.3s;
        }

        .modern-form-input:focus {
          outline: none;
          border-color: #8b5cf6;
          background: white;
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
        }

        .modern-form-input::placeholder {
          color: #cbd5e1;
        }

        .forgot-link {
          font-size: 0.875rem;
          color: #8b5cf6;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.3s;
        }

        .forgot-link:hover {
          color: #6366f1;
        }

        .modern-auth-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05));
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #dc2626;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .modern-auth-submit {
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }

        .modern-auth-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
        }

        .modern-auth-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .modern-auth-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .modern-auth-footer {
          text-align: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .footer-text {
          color: #64748b;
          font-size: 0.95rem;
        }

        .modern-auth-link {
          color: #000 !important;
          text-decoration: none;
          font-weight: 800;
          font-size: 1rem;
          transition: all 0.3s;
        }

        .modern-auth-link:hover {
          color: #333 !important;
          text-decoration: underline;
          transform: translateX(2px);
        }

        @media (max-width: 1024px) {
          .modern-auth-container {
            grid-template-columns: 1fr;
          }
          
          .modern-auth-illustration {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .modern-auth-card {
            padding: 2rem 1.5rem;
          }

          .illustration-title {
            font-size: 2rem;
          }

          .auth-welcome-title {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}