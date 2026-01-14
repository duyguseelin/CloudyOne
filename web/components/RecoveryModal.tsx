"use client";

import { useState } from "react";

interface RecoveryModalProps {
  recoveryKey: string;
  email: string;
  onConfirm: () => void;
}

// Toast bildirimi için tip
interface Toast {
  message: string;
  type: 'success' | 'info';
}

export function RecoveryModal({ recoveryKey, email, onConfirm }: RecoveryModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(message: string, type: 'success' | 'info' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function downloadRecoveryKey() {
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
    showToast('Recovery key dosyası indirildi!', 'success');
  }

  function copyRecoveryKey() {
    navigator.clipboard.writeText(recoveryKey);
    showToast('Recovery key panoya kopyalandı!', 'success');
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔑</div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            color: '#1e293b'
          }}>Recovery Key (Kurtarma Anahtarı)</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            24 kelimelik kurtarma anahtarınız
          </p>
        </div>

        <div style={{
          background: '#fef3c7',
          border: '2px solid #fbbf24',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h3 style={{
                fontWeight: 'bold',
                color: '#92400e',
                marginBottom: '0.5rem',
                fontSize: '1rem'
              }}>KRİTİK UYARI</h3>
              <p style={{
                color: '#92400e',
                fontSize: '0.9rem',
                lineHeight: '1.5'
              }}>
                Bu 24 kelimeyi <strong>güvenli bir yerde saklayın</strong>. Şifrenizi unutursanız, 
                dosyalarınıza erişmenin <strong>TEK YOLU</strong> bu anahtardır. 
                Bu anahtarı kaybederseniz, verilerinizi <strong>asla kurtaramazsınız</strong>.
              </p>
            </div>
          </div>
        </div>

        <div style={{
          background: '#f8fafc',
          border: '2px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '0.95rem',
          lineHeight: '1.8',
          wordBreak: 'break-word',
          color: '#1e293b'
        }}>
          {recoveryKey}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <button
            onClick={copyRecoveryKey}
            style={{
              padding: '0.75rem 1rem',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              transition: 'all 0.3s'
            }}
          >
            📋 Kopyala
          </button>
          <button
            onClick={downloadRecoveryKey}
            style={{
              padding: '0.75rem 1rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              transition: 'all 0.3s'
            }}
          >
            💾 İndir
          </button>
        </div>

        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          background: '#f1f5f9',
          borderRadius: '8px'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: '#475569'
          }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>
              Recovery key&apos;imi <strong>güvenli bir yerde sakladım</strong> ve bu anahtarı 
              kaybedersem dosyalarımı kurtaramayacağımı anlıyorum.
            </span>
          </label>
        </div>

        {/* Gizli Dosyalar Bilgilendirmesi */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(99, 102, 241, 0.05))',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🔒</span>
            <div>
              <h3 style={{
                fontWeight: 'bold',
                color: '#6366f1',
                marginBottom: '0.25rem',
                fontSize: '0.9rem'
              }}>Gizli Dosyalar Özelliği</h3>
              <p style={{
                color: '#64748b',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                margin: 0
              }}>
                Hassas dosyalarınızı korumak için &quot;Gizli Dosyalar&quot; bölümünü kullanabilirsiniz. 
                İlk kullanımda <strong>4 haneli bir PIN</strong> oluşturmanız gerekecek.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onConfirm}
          disabled={!confirmed}
          style={{
            width: '100%',
            padding: '1rem',
            background: confirmed 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : '#94a3b8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: confirmed ? 'pointer' : 'not-allowed',
            fontWeight: '700',
            fontSize: '1rem',
            opacity: confirmed ? 1 : 0.6,
            transition: 'all 0.3s'
          }}
        >
          ✓ Anladım, Devam Et
        </button>
      </div>

      {/* Toast Bildirimi */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background: toast.type === 'success' 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            animation: 'slideIn 0.3s ease-out',
            zIndex: 10000,
            fontSize: '0.95rem',
            fontWeight: '500'
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>
            {toast.type === 'success' ? '✓' : 'ℹ️'}
          </span>
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
