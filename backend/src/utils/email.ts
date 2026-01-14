// E-posta gönderme - Brevo (Sendinblue) API veya Nodemailer
// Brevo: Ücretsiz 300 mail/gün, domain gerektirmez!

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Brevo API ile e-posta gönderme
async function sendWithBrevo(to: string, subject: string, htmlContent: string, textContent: string): Promise<EmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.FROM_EMAIL || 'noreply@cloudy.one';
  const senderName = process.env.FROM_NAME || 'CloudyOne';
  
  console.log(`📧 [BREVO] API Key kontrol: ${apiKey ? '✅ VAR' : '❌ YOK'}`);
  console.log(`📧 [BREVO] Gönderen: ${senderName} <${senderEmail}>`);
  console.log(`📧 [BREVO] Alıcı: ${to}`);
  console.log(`📧 [BREVO] Başlık: ${subject}`);
  
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
        textContent: textContent,
      }),
    });
    
    console.log(`📧 [BREVO] Response Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [BREVO] API hatası:', errorData);
      return { success: false, error: JSON.stringify(errorData) };
    }
    
    const data = await response.json() as { messageId?: string };
    console.log(`✅ [BREVO] E-posta gönderildi: ${to}`, data.messageId);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error('❌ [BREVO] Gönderim hatası:', error);
    return { success: false, error: String(error) };
  }
}

// E-posta gönderme ana fonksiyonu
export async function sendEmail(to: string, subject: string, htmlContent: string, textContent: string): Promise<boolean> {
  console.log(`📧 E-posta gönderiliyor: ${to}`);
  console.log(`📧 Konu: ${subject}`);
  
  // 1. Brevo API key varsa Brevo kullan
  if (process.env.BREVO_API_KEY) {
    console.log('📧 Brevo API ile gönderim deneniyor...');
    const result = await sendWithBrevo(to, subject, htmlContent, textContent);
    if (result.success) {
      return true;
    }
    console.log('⚠️ Brevo başarısız, Nodemailer deneniyor...');
  }

  // 2. Nodemailer ile gönder (Gmail, Outlook, custom SMTP vb.)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('📧 [NODEMAILER] Nodemailer ile gönderim deneniyor...');
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        from: {
          name: process.env.FROM_NAME || 'CloudyOne',
          address: process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@cloudy.one',
        }
      });

      console.log(`📧 [NODEMAILER] ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} ile bağlantı sağlanıyor`);
      console.log(`📧 [NODEMAILER] Alıcı: ${to}`);

      const info = await transporter.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@cloudy.one',
        to: to,
        subject: subject,
        text: textContent,
        html: htmlContent,
      });

      console.log(`✅ [NODEMAILER] E-posta gönderildi: ${to}`, info.messageId);
      return true;
    } catch (error) {
      console.error('❌ [NODEMAILER] Gönderim hatası:', error);
    }
  }

  // 3. Dev mode - sadece console'a yazdır
  console.log(`📧 [DEV MODE] E-posta: ${subject}`);
  console.log(`📧 [DEV MODE] Alıcı: ${to}`);
  console.log(`📧 [DEV MODE] Doğrulama Kodu: ${htmlContent.match(/\d{6}/) || 'N/A'}`);
  console.log(`📧 [DEV MODE] ⚠️ Gerçek e-posta göndermek için aşağıdakilerden birini ayarlayın:`);
  console.log(`📧 [DEV MODE] 1. BREVO_API_KEY (https://www.brevo.com/) - En kolay`);
  console.log(`📧 [DEV MODE] 2. SMTP_HOST, SMTP_USER, SMTP_PASS (Gmail, Outlook, vb.)`);
  
  console.log('\n📧 === DEV MODE EMAIL CONTENT === 📧');
  console.log('Başlık:', subject);
  console.log('Alıcı:', to);
  console.log('İçerik:');
  console.log(htmlContent);
  console.log('📧 === END EMAIL CONTENT === 📧\n');
  
  return true;
}

