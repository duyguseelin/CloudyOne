import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function cleanOrphans() {
  const files = await prisma.file.findMany({
    select: { id: true, filename: true, storageKey: true }
  });
  
  let deleted = 0;
  for (const file of files) {
    const filePath = path.join(__dirname, '../uploads', file.storageKey || '');
    const exists = fs.existsSync(filePath);
    console.log(`File: ${file.filename}, Path: ${filePath}, Exists: ${exists}`);
    
    if (!exists) {
      console.log(`  -> Deleting orphan record: ${file.filename}`);
      // Önce ilişkili kayıtları sil
      await prisma.fileVersion.deleteMany({ where: { fileId: file.id } });
      await prisma.fileShareLog.deleteMany({ where: { fileId: file.id } });
      await prisma.fileTag.deleteMany({ where: { fileId: file.id } });
      // Sonra dosyayı sil
      await prisma.file.delete({ where: { id: file.id } });
      deleted++;
    }
  }
  console.log(`\nDeleted ${deleted} orphan records`);
}

cleanOrphans()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
