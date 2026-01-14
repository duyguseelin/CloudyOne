import { prisma } from '../src/utils/prisma';

async function main() {
  console.log('Kullanıcılar ve depolama karşılaştırması başlıyor...');
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, plan: true, storageLimitBytes: true, trashLimitBytes: true, usedStorageBytes: true, trashStorageBytes: true } });
  for (const u of users) {
    const activeAgg = await prisma.file.aggregate({ _sum: { sizeBytes: true }, where: { userId: u.id, isDeleted: false } });
    const trashAgg = await prisma.file.aggregate({ _sum: { sizeBytes: true }, where: { userId: u.id, isDeleted: true } });
    const activeSum = activeAgg._sum.sizeBytes ?? BigInt(0);
    const trashSum = trashAgg._sum.sizeBytes ?? BigInt(0);
    const reportedActive = BigInt(String(u.usedStorageBytes ?? 0));
    const reportedTrash = BigInt(String(u.trashStorageBytes ?? 0));
    const okActive = activeSum === reportedActive;
    const okTrash = trashSum === reportedTrash;

    console.log('----------------------------');
    console.log(`User: ${u.email} (${u.id})`);
    console.log(`  Plan: ${u.plan}`);
    console.log(`  Active sum (files): ${String(activeSum)} bytes`);
    console.log(`  Reported usedStorageBytes (user): ${String(reportedActive)} bytes`);
    console.log(`  Match active: ${okActive}`);
    console.log(`  Trash sum (files): ${String(trashSum)} bytes`);
    console.log(`  Reported trashStorageBytes (user): ${String(reportedTrash)} bytes`);
    console.log(`  Match trash: ${okTrash}`);

    if (!okActive || !okTrash) {
      console.log('  -> Farklılık tespit edildi. Örnek dosyalar (ilk 5):');
      const files = await prisma.file.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, filename: true, sizeBytes: true, isDeleted: true } });
      for (const f of files) {
        console.log(`     - ${f.id} ${f.filename} ${String(f.sizeBytes)} bytes deleted:${f.isDeleted}`);
      }
    }
  }
  await prisma.$disconnect();
  console.log('Tamamlandı.');
}

main().catch(e => { console.error(e); process.exit(1); });

export {};
