import { prisma } from "../src/utils/prisma";

async function run() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const updates = [] as Array<Promise<any>>;
  for (const u of users) {
    const lower = u.email.trim().toLowerCase();
    if (lower !== u.email) {
      updates.push(
        prisma.user.update({ where: { id: u.id }, data: { email: lower } })
      );
      console.log(`Normalizing email for user ${u.id}: ${u.email} -> ${lower}`);
    }
  }
  if (!updates.length) {
    console.log("No email changes needed.");
  } else {
    await Promise.all(updates);
    console.log("Email normalization complete.");
  }
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

export {};
