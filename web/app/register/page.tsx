"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateRecoveryMnemonic } from "@/lib/crypto/recovery";
import { RecoveryModal } from "@/components/RecoveryModal";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);

  // Güçlü şifre validasyonu
  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Şifre en az 8 karakter olmalıdır';
    }
    if (!/[a-z]/.test(password)) {
      return 'Şifre en az 1 küçük harf içermelidir';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Şifre en az 1 büyük harf içermelidir';
    }
    if (!/\d/.test(password)) {
      return 'Şifre en az 1 rakam içermelidir';
    }
    if (!/[@$!%*?&.,#^()\-_=+]/.test(password)) {
      return 'Şifre en az 1 özel karakter içermelidir (@$!%*?&.,#)';
    }
    return null;
  };

  // Şifre gücü hesapla (0-100)
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

  // Mail doğrulama kodu gönder
  const sendVerificationCode = async () => {
    if (!email) {
      setError("Lütfen email adresinizi girin");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("http://localhost:5001/auth/send-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Doğrulama kodu gönderilemedi");
      }

      setVerificationSent(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Doğrulama kodu gönderilemedi");
    } finally {
      setLoading(false);
    }
  };

  // Mail doğrulamasını kontrol et
  const verifyEmail = async () => {
    if (!verificationCode) {
      setError("Lütfen doğrulama kodunu girin");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:5001/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Email doğrulaması başarısız");
      }

      setEmailVerified(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Email doğrulaması başarısız");
    } finally {
      setLoading(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Email doğrulaması kontrolü
    if (!emailVerified) {
      setError("Lütfen email adresinizi doğrulayın");
      return;
    }

    // Şifre validasyonu
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      // 1. Generate recovery key BEFORE registration
      const mnemonic = generateRecoveryMnemonic();
      setRecoveryKey(mnemonic);
      
      // 2. Register user
      const response = await fetch("http://localhost:5001/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Kayıt yapılamadı");
      }

      const data = await response.json();
      
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      // 3. Show recovery key modal
      setShowRecoveryModal(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Kayıt yapılamadı");
      setLoading(false);
    }
  }

  function handleRecoveryConfirm() {
    setShowRecoveryModal(false);
    router.push("/select-plan");
  }

  function downloadRecoveryKey() {
    if (!recoveryKey) return;
    
    const blob = new Blob([
      `CloudyOne Recovery Key\n\n` +
      `Email: ${email}\n` +
      `Date: ${new Date().toLocaleString()}\n\n` +
      `Recovery Key (24 words):\n${recoveryKey}\n\n` +
      `⚠️ CRITICAL: Store this recovery key in a safe place!\n` +
      `If you forget your password, this is the ONLY way to recover your files.`
    ], { type: 'text/plain' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudyone-recovery-key-${email}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyRecoveryKey() {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    alert('Recovery key kopyalandı!');
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
            <h2 className="illustration-title">Hemen<br/>Başlayın!</h2>
            <p className="illustration-subtitle">Ücretsiz 1 GB depolama alanı ile dosyalarınızı güvenle saklayın</p>
          </div>
        </div>

        {/* Sağ taraf - Form */}
        <div className="modern-auth-form-container">
          <div className="modern-auth-card">
            <div className="auth-welcome">
              <h2 className="auth-welcome-title">Hesap Oluşturun</h2>
              <p className="auth-welcome-text">Ücretsiz hesabınızı oluşturun</p>
            </div>

            <form onSubmit={handleSubmit} className="modern-auth-form">
              <div className="modern-form-group">
                <label className="modern-form-label" htmlFor="name">
                  İSİM (İSTEĞE BAĞLI)
                </label>
                <div className="modern-input-wrapper">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="input-icon">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="modern-form-input"
                    placeholder="Adınız Soyadınız"
                    autoComplete="name"
                  />
                </div>
              </div>

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
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="modern-form-input"
                    placeholder="ornek@email.com"
                    autoComplete="email"
                    disabled={emailVerified}
                  />
                  {emailVerified && (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="#22c55e" style={{ marginLeft: '0.5rem' }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                
                {!emailVerified && !verificationSent && (
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={loading || !email}
                    style={{
                      fontSize: '0.875rem',
                      color: '#8b5cf6',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.5rem 0',
                      marginTop: '0.5rem',
                      textDecoration: 'underline'
                    }}
                  >
                    Doğrulama Kodu Gönder
                  </button>
                )}

                {verificationSent && !emailVerified && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="modern-form-group" style={{ gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="Doğrulama kodunu girin (6 hane)"
                        className="modern-form-input"
                        style={{
                          fontSize: '0.95rem',
                          padding: '0.75rem 1rem'
                        }}
                      />
                      <button
                        type="button"
                        onClick={verifyEmail}
                        disabled={loading || !verificationCode}
                        style={{
                          fontSize: '0.875rem',
                          color: '#fff',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          marginTop: '0.5rem'
                        }}
                      >
                        {loading ? "Doğrulanıyor..." : "Doğrula"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="modern-form-group">
                <label className="modern-form-label" htmlFor="password">
                  ŞİFRE
                </label>
                <div className="modern-input-wrapper">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="input-icon">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="modern-form-input"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#94a3b8' }}>
                      {showPassword ? (
                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      ) : (
                        <path fillRule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zM8 9a2 2 0 104 0 2 2 0 00-4 0z" clipRule="evenodd" />
                      )}
                    </svg>
                  </button>
                </div>

                {/* Şifre Gücü Barı */}
                {password && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>ŞİFRE GÜCÜ</span>
                      <span style={{ fontSize: '0.75rem', color: getPasswordStrength(password) < 50 ? '#ef4444' : getPasswordStrength(password) < 80 ? '#f59e0b' : '#22c55e' }}>
                        {getPasswordStrength(password) < 50 ? 'Zayıf' : getPasswordStrength(password) < 80 ? 'Orta' : 'Güçlü'}
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '6px',
                      background: '#e2e8f0',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${getPasswordStrength(password)}%`,
                        height: '100%',
                        background: getPasswordStrength(password) < 50 ? '#ef4444' : getPasswordStrength(password) < 80 ? '#f59e0b' : '#22c55e',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}

                {/* Şifre Koşulları */}
                {password && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: 'rgba(139, 92, 246, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    borderRadius: '10px'
                  }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', margin: '0 0 0.75rem 0' }}>ŞİFRE KOŞULLARI</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: password.length >= 8 ? '#22c55e' : '#cbd5e1' }}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: password.length >= 8 ? '#22c55e' : '#94a3b8' }}>En az 8 karakter</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: /[a-z]/.test(password) ? '#22c55e' : '#cbd5e1' }}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: /[a-z]/.test(password) ? '#22c55e' : '#94a3b8' }}>1 küçük harf (a-z)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: /[A-Z]/.test(password) ? '#22c55e' : '#cbd5e1' }}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: /[A-Z]/.test(password) ? '#22c55e' : '#94a3b8' }}>1 büyük harf (A-Z)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: /\d/.test(password) ? '#22c55e' : '#cbd5e1' }}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: /\d/.test(password) ? '#22c55e' : '#94a3b8' }}>1 rakam (0-9)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: /[@$!%*?&.,#^()\-_=+]/.test(password) ? '#22c55e' : '#cbd5e1' }}>
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: /[@$!%*?&.,#^()\-_=+]/.test(password) ? '#22c55e' : '#94a3b8' }}>1 özel karakter (@$!%*?&)</span>
                      </div>
                    </div>
                  </div>
                )}

                <p className="password-hint" style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.5)',
                  marginTop: '6px',
                  lineHeight: '1.4',
                  display: 'none'
                }}>
                  Min. 8 karakter, 1 büyük harf, 1 küçük harf, 1 rakam, 1 özel karakter
                </p>
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
                    Kaydediliyor...
                  </span>
                ) : (
                  <>
                    Hesap Oluştur
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="modern-auth-footer">
              <span className="footer-text">Zaten hesabınız var mı?</span>
              <Link href="/login" className="modern-auth-link" style={{ color: '#000' }}>
                Giriş Yap
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

      {/* Recovery Key Modal */}
      {showRecoveryModal && recoveryKey && (
        <RecoveryModal 
          recoveryKey={recoveryKey}
          email={email}
          onConfirm={handleRecoveryConfirm}
        />
      )}
    </div>
  );
}