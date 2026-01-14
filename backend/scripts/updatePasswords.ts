import { prisma } from '../src/utils/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  // Güçlü şifre: Test123!@
  const newPassword = 'Test123!@';
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  
  // Tüm kullanıcıların şifresini güncelle
  const result = await prisma.user.updateMany({
    data: {
      passwordHash: hashedPassword
    }
  });
  
  console.log(`✅ ${result.count} kullanıcının şifresi güncellendi!`);
  console.log(`\n📝 Yeni şifre: ${newPassword}`);
  console.log(`\nBu şifre aşağıdaki koşulları karşılıyor:`);
  console.log(`  ✓ 8+ karakter`);
  console.log(`  ✓ Büyük harf (T)`);
  console.log(`  ✓ Küçük harf (est)`);
  console.log(`  ✓ Rakam (123)`);
  console.log(`  ✓ Özel karakter (!@)`);
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

export {};