// Ekip davet e-postası gönder
export async function sendTeamInviteEmail(
  email: string, 
  inviteToken: string, 
  teamName: string, 
  inviterName: string,
  role: string
) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  const roleText = role === 'ADMIN' ? 'Yönetici' : role === 'EDITOR' ? 'Düzenleyici' : 'İzleyici';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .content h2 {
            color: #1e293b;
            margin-top: 0;
          }
          .content p {
            color: #64748b;
            font-size: 16px;
            margin: 16px 0;
          }
          .team-info {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
          }
          .team-info h3 {
            color: #6366f1;
            margin: 0 0 8px 0;
            font-size: 18px;
          }
          .team-info p {
            margin: 4px 0;
            font-size: 14px;
          }
          .role-badge {
            display: inline-block;
            padding: 4px 12px;
            background: rgba(99, 102, 241, 0.2);
            color: #6366f1;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-top: 8px;
          }
          .button-container {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin: 24px 0;
            flex-wrap: wrap;
          }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
          .button-secondary {
            display: inline-block;
            padding: 14px 32px;
            background: white;
            color: #6366f1 !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            border: 2px solid #6366f1;
          }
          .footer {
            background: #f8fafc;
            padding: 20px;
            text-align: center;
            color: #94a3b8;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
          }
          .note {
            background: #f0f9ff;
            border-left: 4px solid #3b82f6;
            padding: 12px 16px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .note p {
            margin: 0;
            color: #1e40af;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>☁️ CloudyOne</h1>
          </div>
          <div class="content">
            <h2>Ekip Davetiyesi 🎉</h2>
            <p>Merhaba,</p>
            <p><strong>${inviterName}</strong> sizi CloudyOne'da bir ekibe katılmaya davet ediyor!</p>
            
            <div class="team-info">
              <h3>📁 ${teamName}</h3>
              <p>Rolünüz:</p>
              <span class="role-badge">${roleText}</span>
            </div>
            
            <p>Bu daveti kabul ederek ekip dosyalarına erişebilir ve birlikte çalışabilirsiniz. Aşağıdaki butonlardan birini tıklayarak başlayabilirsiniz:</p>
            
            <div class="button-container">
              <a href="${frontendUrl}?inviteToken=${inviteToken}" class="button">Giriş Yap</a>
              <a href="${frontendUrl}?inviteToken=${inviteToken}&signup=true" class="button-secondary">Üye Ol</a>
            </div>
            
            <div class="note">
              <p><strong>ℹ️ Not:</strong> Bu davet 7 gün geçerlidir. Giriş yap veya üye ol butonlarından birine tıkladığınızda, size "Bu ekibe üye olmak ister misiniz?" sorusu sorulacak. Evet'i seçerek daveti kabul edebilirsiniz.</p>
            </div>
            
            <p>Butonlar çalışmıyorsa, aşağıdaki bağlantıyı kopyalayıp tarayıcınıza yapıştırabilirsiniz:</p>
            <p style="word-break: break-all; color: #6366f1; font-size: 14px;">${frontendUrl}?inviteToken=${inviteToken}</p>
          </div>
          <div class="footer">
            <p>Bu e-posta ${inviterName} tarafından gönderilen bir davettir.</p>
            <p>Bu daveti beklemiyorsanız, görmezden gelebilirsiniz.</p>
            <p>© 2025 CloudyOne. Tüm hakları saklıdır.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
    CloudyOne - Ekip Davetiyesi
    
    Merhaba,
    
    ${inviterName} sizi CloudyOne'da bir ekibe katılmaya davet ediyor!
    
    Ekip: ${teamName}
    Rolünüz: ${roleText}
    
    Daveti kabul etmek için aşağıdaki bağlantılardan birine tıklayın:
    
    Giriş Yap: ${frontendUrl}?inviteToken=${inviteToken}
    Üye Ol: ${frontendUrl}?inviteToken=${inviteToken}&signup=true
    
    Bu davet 7 gün geçerlidir.
    
    CloudyOne Ekibi
  `;

  // DEV modunda linki console'a yazdır
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'dummy_key_for_dev') {
    console.log('📧 [DEV MODE] Ekip davet token:', inviteToken);
    console.log('📧 [DEV MODE] Ekip davet linki:', `${frontendUrl}?inviteToken=${inviteToken}`);
  }

  return sendEmail(email, `${inviterName} sizi ${teamName} ekibine davet ediyor - CloudyOne`, htmlContent, textContent);
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
  
  const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
            }
            .content {
              padding: 40px 30px;
            }
            .content h2 {
              color: #1e293b;
              margin-top: 0;
            }
            .content p {
              color: #64748b;
              font-size: 16px;
              margin: 16px 0;
            }
            .button {
              display: inline-block;
              padding: 14px 32px;
              background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              margin: 24px 0;
            }
            .footer {
              background: #f8fafc;
              padding: 20px;
              text-align: center;
              color: #94a3b8;
              font-size: 14px;
              border-top: 1px solid #e2e8f0;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 12px 16px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning p {
              margin: 0;
              color: #92400e;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>☁️ CloudyOne</h1>
            </div>
            <div class="content">
              <h2>Şifre Sıfırlama Talebi</h2>
              <p>Merhaba,</p>
              <p>Hesabınız için şifre sıfırlama talebinde bulundunuz. Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:</p>
              
              <a href="${resetUrl}" class="button">Şifremi Sıfırla</a>
              
              <div class="warning">
                <p><strong>⚠️ Önemli:</strong> Bu bağlantı 1 saat geçerlidir. Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
              </div>
              
              <p>Buton çalışmıyorsa, aşağıdaki bağlantıyı kopyalayıp tarayıcınıza yapıştırabilirsiniz:</p>
              <p style="word-break: break-all; color: #6366f1; font-size: 14px;">${resetUrl}</p>
            </div>
            <div class="footer">
              <p>Bu otomatik bir e-postadır, lütfen yanıtlamayın.</p>
              <p>© 2025 CloudyOne. Tüm hakları saklıdır.</p>
            </div>
          </div>
        </body>
      </html>
    `;

  const textContent = `
      CloudyOne - Şifre Sıfırlama
      
      Merhaba,
      
      Hesabınız için şifre sıfırlama talebinde bulundunuz.
      
      Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:
      ${resetUrl}
      
      Bu bağlantı 1 saat geçerlidir.
      
      Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
      
      CloudyOne Ekibi
    `;

  // Brevo ile e-posta gönder
  return sendEmail(email, 'Şifre Sıfırlama Talebi - CloudyOne', htmlContent, textContent);
}

// Transfer e-postası gönder
export async function sendTransferEmail(
  recipientEmail: string,
  senderName: string,
  fileName: string,
  fileSize: string,
  downloadLink: string,
  expiresAt: string,
  message?: string
) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .content h2 {
            color: #1e293b;
            margin-top: 0;
          }
          .content p {
            color: #64748b;
            font-size: 16px;
            margin: 16px 0;
          }
          .file-info {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
          }
          .file-info .file-name {
            font-weight: 600;
            color: #1e293b;
            font-size: 18px;
            margin-bottom: 8px;
          }
          .file-info .file-size {
            color: #64748b;
            font-size: 14px;
          }
          .message-box {
            background: #f8fafc;
            border-left: 4px solid #8b5cf6;
            padding: 16px;
            margin: 24px 0;
            border-radius: 0 8px 8px 0;
          }
          .message-box p {
            margin: 0;
            font-style: italic;
            color: #475569;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            color: white !important;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            margin: 24px 0;
          }
          .button:hover {
            opacity: 0.9;
          }
          .footer {
            background: #f8fafc;
            padding: 24px 30px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
          }
          .expiry {
            color: #ef4444;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>☁️ CloudyOne Transfer</h1>
          </div>
          <div class="content">
            <h2>Size bir dosya gönderildi!</h2>
            <p><strong>${senderName}</strong> sizinle bir dosya paylaştı.</p>
            
            <div class="file-info">
              <div class="file-name">📁 ${fileName}</div>
              <div class="file-size">${fileSize}</div>
            </div>
            
            ${message ? `
            <div class="message-box">
              <p>"${message}"</p>
            </div>
            ` : ''}
            
            <center>
              <a href="${downloadLink}" class="button">Dosyayı İndir</a>
            </center>
            
            <p class="expiry">⏰ Bu link ${expiresAt} tarihine kadar geçerlidir.</p>
          </div>
          <div class="footer">
            <p>Bu e-posta CloudyOne Transfer servisi aracılığıyla gönderilmiştir.</p>
            <p>© 2025 CloudyOne - Güvenli Dosya Paylaşımı</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
    CloudyOne Transfer - Size bir dosya gönderildi!
    
    ${senderName} sizinle bir dosya paylaştı.
    
    Dosya: ${fileName}
    Boyut: ${fileSize}
    ${message ? `Mesaj: "${message}"` : ''}
    
    İndirme Linki: ${downloadLink}
    
    Bu link ${expiresAt} tarihine kadar geçerlidir.
    
    ---
    CloudyOne - Güvenli Dosya Paylaşımı
  `;

  try {
    // API key yoksa veya dummy ise sadece console'a yazdır
    if (!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY === 'dummy_key_for_dev') {
      console.log('📧 [DEV MODE] Transfer e-postası:');
      console.log(`📧 [DEV MODE] Alıcı: ${recipientEmail}`);
      console.log(`📧 [DEV MODE] Gönderen: ${senderName}`);
      console.log(`📧 [DEV MODE] Dosya: ${fileName}`);
      console.log(`📧 [DEV MODE] Link: ${downloadLink}`);
      console.log(`✅ [DEV MODE] Transfer e-postası gönderildi (simüle): ${recipientEmail}`);
      return true;
    }

    // Brevo ile email gönder
    const result = await sendWithBrevo(
      recipientEmail,
      `${senderName} size bir dosya gönderdi - CloudyOne Transfer`,
      htmlContent,
      textContent
    );

    if (!result.success) {
      console.error('❌ Transfer e-postası gönderilemedi:', result.error);
      return false;
    }

    console.log(`✅ Transfer e-postası gönderildi: ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Transfer e-postası gönderme hatası:', error);
    return false;
  }
}

