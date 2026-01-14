"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("🔵 Form submitted, email:", email, "recoveryKey:", recoveryKey);
    setError(null);
    setLoading(true);

    if (!email && !recoveryKey) {
      setError("E-posta adresi veya kurtarma anahtarı gereklidir.");
      setLoading(false);
      return;
    }

    try {
      console.log("🔵 Sending request to backend...");
      const response = await fetch("http://localhost:5001/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email: email || undefined,
          recoveryKey: recoveryKey || undefined
        }),
      });

      console.log("🔵 Response received:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Error response:", errorData);
        throw new Error(errorData.message || "Şifre sıfırlama linki gönderilemedi");
      }

      console.log("✅ Success!");
      setSuccess(true);
    } catch (err: any) {
      console.error("❌ Exception:", err);
      setError(err.message || "Bir hata oluştu");
    } finally {
      setLoading(false);
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
            <Link href="/login" className="auth-back-link">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Giriş Sayfasına Dön
            </Link>

            <div className="auth-welcome">
              <h2 className="auth-welcome-title">Şifremi Unuttum</h2>
              <p className="auth-welcome-text">
                E-posta adresiniz veya kurtarma anahtarınızı girin, size şifre sıfırlama linki gönderelim
              </p>
            </div>

            {success ? (
              <div className="modern-success-card">
                <div className="success-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="success-title">E-posta Gönderildi!</h3>
                <p className="success-message">
                  Şifre sıfırlama linki gönderildi.
                  <br /><br />
                  Lütfen e-postanızı kontrol edin ve gelen kutunuzu ya da spam klasörünüzü kontrol etmeyi unutmayın.
                  <br /><br />
                  <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    ⏱️ Link 1 saat geçerli olacaktır.
                  </span>
                </p>
                <Link href="/login" className="modern-auth-button" style={{ 
                  textDecoration: 'none', 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  Giriş Sayfasına Dön
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="modern-auth-form">
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="modern-form-input"
                    placeholder="ornek@email.com"
                    autoComplete="email"
                  />
                </div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Veya kurtarma anahtarını kullan
                </p>
              </div>

              <div className="modern-form-group">
                <label className="modern-form-label" htmlFor="recoveryKey">
                  KURTARMA ANAHTARI
                </label>
                <div className="modern-input-wrapper">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="input-icon">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <input
                    id="recoveryKey"
                    type="password"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    className="modern-form-input"
                    placeholder="Kurtarma anahtarını girin"
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
                disabled={loading}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Gönderiliyor...
                  </span>
                ) : (
                  <>
                    Şifre Sıfırlama Linki Gönder
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                )}
              </button>
            </form>
            )}

            <div className="modern-auth-footer">
              <span className="footer-text">Şifrenizi hatırladınız mı?</span>
              <Link href="/login" className="modern-auth-link" style={{ color: '#000' }}>
                Giriş Yapın
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

        .auth-back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #8b5cf6;
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          transition: all 0.3s;
        }

        .auth-back-link:hover {
          gap: 0.75rem;
          color: #6366f1;
        }

        .auth-welcome {
          text-align: center;
          margin-bottom: 2rem;
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

        .modern-success-card {
          background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
          border: 2px solid #6ee7b7;
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          text-align: center;
          animation: slideIn 0.5s ease-out;
        }

        .success-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 0.75rem;
          color: #059669;
          animation: scaleIn 0.6s ease-out;
        }

        .success-icon svg {
          width: 40px;
          height: 40px;
        }

        .success-title {
          font-size: 1.35rem;
          font-weight: 700;
          color: #065f46;
          margin-bottom: 0.5rem;
        }

        .success-message {
          font-size: 0.85rem;
          color: #047857;
          line-height: 1.4;
          margin-bottom: 1.25rem;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scaleIn {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
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
        }
      `}</style>
    </div>
  );
}
