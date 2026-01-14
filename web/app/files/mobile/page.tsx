"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearAuth } from "../../../lib/api";
import Sidebar from "../../../components/Sidebar";
import "../../globals.css";

export default function MobileAppPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setUser(stored);
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="files-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div className="animate-spin" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }}>
            <svg viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="files-page">
      {/* Sidebar - Ortak Component */}
      <Sidebar user={user} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="files-main" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '2rem',
        background: 'radial-gradient(ellipse at top, rgba(99, 102, 241, 0.08) 0%, transparent 50%)'
      }}>
        
        {/* Hero Section */}
        <div style={{ 
          textAlign: 'center', 
          maxWidth: '600px',
          marginBottom: '3rem'
        }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 800, 
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1.2
          }}>
            İşleriniz Yanınızda —<br/>Her Yerde
          </h1>
          <p style={{ 
            fontSize: '1.1rem', 
            color: '#94a3b8',
            lineHeight: 1.7,
            marginBottom: '2rem'
          }}>
            CloudyOne mobil uygulamasıyla dosyalarınıza her an, her yerden erişin. 
            Belge tarayın, notlarınızı kaydedin ve ekibinizle anında paylaşın.
          </p>
        </div>

        {/* QR Code Section */}
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '24px',
          padding: '2.5rem',
          textAlign: 'center',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
        }}>
          {/* QR Code */}
          <div style={{ 
            background: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            display: 'inline-block',
            marginBottom: '1.5rem'
          }}>
            {/* QR Code SVG - Örnek pattern */}
            <svg width="180" height="180" viewBox="0 0 180 180">
              <rect width="180" height="180" fill="white"/>
              {/* Position Detection Patterns */}
              <rect x="10" y="10" width="50" height="50" fill="#1e293b"/>
              <rect x="17" y="17" width="36" height="36" fill="white"/>
              <rect x="24" y="24" width="22" height="22" fill="#1e293b"/>
              
              <rect x="120" y="10" width="50" height="50" fill="#1e293b"/>
              <rect x="127" y="17" width="36" height="36" fill="white"/>
              <rect x="134" y="24" width="22" height="22" fill="#1e293b"/>
              
              <rect x="10" y="120" width="50" height="50" fill="#1e293b"/>
              <rect x="17" y="127" width="36" height="36" fill="white"/>
              <rect x="24" y="134" width="22" height="22" fill="#1e293b"/>
              
              {/* Data Pattern - Stylized */}
              <rect x="70" y="10" width="8" height="8" fill="#6366f1"/>
              <rect x="86" y="10" width="8" height="8" fill="#8b5cf6"/>
              <rect x="102" y="10" width="8" height="8" fill="#6366f1"/>
              
              <rect x="70" y="26" width="8" height="8" fill="#8b5cf6"/>
              <rect x="86" y="26" width="8" height="8" fill="#6366f1"/>
              <rect x="102" y="26" width="8" height="8" fill="#8b5cf6"/>
              
              <rect x="70" y="42" width="8" height="8" fill="#6366f1"/>
              <rect x="86" y="42" width="8" height="8" fill="#8b5cf6"/>
              <rect x="102" y="42" width="8" height="8" fill="#6366f1"/>
              
              {/* Center Pattern */}
              <rect x="70" y="70" width="40" height="40" rx="8" fill="url(#qrGradient)"/>
              <text x="90" y="95" textAnchor="middle" fill="white" fontSize="20">☁️</text>
              
              {/* More data patterns */}
              <rect x="10" y="70" width="8" height="8" fill="#6366f1"/>
              <rect x="26" y="70" width="8" height="8" fill="#8b5cf6"/>
              <rect x="42" y="70" width="8" height="8" fill="#6366f1"/>
              
              <rect x="10" y="86" width="8" height="8" fill="#8b5cf6"/>
              <rect x="26" y="86" width="8" height="8" fill="#6366f1"/>
              <rect x="42" y="86" width="8" height="8" fill="#8b5cf6"/>
              
              <rect x="10" y="102" width="8" height="8" fill="#6366f1"/>
              <rect x="26" y="102" width="8" height="8" fill="#8b5cf6"/>
              <rect x="42" y="102" width="8" height="8" fill="#6366f1"/>
              
              <rect x="120" y="70" width="8" height="8" fill="#8b5cf6"/>
              <rect x="136" y="70" width="8" height="8" fill="#6366f1"/>
              <rect x="152" y="70" width="8" height="8" fill="#8b5cf6"/>
              
              <rect x="120" y="86" width="8" height="8" fill="#6366f1"/>
              <rect x="136" y="86" width="8" height="8" fill="#8b5cf6"/>
              <rect x="152" y="86" width="8" height="8" fill="#6366f1"/>
              
              <rect x="120" y="102" width="8" height="8" fill="#8b5cf6"/>
              <rect x="136" y="102" width="8" height="8" fill="#6366f1"/>
              <rect x="152" y="102" width="8" height="8" fill="#8b5cf6"/>
              
              <rect x="70" y="120" width="8" height="8" fill="#6366f1"/>
              <rect x="86" y="120" width="8" height="8" fill="#8b5cf6"/>
              <rect x="102" y="120" width="8" height="8" fill="#6366f1"/>
              
              <rect x="70" y="136" width="8" height="8" fill="#8b5cf6"/>
              <rect x="86" y="136" width="8" height="8" fill="#6366f1"/>
              <rect x="102" y="136" width="8" height="8" fill="#8b5cf6"/>
              
              <rect x="70" y="152" width="8" height="8" fill="#6366f1"/>
              <rect x="86" y="152" width="8" height="8" fill="#8b5cf6"/>
              <rect x="102" y="152" width="8" height="8" fill="#6366f1"/>
              
              <rect x="120" y="120" width="50" height="50" fill="#1e293b"/>
              <rect x="127" y="127" width="36" height="36" fill="white"/>
              <rect x="134" y="134" width="22" height="22" fill="url(#qrGradient)"/>
              
              <defs>
                <linearGradient id="qrGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1"/>
                  <stop offset="100%" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <p style={{ 
            fontSize: '0.9rem', 
            color: '#94a3b8',
            marginBottom: '1.5rem'
          }}>
            QR kodu telefonunuzla tarayın veya<br/>mağazadan indirin
          </p>
          
          {/* Store Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {/* App Store */}
            <button style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>İndir</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>App Store</div>
              </div>
            </button>
            
            {/* Google Play */}
            <button style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92z" fill="#00D6FF"/>
                <path d="M17.556 8.236l-3.764 3.764 3.764 3.764 4.252-2.428c.629-.359.629-1.253 0-1.612l-4.252-2.488z" fill="#FFCB00"/>
                <path d="M3.609 1.814l10.627 10.627 3.764-3.764L4.773 1.012c-.39-.234-.84-.224-1.164.003a.98.98 0 00-.001-.001l.001.8z" fill="#31FF77"/>
                <path d="M14.236 13.56L3.609 22.186a.97.97 0 001.164.003L18 15.323l-3.764-1.764z" fill="#F33C52"/>
              </svg>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>İndir</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>Google Play</div>
              </div>
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          maxWidth: '900px',
          width: '100%',
          marginTop: '3rem'
        }}>
          {/* Feature 1 - Belge Tarama */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            transition: 'all 0.3s'
          }}>
            <div style={{ 
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
              Belge Tarama
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Telefonunuzun kamerasıyla belge, makbuz veya notlarınızı tarayın ve otomatik olarak düzenli kaydedin.
            </p>
          </div>

          {/* Feature 2 - Çevrimdışı Erişim */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            transition: 'all 0.3s'
          }}>
            <div style={{ 
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
              Çevrimdışı Erişim
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              İnternet olmadan da dosyalarınıza erişin. Çevrimiçi olduğunuzda otomatik senkronize edilir.
            </p>
          </div>

          {/* Feature 3 - Anlık Paylaşım */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            transition: 'all 0.3s'
          }}>
            <div style={{ 
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(244, 63, 94, 0.2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f9a8d4" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '0.5rem' }}>
              Anlık Paylaşım
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Tek dokunuşla dosyalarınızı ekibinizle veya müşterilerinizle paylaşın.
            </p>
          </div>
        </div>

      </main>

      {/* Global Styles */}
      <style jsx global>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
