import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updatePassword() {
  const password = 'Test123!@';
  const hash = await bcrypt.hash(password, 12);
  
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Davut', mode: 'insensitive' } }
  });
  
  if (!user) {
    console.log('Kullanıcı bulunamadı');
    await prisma.$disconnect();
    return;
  }
  
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash }
  });
  
  console.log('Şifre güncellendi:', user.email);
  await prisma.$disconnect();
}

updatePassword();
