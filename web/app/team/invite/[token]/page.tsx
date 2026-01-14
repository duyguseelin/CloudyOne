"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { 
  getStoredUser, 
  getTeamInviteByToken, 
  acceptTeamInvite, 
  declineTeamInvite,
  clearAuth
} from "../../../../lib/api";
import "../../../globals.css";

type InviteDetails = {
  id: string;
  email: string;
  role: string;
  teamName: string;
  teamDescription?: string;
  invitedBy: string;
  expiresAt: string;
};

export default function TeamInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [user, setUser] = useState<any>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Kullanıcı giriş yapmış mı kontrol et
    const stored = getStoredUser();
    setUser(stored);

    // Davet bilgilerini getir
    loadInviteDetails();
  }, [token]);

  const loadInviteDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTeamInviteByToken(token);
      setInvite(data);
    } catch (err: any) {
      setError(err.message || "Davet bilgileri alınamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user) {
      // Kullanıcı giriş yapmamış, login'e yönlendir
      // pendingInviteToken yerine inviteEmail de saklayabiliriz, böylece giriş sayfasında öneri gösterilir
      if (invite?.email) {
        localStorage.setItem('inviteEmail', invite.email);
      }
      localStorage.setItem('pendingInviteToken', token);
      router.push('/login?redirect=/team/invite/' + token);
      return;
    }

    setProcessing(true);
    try {
      const result = await acceptTeamInvite(token);
      setSuccess("🎉 Tebrikler! Ekibe başarıyla dahil oldunuz.");
      setTimeout(() => {
        router.push('/files/team');
      }, 2500);
    } catch (err: any) {
      let errorMsg = err.message || "Davet kabul edilemedi";
      
      // E-posta eşleşmemesi hatası
      if (errorMsg.includes("farklı bir e-posta") || errorMsg.includes("403")) {
        errorMsg = `Bu davet ${invite?.email} e-posta adresine gönderilmiş. Lütfen bu e-postaya giriş yaparak daveti kabul ediniz.`;
      }
      
      setError(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!user) {
      router.push('/');
      return;
    }

    setProcessing(true);
    try {
      await declineTeamInvite(token);
      setSuccess("Davet reddedildi");
      setTimeout(() => {
        router.push('/files');
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Davet reddedilemedi");
    } finally {
      setProcessing(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Yönetici';
      case 'EDITOR': return 'Düzenleyici';
      default: return 'İzleyici';
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Tüm dosyaları görüntüleyebilir, düzenleyebilir ve ekip üyelerini yönetebilirsiniz.';
      case 'EDITOR': return 'Ekip dosyalarını görüntüleyebilir ve düzenleyebilirsiniz.';
      default: return 'Ekip dosyalarını görüntüleyebilirsiniz.';
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            margin: '0 auto 1rem',
            border: '3px solid rgba(99, 102, 241, 0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p>Davet yükleniyor...</p>
        </div>
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}>
        <div style={{
          width: 'min(480px, 100%)',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '24px',
          padding: '3rem 2rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 1.5rem',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="#ef4444">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
          </div>
          
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.75rem' }}>
            Davet Geçersiz
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
            {error}
          </p>
          
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '0.875rem 2rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}>
        <div style={{
          width: 'min(480px, 100%)',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '24px',
          padding: '3rem 2rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 1.5rem',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="#22c55e">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
          
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.75rem' }}>
            Başarılı!
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
            {success}
          </p>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Yönlendiriliyorsunuz...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        width: 'min(520px, 100%)',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '28px',
        padding: '2.5rem',
        boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ color: 'white', fontSize: '1.25rem' }}>☁️</span>
            </div>
            <span style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>CloudyOne</span>
          </div>
          
          <h1 style={{ 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Ekip Daveti
          </h1>
          <p style={{ color: '#94a3b8' }}>
            <strong style={{ color: '#e2e8f0' }}>{invite?.invitedBy}</strong> sizi davet ediyor
          </p>
        </div>

        {/* Ekip Bilgileri */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                {invite?.teamName}
              </h2>
              {invite?.teamDescription && (
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  {invite.teamDescription}
                </p>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '10px'
          }}>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Rolünüz:</span>
            <span style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: invite?.role === 'ADMIN' ? 'rgba(139, 92, 246, 0.2)' : 
                         invite?.role === 'EDITOR' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              color: invite?.role === 'ADMIN' ? '#c4b5fd' : 
                     invite?.role === 'EDITOR' ? '#93c5fd' : '#94a3b8'
            }}>
              {getRoleDisplay(invite?.role || 'VIEWER')}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.75rem 0 0 0' }}>
            {getRoleDescription(invite?.role || 'VIEWER')}
          </p>
        </div>

        {/* Hata mesajı */}
        {error && (
          <div style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '10px',
            marginBottom: '1.5rem'
          }}>
            <p style={{ margin: '0 0 1rem 0', color: '#fca5a5', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </p>
            {error.includes("farklı") && user && (
              <button
                onClick={() => {
                  clearAuth();
                  router.push(`/login?redirect=/team/invite/${token}`);
                }}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Başka E-postadan Giriş Yap
              </button>
            )}
          </div>
        )}

        {/* Kullanıcı giriş yapmamışsa uyarı */}
        {!user && (
          <div style={{
            padding: '1rem 1.25rem',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '12px',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.25rem', marginTop: '0.125rem' }}>ℹ️</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#e0e7ff', fontSize: '0.9rem', fontWeight: 600 }}>
                  Daveti Kabul Etmek İçin Giriş Yapmanız Gerek
                </p>
                <p style={{ margin: 0, color: '#a5b4fc', fontSize: '0.85rem', lineHeight: '1.5' }}>
                  Henüz hesabınız yoksa, daveti kabul ederken ücretsiz olarak kayıt olabilirsiniz. 
                  Zaten bir hesabınız varsa, lütfen aşağıdaki "Giriş Yap ve Kabul Et" butonu tıklayınız.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Butonlar */}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleDecline}
            disabled={processing}
            style={{
              flex: 1,
              padding: '0.875rem 1.5rem',
              background: 'rgba(148, 163, 184, 0.1)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '12px',
              color: '#94a3b8',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.7 : 1
            }}
          >
            Reddet
          </button>
          <button
            onClick={handleAccept}
            disabled={processing}
            style={{
              flex: 2,
              padding: '0.875rem 1.5rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.7 : 1,
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)'
            }}
          >
            {processing ? 'İşleniyor...' : user ? 'Daveti Kabul Et' : 'Giriş Yap ve Kabul Et'}
          </button>
        </div>

        {/* Alt bilgi */}
        <p style={{ 
          textAlign: 'center', 
          color: '#64748b', 
          fontSize: '0.75rem', 
          marginTop: '1.5rem' 
        }}>
          Bu davet <strong>{new Date(invite?.expiresAt || '').toLocaleDateString('tr-TR')}</strong> tarihine kadar geçerlidir.
        </p>
      </div>
    </div>
  );
}
