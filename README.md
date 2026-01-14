# ☁️ CloudyOne - Güvenli Bulut Depolama Platformu

CloudyOne, güvenlik odaklı, çoklu platform destekli bir bulut depolama çözümüdür. Zero-knowledge şifreleme teknolojisi ile dosyalarınızı güvenle saklayın, paylaşın ve her cihazınızdan erişin.

## 🚀 Özellikler

### 🔐 Güvenlik
- **Zero-Knowledge Şifreleme**: Dosyalar client-side'da AES-256-GCM ile şifrelenir
- **Argon2id Password Hashing**: Güvenli parola türetme
- **2FA Desteği**: TOTP tabanlı iki faktörlü kimlik doğrulama
- **JWT & Refresh Token**: Güvenli oturum yönetimi
- **Cloudflare Tunnel**: DDoS koruması ve güvenli bağlantı

### 📱 Platform Desteği
- **Web Uygulaması**: React/Next.js ile modern web arayüzü
- **Mobil Uygulama**: React Native/Expo ile iOS ve Android desteği
- **API Backend**: Node.js/Express ile güçlü REST API

### 💾 Depolama & Paylaşım
- **Cloudflare R2**: Güvenli ve ölçeklenebilir dosya depolama
- **Gerçek Zamanlı Senkronizasyon**: WebSocket ile canlı güncellemeler
- **Güvenli Paylaşım**: Şifre korumalı ve süreli paylaşım linkleri
- **Klasör Organizasyonu**: Hiyerarşik dosya yapısı
- **Dosya Önizleme**: PDF, resim, video, Excel önizleme desteği

### 📊 Plan Sistemi
- **Free**: 5GB depolama, temel özellikler
- **Pro**: 100GB depolama, gelişmiş özellikler
- **Business**: 1TB depolama, takım işbirliği

## 🏗️ Teknik Mimari

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │  Mobile Client  │    │   Backend API   │
│   (Next.js)     │    │ (React Native)  │    │   (Node.js)     │
│                 │    │                 │    │                 │
│ • Client-side   │    │ • Native crypto │    │ • JWT Auth      │
│   encryption    │    │   integration   │    │ • File metadata │
│ • File preview  │    │ • Biometric     │    │ • User mgmt     │
│ • Real-time UI  │◄───┤   auth support  │◄───┤ • WebSocket     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │   + Prisma ORM  │
                                              │                 │
                                              │ • User data     │
                                              │ • File metadata │
                                              │ • Encryption    │
                                              │   artifacts     │
                                              └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  Cloudflare R2  │
                                              │                 │
                                              │ • Encrypted     │
                                              │   file content  │
                                              │ • Presigned     │
                                              │   URLs          │
                                              └─────────────────┘
```

## 🛠️ Teknoloji Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT + bcrypt/argon2
- **Storage**: Cloudflare R2
- **Real-time**: Socket.io
- **Security**: Helmet, CORS, Rate limiting

### Web Frontend
- **Framework**: Next.js 16 (React 19)
- **Styling**: TailwindCSS
- **Crypto**: Web Crypto API
- **Real-time**: Socket.io-client
- **File Processing**: XLSX, Mammoth (Word), PDF preview

### Mobile App
- **Framework**: React Native + Expo
- **Navigation**: React Navigation
- **Security**: Expo Secure Store, Local Authentication
- **Crypto**: @noble/ciphers, @noble/hashes
- **Deep Linking**: Universal links & custom schemes

## 🔧 Kurulum

### Gereksinimler
- Node.js 18+
- PostgreSQL 14+
- Cloudflare R2 hesabı
- Redis (opsiyonel - rate limiting için)

### Backend Kurulumu

```bash
cd backend
npm install

# .env dosyasını düzenleyin
cp .env.example .env

# Veritabanı migration'ları
npx prisma migrate dev
npx prisma generate

# Development server
npm run dev
```

### Web Frontend Kurulumu

```bash
cd web
npm install

# Development server
npm run dev
```

### Mobile App Kurulumu

```bash
cd mobile
npm install

# iOS simulator
npm run ios

# Android emulator
npm run android
```

## 🔐 Güvenlik Modeli

CloudyOne, **Zero-Knowledge** güvenlik modelini benimser:

1. **Client-side Şifreleme**: Dosyalar kullanıcının cihazında şifrelenir
2. **Password-derived Keys**: Ana anahtar kullanıcının parolasından türetilir
3. **Encrypted Metadata**: Dosya isimleri bile şifrelenir
4. **Server Blindness**: Sunucu hiçbir zaman düz metin görmez

### Şifreleme Flow'u
```
Password → Argon2id → Master Key → DEK (AES-256) → Encrypted File
                   ↘ Filename Encryption ↗
```

## 📱 Platform Özellikleri

### Web Uygulaması
- 📄 Dosya önizleme (PDF, Office, medya)
- 🎨 Modern, responsive tasarım
- ⚡ Hızlı yükleme ve senkronizasyon
- 🔄 Drag & drop dosya yükleme
- 🗂️ Klasör yönetimi

### Mobil Uygulama
- 📱 Native iOS ve Android deneyimi
- 🔒 Biometric authentication (Face ID/Touch ID)
- 📷 Belge tarayıcı
- 📤 Paylaşım menüsü entegrasyonu
- 🔗 Deep link desteği

## 🚀 Deployment

### Production Ayarları
- **HTTPS**: SSL sertifikası gerekli
- **Cloudflare Tunnel**: DDoS koruması
- **Environment Variables**: Güvenli değişken yönetimi
- **Database**: PostgreSQL cluster önerilir
- **Monitoring**: Sağlık kontrolleri mevcut

### Security Checklist
- [x] JWT secret güçlü rastgele string
- [x] Database connection SSL
- [x] File upload size limits
- [x] Rate limiting aktif
- [x] CORS doğru yapılandırılmış
- [x] Helmet security headers
- [x] Input validation (Zod)

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/AmazingFeature`)
3. Commit edin (`git commit -m 'Add some AmazingFeature'`)
4. Branch'i push edin (`git push origin feature/AmazingFeature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakın.

## 📞 İletişim

- **Email**: destek@cloudyone.com
- **Website**: https://cloudyone.app
- **GitHub**: https://github.com/duyguseelin/CloudyOne

## 🙏 Teşekkürler

- [Cloudflare](https://cloudflare.com) - R2 Storage ve güvenlik hizmetleri
- [Expo](https://expo.dev) - React Native development platform
- [Prisma](https://prisma.io) - Database ORM
- [Next.js](https://nextjs.org) - React framework

---

**CloudyOne** - Dosyalarınız güvende, her zaman yanınızda! ☁️✨