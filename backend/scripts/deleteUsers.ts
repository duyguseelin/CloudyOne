/**
 * Delete specific users and their related data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emailsToDelete = [
    'admin@example.com',
    'davutdemir@gmail.com'
  ];

  console.log('🗑️  Kullanıcılar siliniyor...\n');

  for (const email of emailsToDelete) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true }
      });

      if (!user) {
        console.log(`❌ Kullanıcı bulunamadı: ${email}`);
        continue;
      }

      console.log(`\n📝 Siliniyor: ${user.name} (${user.email})`);

      // İlişkili verileri sil
      const deletedFiles = await prisma.file.deleteMany({
        where: { userId: user.id }
      });
      console.log(`   ✓ ${deletedFiles.count} dosya silindi`);

      const deletedFolders = await prisma.folder.deleteMany({
        where: { userId: user.id }
      });
      console.log(`   ✓ ${deletedFolders.count} klasör silindi`);

      // Kullanıcıyı sil
      await prisma.user.delete({
        where: { id: user.id }
      });
      console.log(`   ✅ Kullanıcı silindi: ${email}`);

    } catch (error) {
      console.error(`❌ Hata (${email}):`, error);
    }
  }

  console.log('\n✅ İşlem tamamlandı');
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
