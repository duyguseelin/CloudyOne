/**
 * Admin Bootstrap Script
 * İlk admin kullanıcısı oluşturmak için kullan
 * 
 * Kullanım:
 * npx ts-node scripts/createAdmin.ts <email> <password> <name>
 * 
 * Örnek:
 * npx ts-node scripts/createAdmin.ts admin@cloudyone.com SecurePassword123 "Admin User"
 */

import { prisma } from "../src/utils/prisma";
import bcrypt from "bcryptjs";

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Kullanım: npx ts-node scripts/createAdmin.ts <email> <password> [name]");
    console.error("Örnek: npx ts-node scripts/createAdmin.ts admin@cloudyone.com SecurePass123 \"Admin User\"");
    process.exit(1);
  }

  const [email, password, name] = args;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Email zaten var mı kontrol et
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      console.log("⚠️  Bu email ile kullanıcı zaten mevcut.");
      console.log("   Mevcut kullanıcıyı admin yapmak ister misin? (ID:", existingUser.id + ")");
      
      // Kullanıcıyı admin yap
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "admin" },
        select: { id: true, email: true, name: true, role: true }
      });
      
      console.log("✅ Kullanıcı admin yapıldı:");
      console.log(JSON.stringify(updated, null, 2));
      return;
    }

    // Şifreyi hashle
    const passwordHash = await bcrypt.hash(password, 10);

    // Admin kullanıcı oluştur
    const GB = 1024n * 1024n * 1024n;
    const admin = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name || "Admin",
        passwordHash,
        role: "admin",
        plan: "PRO", // Admin'e PRO plan ver
        storageLimitBytes: 100n * GB, // 100 GB
        trashLimitBytes: 100n * GB
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true
      }
    });

    console.log("✅ Admin kullanıcı oluşturuldu:");
    console.log(JSON.stringify(admin, null, 2));
    console.log("\n📝 Giriş bilgileri:");
    console.log("   Email:", normalizedEmail);
    console.log("   Şifre:", password);
    console.log("\n⚠️  Bu bilgileri güvenli bir yerde sakla!");

  } catch (error) {
    console.error("❌ Hata:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
