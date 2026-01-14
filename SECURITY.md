# 🔐 OneCloud Güvenlik Dokümantasyonu

## 📋 İçindekiler
1. [Genel Bakış](#genel-bakış)
2. [Güvenlik Özellikleri](#güvenlik-özellikleri)
3. [Production Deployment](#production-deployment)
4. [Güvenlik Kontrolleri](#güvenlik-kontrolleri)
5. [Olay Müdahale](#olay-müdahale)

---

## 🎯 Genel Bakış

OneCloud, zero-knowledge şifreleme prensibiyle çalışan, güvenlik odaklı bir bulut depolama platformudur. Bu dokümanda sistemin güvenlik mimarisi ve production deployment süreçleri detaylandırılmıştır.

### Güvenlik Seviyesi
```
✅ Zero-Knowledge Encryption (End-to-End)
✅ HTTPS Zorunluluğu (Production)
✅ JWT Token Lifecycle Management
✅ Role-Based Access Control (RBAC)
✅ Rate Limiting & DDoS Protection
✅ Comprehensive Audit Logging
✅ Admin Panel IP Whitelisting
✅ Content Security Policy (CSP)
```

---

## 🛡️ Güvenlik Özellikleri

### 1. Zero-Knowledge Şifreleme (FAZ 3)

**Özellikler:**
- Dosyalar client-side'da şifrelenir
- Sunucu asla düz metin (plaintext) görmez
- AES-256-GCM algoritması
- Kullanıcı şifresinden türetilen anahtarlar (PBKDF2)

**Teknik Detaylar:**
```javascript
// Client-side encryption flow
1. User password → PBKDF2(100,000 iterations) → Master Key
2. Random DEK (Data Encryption Key) generated
3. File → AES-256-GCM(DEK) → Encrypted File
4. DEK → AES-256-GCM(Master Key) → Encrypted DEK (EDEK)
5. Upload: Encrypted File + EDEK + Metadata
```

**Saklanan Veriler (Database):**
- `edek`: Şifreli veri anahtarı
- `edekIv`: DEK initialization vector
- `cipherIv`: Content IV
- `metaNameEnc`: Şifreli dosya adı
- `metaNameIv`: Metadata IV

**Güvenlik Garantisi:**
- ✅ Sunucu ihlal edilse bile dosyalar okunamaz
- ✅ Veritabanı sızsa bile içerik korunur
- ✅ Cloudflare/R2 erişimi olsa bile şifreli

---

### 2. Transport Güvenliği (SSL/TLS)

**Production Gereksinimleri:**
```bash
FORCE_HTTPS=true          # HTTP → HTTPS redirect
TRUST_PROXY=true          # Cloudflare/nginx proxy support
HSTS_MAX_AGE=31536000     # HSTS header (1 yıl)
```

**Middleware Sırası:**
1. `httpsRedirect` - HTTP isteklerini HTTPS'e yönlendir
2. `hstsHeader` - Strict-Transport-Security header
3. `advancedSecurityHeaders` - Ek güvenlik başlıkları

**Desteklenen Headers:**
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

---

### 3. Authentication & JWT Lifecycle (FAZ 6)

**Token Yapısı:**
| Token Type | Süre | Depolama | Kullanım |
|------------|------|----------|----------|
| Access Token | 15 dakika | Memory (client) | API istekleri |
| Refresh Token | 30 gün | httpOnly Cookie | Token yenileme |

**Güvenlik Mekanizmaları:**
- ✅ **Short-lived access tokens** (15m) - Sızma riskini azaltır
- ✅ **httpOnly cookies** - XSS saldırılarından korur
- ✅ **Secure flag** (production) - HTTPS-only transmission
- ✅ **SameSite=Lax** - CSRF koruması
- ✅ **Token rotation** - Refresh token kullanıldığında yenilenir
- ✅ **Database revocation** - Logout'ta token iptal edilir

**Endpoints:**
```typescript
POST /auth/login       // Access + Refresh token üret
POST /auth/refresh     // Access token yenile
POST /auth/logout      // Refresh token iptal et
POST /api/admin/revoke-sessions // Admin: Kullanıcı oturumlarını kapat
```

---

### 4. Rate Limiting & DDoS Protection

**Implementasyon:**
- **In-Memory** (single instance): Map-based rate limiter
- **Redis** (multi-instance): Distributed rate limiting

**Limitler:**
```typescript
// Upload endpoints
POST /api/files/v2/upload-url → 10 req / 1 minute
POST /api/files/v3/upload-url → 10 req / 1 minute

// Admin endpoints
/api/admin/* → 20 req / 10 minutes

// Auth endpoints
POST /auth/login → 5 req / 5 minutes (per IP)
```

**Redis Yapılandırması (Production):**
```bash
RATE_LIMIT_ENABLED=true
REDIS_URL=redis://username:password@host:6379
```

**Scalability:**
- ⚠️ In-memory: Tek instance için yeterli
- ✅ Redis: Multi-instance deployment destekler

---

### 5. Admin Panel Güvenliği

**Korumalı Katmanlar:**
1. **Authentication** - JWT token gerekli
2. **IP Whitelist** - Sadece izinli IP'ler erişebilir
3. **2FA Zorunluluğu** - Admin kullanıcılar için 2FA şart
4. **Role Check** - `user.role === 'ADMIN'` kontrolü
5. **Rate Limiting** - Brute force koruması
6. **Session Timeout** - Kısa oturum süreleri (30dk)

**Yapılandırma:**
```bash
# Admin IP Whitelist (virgülle ayrılmış)
ADMIN_IP_WHITELIST=203.0.113.1,203.0.113.2

# 2FA Zorunluluğu
ADMIN_2FA_REQUIRED=true

# Session timeout (dakika)
ADMIN_SESSION_TIMEOUT=30
```

**Audit Logging:**
Tüm admin işlemleri `SecurityEvent` tablosuna kaydedilir:
```typescript
ADMIN_ACCESS
ADMIN_USER_DELETE
ADMIN_SESSION_REVOKE
ADMIN_ROLE_CHANGE
UNAUTHORIZED_ACCESS
ADMIN_IP_BLOCKED
ADMIN_2FA_MISSING
```

---

### 6. Content Security Policy (CSP)

**CSP Modları:**
- **Report-Only** (Staging): İhlalleri raporla, bloklamaz
- **Enforce** (Production): İhlalleri blokla

**Yapılandırma:**
```bash
CSP_ENABLED=true
CSP_REPORT_URI=/api/security/csp-report
```

**Policy:**
```http
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://yourdomain.com;
font-src 'self';
object-src 'none';
media-src 'self';
frame-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

**CSP Violation Handling:**
```typescript
POST /api/security/csp-report
// Logs violations to SecurityEvent table
```

---

### 7. Audit Logging

**Event Types:**
```typescript
// Authentication
USER_LOGIN, USER_LOGOUT, USER_REGISTER
PASSWORD_RESET, PASSWORD_CHANGE
TWO_FA_ENABLED, TWO_FA_DISABLED

// File Operations
FILE_UPLOAD, FILE_DOWNLOAD, FILE_DELETE
FILE_SHARE, FILE_UNSHARE

// Admin Actions
ADMIN_ACCESS, ADMIN_USER_DELETE
ADMIN_SESSION_REVOKE, ADMIN_ROLE_CHANGE

// Security Events
FAILED_LOGIN, RATE_LIMIT_EXCEEDED
UNAUTHORIZED_ACCESS, SUSPICIOUS_ACTIVITY
CSP_VIOLATION
```

**Severity Levels:**
- `INFO` - Normal işlemler
- `WARNING` - Şüpheli aktivite
- `ERROR` - Hata durumları
- `CRITICAL` - Acil müdahale gerektiren olaylar

**Kullanım:**
```typescript
import { logAuditEvent, AuditEventType, AuditSeverity } from '@/utils/auditLogger';

await logAuditEvent({
  eventType: AuditEventType.USER_LOGIN,
  userId: user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  severity: AuditSeverity.INFO,
  message: 'User logged in successfully'
});
```

---

## 🚀 Production Deployment

### Ön Gereksinimler

**1. Ortam Değişkenleri:**
```bash
# .env.example'ı kopyala
cp .env.example .env

# Kritik değerleri doldur
NODE_ENV=production
JWT_SECRET=<openssl rand -base64 64>
DATABASE_URL=postgresql://...?sslmode=require
R2_ACCESS_KEY_ID=<cloudflare-r2-key>
R2_SECRET_ACCESS_KEY=<cloudflare-r2-secret>
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_ENABLED=true
REDIS_URL=redis://...
FORCE_HTTPS=true
SECURE_COOKIES=true
```

**2. Database Migrations:**
```bash
npx prisma migrate deploy
npx prisma generate
```

**3. SSL Sertifikası:**
- **Cloudflare SSL** (Önerilen): Otomatik yönetilen
- **Let's Encrypt**: Ücretsiz, 90 günlük yenileme
- **Custom SSL**: Ticari sertifika

---

### Deployment Checklist

**Güvenlik Kontrolü Scripti:**
```bash
# Backend dizininde çalıştır
npm run security-check

# Production mode kontrolü
npm run production-check
```

**Manuel Kontroller:**
- [ ] `NODE_ENV=production` set edildi
- [ ] `JWT_SECRET` >= 64 karakter
- [ ] Database SSL enabled (`?sslmode=require`)
- [ ] R2 credentials yapılandırıldı
- [ ] CORS localhost içermiyor
- [ ] Rate limiting enabled
- [ ] Redis bağlantısı çalışıyor
- [ ] HTTPS redirect enabled
- [ ] Secure cookies enabled
- [ ] Admin IP whitelist configured
- [ ] Debug mode disabled
- [ ] CSP configured
- [ ] Audit logging enabled

---

### Cloudflare Deployment (Önerilen)

**1. Domain Cloudflare'e Ekle:**
```
DNS → Add site → yourdomain.com
```

**2. SSL/TLS Ayarları:**
```
SSL/TLS → Overview → Full (strict)
Edge Certificates → Always Use HTTPS: ON
Edge Certificates → HSTS: Enable
```

**3. Page Rules:**
```
*yourdomain.com/*
- SSL: Full (strict)
- Always Use HTTPS: ON
- Security Level: High
```

**4. Firewall Rules:**
```
// Rate limiting
Expression: (http.request.uri.path contains "/api/auth/login")
Action: Rate limit (5 requests / 5 minutes)

// Admin IP restriction
Expression: (http.request.uri.path contains "/api/admin")
Action: Block (unless IP in whitelist)
```

**5. R2 Storage:**
```bash
# R2 bucket oluştur
wrangler r2 bucket create onecloude-private

# Credentials al
Dashboard → R2 → Manage R2 API Tokens → Create API Token
```

---

### Health Monitoring

**Health Check Endpoint:**
```bash
GET /health
Response: { "ok": true }

# Redis health
GET /api/health/redis
Response: { "connected": true, "latency": 5 }
```

**Recommended Monitoring:**
- **Uptime Robot** - 5 dakikalık ping
- **Sentry** - Error tracking
- **Datadog** - Infrastructure monitoring
- **Grafana** - Custom dashboards

---

## 🔍 Güvenlik Kontrolleri

### Otomatik Kontroller

**TypeScript Compilation:**
```bash
npx tsc --noEmit
# 0 errors = ✅ PASS
```

**Prisma Schema Validation:**
```bash
npx prisma validate
# Schema valid = ✅ PASS
```

**Security Health Check:**
```bash
bash security_health_check.sh
# Exit code 0 = ✅ PASS
```

---

### Manuel Güvenlik Testleri

**1. HTTPS Redirect Test:**
```bash
curl -I http://yourdomain.com
# Location: https://yourdomain.com = ✅
```

**2. Security Headers Test:**
```bash
curl -I https://yourdomain.com
# Check for:
# Strict-Transport-Security ✅
# X-Content-Type-Options: nosniff ✅
# X-Frame-Options: DENY ✅
```

**3. CORS Test:**
```bash
curl -H "Origin: http://evil.com" https://yourdomain.com/api/health
# Should reject = ✅
```

**4. Rate Limit Test:**
```bash
# 11 rapid requests
for i in {1..11}; do curl -X POST https://yourdomain.com/api/files/v2/upload-url; done
# 11th request: 429 Too Many Requests = ✅
```

**5. Admin IP Whitelist Test:**
```bash
# From unauthorized IP
curl https://yourdomain.com/api/admin/health
# 403 Forbidden = ✅
```

---

## 🚨 Olay Müdahale

### Kritik Güvenlik Olayları

**1. Unauthorized Admin Access:**
```sql
-- Son 24 saatteki yetkisiz admin erişimleri
SELECT * FROM "SecurityEvent"
WHERE "eventType" = 'UNAUTHORIZED_ADMIN_ACCESS'
AND "timestamp" > NOW() - INTERVAL '24 hours'
ORDER BY "timestamp" DESC;
```

**Müdahale:**
- IP adresini blacklist'e ekle
- Kullanıcı hesabını suspend et
- Admin'e bildirim gönder

---

**2. Rate Limit Aşımları:**
```sql
-- En çok rate limit aşan IP'ler
SELECT "ipAddress", COUNT(*) as count
FROM "SecurityEvent"
WHERE "eventType" = 'RATE_LIMIT_EXCEEDED'
AND "timestamp" > NOW() - INTERVAL '1 hour'
GROUP BY "ipAddress"
ORDER BY count DESC
LIMIT 10;
```

**Müdahale:**
- Şüpheli IP'leri geçici olarak blokla
- DDoS saldırısı kontrolü yap
- Cloudflare Firewall kuralları güncelle

---

**3. Failed Login Attempts:**
```sql
-- Başarısız login denemeleri
SELECT "metadata"->>'email', COUNT(*) as attempts
FROM "SecurityEvent"
WHERE "eventType" = 'FAILED_LOGIN'
AND "timestamp" > NOW() - INTERVAL '1 hour'
GROUP BY "metadata"->>'email'
HAVING COUNT(*) > 5
ORDER BY attempts DESC;
```

**Müdahale:**
- Brute force saldırısı şüphesi
- Email'e güvenlik uyarısı gönder
- Geçici hesap kilidi uygula

---

## 📊 Güvenlik Metrikleri

**Önerilen Dashboards:**
```javascript
// Günlük güvenlik olayları
SELECT "eventType", COUNT(*) as count
FROM "SecurityEvent"
WHERE DATE("timestamp") = CURRENT_DATE
GROUP BY "eventType"
ORDER BY count DESC;

// Severity dağılımı
SELECT "severity", COUNT(*) as count
FROM "SecurityEvent"
WHERE "timestamp" > NOW() - INTERVAL '7 days'
GROUP BY "severity";

// En aktif kullanıcılar
SELECT "userId", COUNT(*) as activity_count
FROM "SecurityEvent"
WHERE "userId" IS NOT NULL
AND "timestamp" > NOW() - INTERVAL '24 hours'
GROUP BY "userId"
ORDER BY activity_count DESC
LIMIT 20;
```

---

## 📞 Güvenlik İletişim

**Güvenlik Açığı Bildirimi:**
- Email: security@yourdomain.com
- PGP Key: [link]
- Responsible Disclosure Policy

**Bug Bounty Program:**
- Kritik: $500 - $2000
- Yüksek: $200 - $500
- Orta: $50 - $200
- Düşük: Acknowledgment

---

## 🔄 Güncellemeler

**Son Güncelleme:** 22 Aralık 2025

**Güvenlik Yamalarını İzleyin:**
- Dependencies: `npm audit`
- Prisma: Monthly security updates
- Node.js: LTS releases only

**Planlanan İyileştirmeler:**
- [ ] WAF (Web Application Firewall) integration
- [ ] Automated penetration testing
- [ ] Intrusion Detection System (IDS)
- [ ] Security Information and Event Management (SIEM)

---

## 📚 Referanslar

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Cloudflare Security](https://developers.cloudflare.com/security/)
- [Zero-Knowledge Encryption](https://en.wikipedia.org/wiki/Zero-knowledge_proof)

---

**© 2025 OneCloud - Enterprise-Grade Security**
