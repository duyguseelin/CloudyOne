import { prisma } from "../src/utils/prisma";

async function fixFileNames() {
  try {
    console.log("📝 Dosya adlarını düzeltmeye başlıyorum...\n");
    
    // Güncellemeleri uygula
    const updates = [
      {
        name: "Tarama denemesi.jpg",
        extension: "jpg",
        size: 453427n, // 442.85 KB
      },
      {
        name: "logo.png",
        extension: "png",
        size: 42088n, // 41.11 KB
      },
      {
        name: "gizli_resim.jpg",
        extension: "jpg",
        size: 840070n, // 819.93 KB
      },
      {
        name: "gizli_resim2.jpg",
        extension: "jpg",
        size: 55556n, // 54.22 KB
      }
    ];

    for (const update of updates) {
      const result = await prisma.file.updateMany({
        where: { 
          originalName: 'encrypted', 
          sizeBytes: update.size 
        },
        data: { 
          originalName: update.name,
          extension: update.extension
        }
      });
      
      if (result.count > 0) {
        console.log(`✅ ${update.name} güncellendi (${result.count} dosya)`);
      }
    }

    console.log("\n✅ Tamamlandı!");
    
  } catch (error) {
    console.error("Hata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixFileNames();
