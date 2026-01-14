"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-main">
      {/* Navigation */}
      <nav className="home-nav">
        <div className="home-nav-content">
          <Link href="/" className="home-logo">
            <div className="home-logo-icon">☁️</div>
            <span className="home-logo-text">CloudyOne</span>
          </Link>
          
          <div className="home-nav-links">
            <Link href="#features" className="home-nav-link">Özellikler</Link>
            <Link href="#pricing" className="home-nav-link">Planlar</Link>
          </div>

          <div className="home-nav-actions">
            <Link href="/login">
              <button className="home-btn-nav">Giriş Yap</button>
            </Link>
            <Link href="/register">
              <button className="home-btn-nav-primary">Kayıt Ol</button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="home-hero">
        <div className="home-hero-content">
          <h1 className="home-hero-title">
            <span className="home-hero-gradient">Dosyalarınız</span> Her Yerde,<br/>
            Her Zaman Yanınızda
          </h1>

          <p className="home-hero-subtitle">
            Dosyalarınızı her yerden güvenle saklayın, paylaşın ve erişin.<br/>
            Güçlü şifreleme, kesintisiz senkronizasyon ve tam kontrol.
          </p>

          <div className="home-hero-actions">
            <Link href="/register">
              <button className="home-btn-primary">
                <span>Hemen Başla</span>
                <svg className="home-btn-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </Link>
          </div>
        </div>

        {/* Hero Background - Folders */}
        <div className="home-hero-visual">
          <div className="hero-folders-container">
            {/* Blue Folder */}
            <div className="hero-folder hero-folder-blue">
              <div className="hero-folder-tab"></div>
              <div className="hero-folder-body">
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-fig">FIG</span>
                  <span className="hero-file-name">ResearchDesign.fig</span>
                </div>
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-pdf">PDF</span>
                  <span className="hero-file-name">FinalThesis.pdf</span>
                </div>
              </div>
            </div>

            {/* Green Folder */}
            <div className="hero-folder hero-folder-green">
              <div className="hero-folder-tab"></div>
              <div className="hero-folder-body">
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-csv">CSV</span>
                  <span className="hero-file-name">TrainingSchedule.csv</span>
                </div>
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-doc">DOC</span>
                  <span className="hero-file-name">ClientContract.docx</span>
                </div>
              </div>
            </div>

            {/* Yellow/Orange Folder */}
            <div className="hero-folder hero-folder-yellow">
              <div className="hero-folder-tab"></div>
              <div className="hero-folder-body">
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-ai">AI</span>
                  <span className="hero-file-name">ResumeTemplate.ai</span>
                </div>
                <div className="hero-file-item">
                  <span className="hero-file-icon hero-icon-png">PNG</span>
                  <span className="hero-file-name">WebsiteMockup.png</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Icons */}
        <div className="floating-icons">
          <div className="floating-icon floating-icon-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
          </div>
          <div className="floating-icon floating-icon-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="floating-icon floating-icon-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </div>
          <div className="floating-icon floating-icon-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
        </div>
      </section>

      {/* Features Section - Modern Bento Grid */}
      <section className="home-features" id="features">
        <div className="home-section-header">
          <span className="section-badge">✨ Özellikler</span>
          <h2 className="home-section-title">Güvenlik & Özellikler</h2>
          <p className="home-section-subtitle">Kurumsal düzeyde güvenlik ile profesyonel bulut depolama çözümü</p>
        </div>

        <div className="bento-grid">
          {/* Ana Özellik - End-to-End Şifreleme */}
          <div className="bento-card bento-wide">
            <div className="bento-glow bento-glow-purple"></div>
            <div className="bento-content-row">
              <div className="bento-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="bento-title">End-to-End Şifreleme</h3>
                <p className="bento-desc">256-bit AES-GCM şifreleme ile dosyalarınız tarayıcınızda şifrelenir. Zero-knowledge mimarisi.</p>
              </div>
            </div>
            <div className="bento-tags">
              <span className="bento-tag">AES-256</span>
              <span className="bento-tag">Zero-Knowledge</span>
              <span className="bento-tag">Client-Side</span>
            </div>
          </div>

          {/* Ekip Çalışması */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-teal"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="bento-title">Ekip Çalışması</h3>
            <p className="bento-desc">Takım üyeleriyle dosya paylaşın ve birlikte çalışın.</p>
          </div>

          {/* Aktivite Logları */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-purple"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h3 className="bento-title">Aktivite Logları</h3>
            <p className="bento-desc">Tüm işlemlerinizi takip edin. Giriş, indirme, paylaşım ve daha fazlası.</p>
          </div>

          {/* Hızlı Transfer */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-cyan"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="bento-title">Hızlı Transfer</h3>
            <p className="bento-desc">Şifreli link ile anında dosya paylaşımı. Süre ve indirme limiti belirleyin.</p>
          </div>

          {/* 2FA */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-pink"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <h3 className="bento-title">İki Faktörlü Doğrulama</h3>
            <p className="bento-desc">TOTP tabanlı 2FA ile hesabınızı koruyun. Google Authenticator uyumlu.</p>
          </div>

          {/* Sürüm Geçmişi */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-orange"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="bento-title">Sürüm Geçmişi</h3>
            <p className="bento-desc">Dosyalarınızın önceki sürümlerine erişin ve geri yükleyin.</p>
          </div>

          {/* Güvenli Paylaşım */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-blue"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <h3 className="bento-title">Güvenli Paylaşım</h3>
            <p className="bento-desc">Şifre korumalı linkler ve süre sınırlı erişim.</p>
          </div>

          {/* Cloudflare - Wide Kart */}
          <div className="bento-card bento-wide">
            <div className="bento-glow bento-glow-orange"></div>
            <div className="bento-content-row">
              <div className="bento-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <h3 className="bento-title">Cloudflare Koruması</h3>
                <p className="bento-desc">DDoS koruması, WAF güvenlik duvarı, SSL/TLS şifreleme ve global CDN ile maksimum performans ve güvenlik.</p>
              </div>
            </div>
            <div className="bento-stats">
              <div className="bento-stat">
                <span className="stat-value">300+</span>
                <span className="stat-label">Küresel Sunucu</span>
              </div>
              <div className="bento-stat">
                <span className="stat-value">TLS 1.3</span>
                <span className="stat-label">Şifreleme</span>
              </div>
              <div className="bento-stat">
                <span className="stat-value">%99.9</span>
                <span className="stat-label">Uptime</span>
              </div>
            </div>
          </div>

          {/* Dosya İsteği */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-green"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="bento-title">Dosya İsteği</h3>
            <p className="bento-desc">Link paylaşarak başkalarından güvenli şekilde dosya toplayın.</p>
          </div>

          {/* Gizli Dosyalar */}
          <div className="bento-card">
            <div className="bento-glow bento-glow-indigo"></div>
            <div className="bento-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </div>
            <h3 className="bento-title">Gizli Dosyalar</h3>
            <p className="bento-desc">PIN korumalı gizli alan ile özel dosyalarınızı güvende tutun.</p>
          </div>

        </div>

        {/* Güvenlik Rozetleri - Modern */}
        <div className="security-badges">
          <div className="security-badge security-badge-green">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>SSL Güvenli</span>
          </div>
          <div className="security-badge security-badge-orange">
            <span>☁️</span>
            <span>Cloudflare Korumalı</span>
          </div>
          <div className="security-badge security-badge-purple">
            <span>🔐</span>
            <span>256-bit AES Şifreleme</span>
          </div>
          <div className="security-badge security-badge-pink">
            <span>🔑</span>
            <span>2FA Koruması</span>
          </div>
          <div className="security-badge security-badge-cyan">
            <span>⚡</span>
            <span>Zero-Knowledge</span>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="home-pricing" id="pricing">
        <div className="home-section-header">
          <h2 className="home-section-title">Size Uygun Plan</h2>
          <p className="home-section-subtitle">İhtiyacınıza göre esnek depolama seçenekleri</p>
        </div>

        <div className="home-pricing-grid">
          <div className="home-pricing-card">
            <div className="home-pricing-header">
              <h3 className="home-pricing-name">Başlangıç</h3>
            </div>
            <ul className="home-pricing-features">
              <li>✓ 1 GB Depolama</li>
              <li>✓ 1 GB Çöp kutusu</li>
              <li>✓ 256-bit AES Şifreleme</li>
              <li>✓ Hızlı Transfer (Şifreli Link)</li>
              <li>✓ SSL/TLS Güvenlik</li>
            </ul>
            <Link href="/register">
              <button className="home-pricing-btn">Plana Geç</button>
            </Link>
          </div>

          <div className="home-pricing-card">
            <div className="home-pricing-header">
              <h3 className="home-pricing-name">Pro</h3>
            </div>
            <ul className="home-pricing-features">
              <li>✓ 100 GB Depolama</li>
              <li>✓ 10 GB Çöp kutusu</li>
              <li>✓ Tüm Başlangıç özellikler</li>
              <li>✓ Şifreli Dosya Paylaşımı</li>
              <li>✓ Dosya Sürüm Geçmişi</li>
              <li>✓ İki Faktörlü Doğrulama (2FA)</li>
            </ul>
            <Link href="/register">
              <button className="home-pricing-btn">Plana Geç</button>
            </Link>
          </div>

          <div className="home-pricing-card">
            <div className="home-pricing-header">
              <h3 className="home-pricing-name">İşletme</h3>
            </div>
            <ul className="home-pricing-features">
              <li>✓ 1 TB Depolama</li>
              <li>✓ 50 GB Çöp kutusu</li>
              <li>✓ Tüm Pro özellikler</li>
              <li>✓ Gelişmiş Şifreleme Seçenekleri</li>
              <li>✓ Öncelikli E-posta Desteği</li>
              <li>✓ Detaylı Güvenlik Logları</li>
            </ul>
            <Link href="/register">
              <button className="home-pricing-btn">Plana Geç</button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-content">
          <div className="home-footer-brand">
            <div className="home-logo">
              <div className="home-logo-icon">☁️</div>
              <span className="home-logo-text">CloudyOne</span>
            </div>
            <p className="home-footer-desc">Güvenli bulut depolama çözümünüz</p>
          </div>
          
          <div className="home-footer-links">
            <div className="home-footer-column">
              <Link href="#features">Özellikler</Link>
              <Link href="#pricing">Planlar</Link>
            </div>
            <div className="home-footer-column">
              <Link href="/login">Giriş Yap</Link>
              <Link href="/register">Kayıt Ol</Link>
            </div>
          </div>
        </div>
        <div className="home-footer-bottom">
          <p>&copy; 2026 CloudyOne. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </main>
  );
}
