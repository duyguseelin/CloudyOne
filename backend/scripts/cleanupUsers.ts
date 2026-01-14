import { prisma } from '../src/utils/prisma';

async function main() {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error('Kullanım: ts-node scripts/cleanupUsers.ts <email1> [email2] ...');
    process.exit(1);
  }

  for (const emailRaw of emails) {
    const email = String(emailRaw).trim().toLowerCase();
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.log(`Kullanıcı bulunamadı: ${email}`);
        continue;
      }
      const userId = user.id;
      console.log(`Temizleniyor: ${email} (id=${userId})`);

      // Dosyaları al
      const files = await prisma.file.findMany({ where: { userId }, select: { id: true } });
      const fileIds = files.map(f => f.id);

      // Transaction ile ilişkili kayıtları sil
      await prisma.$transaction(async (tx) => {
        if (fileIds.length > 0) {
          console.log(`  - ${fileIds.length} dosya ile ilişkili kayıtlar siliniyor...`);
          await tx.fileVersion.deleteMany({ where: { fileId: { in: fileIds } } });
          await tx.fileTag.deleteMany({ where: { fileId: { in: fileIds } } });
        }

        console.log('  - Dosyalar siliniyor...');
        await tx.file.deleteMany({ where: { userId } });

        console.log('  - Etiketler siliniyor...');
        await tx.tag.deleteMany({ where: { userId } });

        console.log('  - Klasörler siliniyor...');
        await tx.folder.deleteMany({ where: { userId } });

        console.log('  - Kullanıcı siliniyor...');
        await tx.user.delete({ where: { id: userId } });
      });

      console.log(`Tamamlandı: ${email}`);
    } catch (err: any) {
      console.error(`HATA temizlerken ${email}:`, err.message || err);
    }
  }

  await prisma.$disconnect();
}

main();

export {};
