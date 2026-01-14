import { prisma } from '../src/utils/prisma';

async function main() {
  const email = process.argv[2];
  if(!email){
    console.error('Usage: ts-node scripts/showUser.ts <email>');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  console.log(user);
  await prisma.$disconnect();
}
main();

export {};
