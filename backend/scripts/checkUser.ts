import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: [] // Disable query logs
});

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      storageLimitBytes: true,
      usedStorageBytes: true,
      trashStorageBytes: true,
      trashLimitBytes: true,
    },
  });

  console.log("\n=== Kullanıcı Bilgileri ===\n");
  
  for (const user of users) {
    console.log(`Email: ${user.email}`);
    console.log(`Plan: ${user.plan || 'YOK'}`);
    console.log(`Storage Limit: ${Number(user.storageLimitBytes)} bytes (${(Number(user.storageLimitBytes) / 1024 / 1024 / 1024).toFixed(2)} GB)`);
    console.log(`Used Storage: ${Number(user.usedStorageBytes)} bytes (${(Number(user.usedStorageBytes) / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Trash Storage: ${Number(user.trashStorageBytes)} bytes`);
    console.log(`Trash Limit: ${Number(user.trashLimitBytes)} bytes`);
    console.log(`Percentage: ${user.storageLimitBytes > 0 ? ((Number(user.usedStorageBytes) / Number(user.storageLimitBytes)) * 100).toFixed(2) : 0}%`);
    console.log("---\n");
  }

  // Kullanıcıların dosyalarını kontrol et
  for (const user of users) {
    const files = await prisma.file.findMany({
      where: { userId: user.id, isDeleted: false },
      select: { filename: true, sizeBytes: true },
    });

    console.log(`\n${user.email} - Dosyalar (${files.length} adet):`);
    let totalSize = 0n;
    files.forEach((f) => {
      console.log(`  - ${f.filename}: ${Number(f.sizeBytes)} bytes`);
      totalSize += f.sizeBytes;
    });
    console.log(`Total: ${Number(totalSize)} bytes (${(Number(totalSize) / 1024 / 1024).toFixed(2)} MB)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