// E-posta doğrulama e-postası gönder
export async function sendEmailVerificationEmail(email: string, verificationToken: string) {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .content h2 {
            color: #1e293b;
            margin-top: 0;
          }
          .content p {
            color: #64748b;
            font-size: 16px;
            margin: 16px 0;
          }
          .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            margin: 24px 0;
          }
          .footer {
            background: #f8fafc;
            padding: 20px;
            text-align: center;
            color: #94a3b8;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
          }
          .info {
            background: #ecfdf5;
            border-left: 4px solid #10b981;
            padding: 12px 16px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info p {
            margin: 0;
            color: #065f46;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>☁️ CloudyOne</h1>
          </div>
          <div class="content">
            <h2>E-posta Adresinizi Doğrulayın</h2>
            <p>Merhaba,</p>
            <p>CloudyOne hesabınızı aktifleştirmek için e-posta adresinizi doğrulamanız gerekmektedir. Aşağıdaki butona tıklayarak e-postanızı doğrulayabilirsiniz:</p>
            
            <a href="${verifyUrl}" class="button">E-postamı Doğrula</a>
            
            <div class="info">
              <p><strong>✅ Güvenlik:</strong> Bu bağlantı 24 saat geçerlidir. Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
            </div>
            
            <p>Buton çalışmıyorsa, aşağıdaki bağlantıyı kopyalayıp tarayıcınıza yapıştırabilirsiniz:</p>
            <p style="word-break: break-all; color: #10b981; font-size: 14px;">${verifyUrl}</p>
          </div>
          <div class="footer">
            <p>Bu otomatik bir e-postadır, lütfen yanıtlamayın.</p>
            <p>© 2025 CloudyOne. Tüm hakları saklıdır.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
    CloudyOne - E-posta Doğrulama
    
    Merhaba,
    
    CloudyOne hesabınızı aktifleştirmek için e-posta adresinizi doğrulamanız gerekmektedir.
    
    E-postanızı doğrulamak için aşağıdaki bağlantıya tıklayın:
    ${verifyUrl}
    
    Bu bağlantı 24 saat geçerlidir.
    
    Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
    
    CloudyOne Ekibi
  `;

  try {
    // API key yoksa veya dummy ise sadece console'a yazdır
    if (!process.env.BREVO_API_KEY || process.env.BREVO_API_KEY === 'dummy_key_for_dev') {
      console.log('📧 [DEV MODE] E-posta doğrulama linki:', verifyUrl);
      console.log(`✅ [DEV MODE] Doğrulama e-postası gönderildi (simüle): ${email}`);
      return true;
    }

    // Brevo ile email gönder
    const result = await sendWithBrevo(
      email,
      'E-posta Adresinizi Doğrulayın - CloudyOne',
      htmlContent,
      textContent
    );

    if (!result.success) {
      console.error('❌ E-posta doğrulama gönderilemedi:', result.error);
      throw new Error('E-posta gönderilemedi');
    }

    console.log(`✅ E-posta doğrulama e-postası gönderildi: ${email}`);
    return true;
  } catch (error) {
    console.error('❌ E-posta gönderme hatası:', error);
    throw new Error('E-posta gönderilemedi');
  }
}
