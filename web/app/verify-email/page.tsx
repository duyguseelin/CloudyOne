"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('Doğrulama token\'ı bulunamadı.');
      return;
    }

    // Backend'e doğrulama isteği gönder
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/account/verify-email/${token}`)
      .then(async (res) => {
        const data = await res.json();
        
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'E-posta başarıyla doğrulandı!');
          
          // 3 saniye sonra login sayfasına yönlendir
          setTimeout(() => {
            router.push('/login');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.message || 'E-posta doğrulanırken bir hata oluştu.');
        }
      })
      .catch((err) => {
        console.error('Verification error:', err);
        setStatus('error');
        setMessage('Bağlantı hatası oluştu.');
      });
  }, [searchParams, router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {status === 'loading' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px'
            }} />
            <h1 style={{
              fontSize: '24px',
              color: '#1e293b',
              marginBottom: '12px'
            }}>E-posta Doğrulanıyor...</h1>
            <p style={{ color: '#64748b' }}>Lütfen bekleyin</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '80px',
              height: '80px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '40px'
            }}>✓</div>
            <h1 style={{
              fontSize: '28px',
              color: '#1e293b',
              marginBottom: '12px',
              fontWeight: '700'
            }}>Başarılı!</h1>
            <p style={{
              color: '#64748b',
              fontSize: '16px',
              marginBottom: '20px'
            }}>{message}</p>
            <p style={{
              color: '#94a3b8',
              fontSize: '14px'
            }}>Giriş sayfasına yönlendiriliyorsunuz...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '80px',
              height: '80px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '40px',
              color: 'white'
            }}>✕</div>
            <h1 style={{
              fontSize: '28px',
              color: '#1e293b',
              marginBottom: '12px',
              fontWeight: '700'
            }}>Hata!</h1>
            <p style={{
              color: '#64748b',
              fontSize: '16px',
              marginBottom: '30px'
            }}>{message}</p>
            <button
              onClick={() => router.push('/login')}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Giriş Sayfasına Dön
            </button>
          </>
        )}

        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 24px'
          }} />
          <h1 style={{
            fontSize: '24px',
            color: '#1e293b',
            marginBottom: '12px'
          }}>Yükleniyor...</h1>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
