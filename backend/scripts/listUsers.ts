import { prisma } from '../src/utils/prisma';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, plan: true, storageLimitBytes: true, trashLimitBytes: true, usedStorageBytes: true, trashStorageBytes: true } });
  console.log(`Toplam kullanıcı: ${users.length}`);
  users.forEach(u => {
    console.log(JSON.stringify({ id: u.id, email: u.email, name: u.name, plan: u.plan, storageLimitBytes: String(u.storageLimitBytes), trashLimitBytes: String(u.trashLimitBytes), usedStorageBytes: String(u.usedStorageBytes), trashStorageBytes: String(u.trashStorageBytes) }));
  });
  await prisma.$disconnect();
}
main();

export {};
