import { Request, Response } from "express";
import { PrismaClient, TeamRole, InviteStatus } from "@prisma/client";
import { sendTeamInviteEmail } from "../utils/email";
import crypto from "crypto";
import type { AuthRequest } from "../middleware/auth";
import { createActivity } from "./activityController";

const prisma = new PrismaClient();

// Yardımcı: 7 gün sonrasını hesapla
const getExpirationDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
};

// Yardımcı: Benzersiz token oluştur
const generateToken = () => crypto.randomBytes(32).toString("hex");

// Yeni ekip oluştur
export async function createTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: "Ekip adı gerekli" });
    }

    // Yeni ekip oluştur
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        ownerId: userId,
        description: description?.trim() || null
      },
      include: {
        Members: {
          include: {
            User: {
              select: { id: true, email: true, name: true }
            }
          }
        },
        Invites: {
          where: { status: InviteStatus.PENDING }
        }
      }
    });

    res.status(201).json({ team, message: "Ekip başarıyla oluşturuldu" });
  } catch (error) {
    console.error("Ekip oluşturma hatası:", error);
    res.status(500).json({ error: "Ekip oluşturulamadı" });
  }
}

// Kullanıcının varsayılan ekibini al veya oluştur
export async function getOrCreateDefaultTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    
    // Kullanıcının sahip olduğu ekibi bul
    let team = await prisma.team.findFirst({
      where: { ownerId: userId },
      include: {
        Members: {
          include: {
            User: {
              select: { id: true, email: true, name: true }
            }
          }
        },
        Invites: {
          where: { status: InviteStatus.PENDING }
        }
      }
    });

    // Ekip yoksa varsayılan bir ekip oluştur
    if (!team) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true }
      });

      team = await prisma.team.create({
        data: {
          name: `${user?.name || user?.email?.split("@")[0]}'in Ekibi`,
          ownerId: userId,
          description: "Varsayılan ekip"
        },
        include: {
          Members: {
            include: {
              User: {
                select: { id: true, email: true, name: true }
              }
            }
          },
          Invites: {
            where: { status: InviteStatus.PENDING }
          }
        }
      });
    }

    res.json({ team });
  } catch (error) {
    console.error("Ekip getirme hatası:", error);
    res.status(500).json({ error: "Ekip yüklenemedi" });
  }
}

// Ekip üyelerini listele
export async function listTeamMembers(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    // Kullanıcının ekibini bul
    const team = await prisma.team.findFirst({
      where: { ownerId: userId },
      include: {
        Members: {
          include: {
            User: {
              select: { id: true, email: true, name: true }
            }
          }
        },
        Invites: {
          where: { 
            status: InviteStatus.PENDING,
            expiresAt: { gt: new Date() }
          }
        },
        Owner: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    if (!team) {
      return res.json({ members: [], pendingInvites: [] });
    }

    // Üyeleri formatla
    const members = team.Members.map(m => ({
      id: m.id,
      userId: m.User.id,
      email: m.User.email,
      name: m.User.name,
      role: m.role,
      status: "active",
      joinedAt: m.joinedAt.toISOString()
    }));

    // Bekleyen davetleri formatla
    const pendingInvites = team.Invites.map(i => ({
      id: i.id,
      email: i.email,
      role: i.role,
      status: "invited",
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString()
    }));

    res.json({ 
      teamId: team.id,
      teamName: team.name,
      owner: team.Owner,
      members, 
      pendingInvites 
    });
  } catch (error) {
    console.error("Üye listesi hatası:", error);
    res.status(500).json({ error: "Üyeler yüklenemedi" });
  }
}

// Ekibe üye davet et
export async function inviteToTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { email, role = "VIEWER" } = req.body;

    console.log("Invite request:", { email, role, userId });

    if (!email) {
      return res.status(400).json({ error: "E-posta adresi gerekli" });
    }

    // E-posta validasyonu
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Geçersiz e-posta adresi" });
    }

    // Rol validasyonu - string olarak kontrol et
    const validRoles = ["VIEWER", "MEMBER", "EDITOR"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Geçersiz rol" });
    }

    // Kullanıcının ekibini bul veya oluştur
    let team = await prisma.team.findFirst({
      where: { ownerId: userId }
    });

    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!team) {
      team = await prisma.team.create({
        data: {
          name: `${inviter?.name || inviter?.email?.split("@")[0]}'in Ekibi`,
          ownerId: userId,
          description: "Varsayılan ekip"
        }
      });
    }

    // Kendini davet etmeye çalışıyor mu?
    if (inviter?.email?.toLowerCase() === email.toLowerCase()) {
      return res.status(400).json({ error: "Kendinizi davet edemezsiniz" });
    }

    // Zaten üye mi kontrol et
    const existingMember = await prisma.teamMember.findFirst({
      where: {
        teamId: team.id,
        User: { email: email.toLowerCase() }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: "Bu kullanıcı zaten ekip üyesi" });
    }

    // Bekleyen davet var mı kontrol et
    const existingInvite = await prisma.teamInvite.findFirst({
      where: {
        teamId: team.id,
        email: email.toLowerCase(),
        status: InviteStatus.PENDING,
        expiresAt: { gt: new Date() }
      }
    });

    if (existingInvite) {
      return res.status(400).json({ error: "Bu e-postaya zaten bekleyen bir davet var" });
    }

    // Yeni davet oluştur
    const token = generateToken();
    const invite = await prisma.teamInvite.create({
      data: {
        teamId: team.id,
        email: email.toLowerCase(),
        role: role as TeamRole,
        token,
        invitedBy: userId,
        expiresAt: getExpirationDate()
      }
    });

    // E-posta gönder
    try {
      await sendTeamInviteEmail(
        email,
        token,
        team.name,
        inviter?.name || inviter?.email || "Bir kullanıcı",
        role
      );
    } catch (emailError) {
      console.error("E-posta gönderme hatası:", emailError);
      // E-posta gönderilemese bile davet oluşturuldu, devam et
    }

    res.json({ 
      success: true, 
      message: `${email} adresine davet gönderildi`,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: "invited",
        expiresAt: invite.expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error("Davet hatası:", error);
    res.status(500).json({ error: "Davet gönderilemedi" });
  }
}

// Daveti iptal et
export async function cancelInvite(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { inviteId } = req.params;

    // Daveti bul ve kullanıcının ekibine ait olduğunu doğrula
    const invite = await prisma.teamInvite.findFirst({
      where: {
        id: inviteId,
        Team: { ownerId: userId }
      }
    });

    if (!invite) {
      return res.status(404).json({ error: "Davet bulunamadı" });
    }

    // Daveti sil
    await prisma.teamInvite.delete({
      where: { id: inviteId }
    });

    res.json({ success: true, message: "Davet iptal edildi" });
  } catch (error) {
    console.error("Davet iptal hatası:", error);
    res.status(500).json({ error: "Davet iptal edilemedi" });
  }
}

// Üyeyi ekipten çıkar
export async function removeMember(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { memberId } = req.params;

    // Üyeliği bul ve kullanıcının ekibine ait olduğunu doğrula
    const membership = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        Team: { ownerId: userId }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Üye bulunamadı" });
    }

    // Üyeliği sil
    await prisma.teamMember.delete({
      where: { id: memberId }
    });

    res.json({ success: true, message: "Üye ekipten çıkarıldı" });
  } catch (error) {
    console.error("Üye çıkarma hatası:", error);
    res.status(500).json({ error: "Üye çıkarılamadı" });
  }
}

// Üye rolünü güncelle
export async function updateMemberRole(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { memberId } = req.params;
    const { role } = req.body;

    // Rol validasyonu
    const validRoles: TeamRole[] = [TeamRole.VIEWER, TeamRole.MEMBER, TeamRole.EDITOR];
    if (!validRoles.includes(role as TeamRole)) {
      return res.status(400).json({ error: "Geçersiz rol" });
    }

    // Üyeliği bul ve kullanıcının ekibine ait olduğunu doğrula
    const membership = await prisma.teamMember.findFirst({
      where: {
        id: memberId,
        Team: { ownerId: userId }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Üye bulunamadı" });
    }

    // Rolü güncelle
    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: role as TeamRole }
    });

    res.json({ 
      success: true, 
      message: "Rol güncellendi",
      member: updated
    });
  } catch (error) {
    console.error("Rol güncelleme hatası:", error);
    res.status(500).json({ error: "Rol güncellenemedi" });
  }
}

// Davet detaylarını getir (token ile - public endpoint)
// Kullanıcıya gelen davet isteklerini getir
export async function getPendingInvites(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    
    // Kullanıcının e-posta adresini al
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    // Bu e-posta adresine gelen bekleyen davitleri getir
    const invites = await prisma.teamInvite.findMany({
      where: {
        email: user.email!.toLowerCase(),
        status: InviteStatus.PENDING,
        expiresAt: { gt: new Date() }
      },
      include: {
        Team: {
          select: {
            id: true,
            name: true,
            description: true,
            Owner: {
              select: { name: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(invites.map(invite => ({
      id: invite.id,
      token: invite.token,
      email: invite.email,
      role: invite.role,
      teamId: invite.Team.id,
      teamName: invite.Team.name,
      teamDescription: invite.Team.description,
      invitedBy: invite.Team.Owner.name || invite.Team.Owner.email,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString()
    })));
  } catch (error) {
    console.error("Davet listesi hatası:", error);
    res.status(500).json({ error: "Davet listesi alınamadı" });
  }
}

export async function getInviteByToken(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const invite = await prisma.teamInvite.findUnique({
      where: { token },
      include: {
        Team: {
          include: {
            Owner: {
              select: { name: true, email: true }
            }
          }
        }
      }
    });

    if (!invite) {
      return res.status(404).json({ error: "Davet bulunamadı" });
    }

    // Süresi dolmuş mu?
    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ error: "Bu davetin süresi dolmuş" });
    }

    // Zaten yanıtlanmış mı?
    if (invite.status !== InviteStatus.PENDING) {
      return res.status(410).json({ error: "Bu davet zaten yanıtlanmış" });
    }

    res.json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      teamName: invite.Team.name,
      teamDescription: invite.Team.description,
      invitedBy: invite.Team.Owner.name || invite.Team.Owner.email,
      expiresAt: invite.expiresAt.toISOString()
    });
  } catch (error) {
    console.error("Davet getirme hatası:", error);
    res.status(500).json({ error: "Davet bilgileri alınamadı" });
  }
}

// Daveti kabul et (token veya inviteId ile)
export async function acceptInvite(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { token, inviteId } = req.params;

    // token (URL'den) veya inviteId (body'den) ile invite bul
    let invite;
    if (inviteId) {
      invite = await prisma.teamInvite.findUnique({
        where: { id: inviteId },
        include: { Team: true }
      });
    } else {
      invite = await prisma.teamInvite.findUnique({
        where: { token },
        include: { Team: true }
      });
    }

    if (!invite) {
      return res.status(404).json({ error: "Davet bulunamadı" });
    }

    // Süresi dolmuş mu?
    if (invite.expiresAt < new Date()) {
      await prisma.teamInvite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED }
      });
      return res.status(410).json({ error: "Bu davetin süresi dolmuş" });
    }

    // Zaten yanıtlanmış mı?
    if (invite.status !== InviteStatus.PENDING) {
      return res.status(410).json({ error: "Bu davet zaten yanıtlanmış" });
    }

    // Kullanıcının e-postasını kontrol et
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    // E-posta normalize et (trim + lowercase)
    const userEmail = user?.email?.trim().toLowerCase();
    const inviteEmail = invite.email.trim().toLowerCase();

    if (userEmail !== inviteEmail) {
      console.log('Email mismatch:', { userEmail, inviteEmail });
      return res.status(403).json({ 
        error: "Bu davet farklı bir e-posta adresine gönderilmiş" 
      });
    }

    // Zaten üye mi?
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: invite.teamId,
          userId
        }
      }
    });

    if (existingMember) {
      // Daveti yanıtlandı olarak işaretle
      await prisma.teamInvite.update({
        where: { id: invite.id },
        data: { 
          status: InviteStatus.ACCEPTED,
          respondedAt: new Date()
        }
      });
      return res.status(400).json({ error: "Zaten bu ekibin üyesisiniz" });
    }

    // Transaction ile üyelik oluştur ve daveti güncelle
    const [member] = await prisma.$transaction([
      prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId,
          role: invite.role
        },
        include: {
          Team: true,
          User: {
            select: { id: true, email: true, name: true }
          }
        }
      }),
      prisma.teamInvite.update({
        where: { id: invite.id },
        data: { 
          status: InviteStatus.ACCEPTED,
          respondedAt: new Date()
        }
      })
    ]);

    res.json({ 
      success: true, 
      message: `${invite.Team.name} ekibine katıldınız`,
      team: {
        id: member.Team.id,
        name: member.Team.name
      }
    });
  } catch (error) {
    console.error("Davet kabul hatası:", error);
    res.status(500).json({ error: "Davet kabul edilemedi" });
  }
}

// Daveti reddet (token veya inviteId ile)
export async function declineInvite(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { token, inviteId } = req.params;

    // token (URL'den) veya inviteId (body'den) ile invite bul
    let invite;
    if (inviteId) {
      invite = await prisma.teamInvite.findUnique({
        where: { id: inviteId }
      });
    } else {
      invite = await prisma.teamInvite.findUnique({
        where: { token }
      });
    }

    if (!invite) {
      return res.status(404).json({ error: "Davet bulunamadı" });
    }

    // Kullanıcının e-postasını kontrol et
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    // E-posta normalize et (trim + lowercase)
    const userEmail = user?.email?.trim().toLowerCase();
    const inviteEmail = invite.email.trim().toLowerCase();

    if (userEmail !== inviteEmail) {
      return res.status(403).json({ 
        error: "Bu davet farklı bir e-posta adresine gönderilmiş" 
      });
    }

    // Daveti reddet
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { 
        status: InviteStatus.DECLINED,
        respondedAt: new Date()
      }
    });

    res.json({ success: true, message: "Davet reddedildi" });
  } catch (error) {
    console.error("Davet reddetme hatası:", error);
    res.status(500).json({ error: "Davet reddedilemedi" });
  }
}

// Kullanıcının dahil olduğu ekipleri listele
export async function listMyTeams(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    // Sahip olduğu ekipler
    const ownedTeams = await prisma.team.findMany({
      where: { ownerId: userId },
      include: {
        _count: { select: { Members: true } }
      }
    });

    // Üye olduğu ekipler
    const memberTeams = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        Team: {
          include: {
            Owner: { select: { name: true, email: true } },
            _count: { select: { Members: true } }
          }
        }
      }
    });

    res.json({
      owned: ownedTeams.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: t._count.Members,
        role: "OWNER"
      })),
      member: memberTeams.map(m => ({
        id: m.Team.id,
        name: m.Team.name,
        description: m.Team.description,
        memberCount: m.Team._count.Members,
        owner: m.Team.Owner.name || m.Team.Owner.email,
        role: m.role,
        joinedAt: m.joinedAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("Ekip listesi hatası:", error);
    res.status(500).json({ error: "Ekipler yüklenemedi" });
  }
}

// ============ EKİP DOSYALARI ============

// Kullanıcının ekip dosyalarına erişim yetkisini kontrol et
async function checkTeamAccess(userId: string, teamId: string, requiredRole?: TeamRole[]) {
  // Ekip sahibi mi?
  const team = await prisma.team.findFirst({
    where: { id: teamId, ownerId: userId }
  });
  
  if (team) {
    return { access: true, role: "OWNER" as const, team };
  }
  
  // Ekip üyesi mi?
  const membership = await prisma.teamMember.findFirst({
    where: { teamId, userId }
  });
  
  if (!membership) {
    return { access: false, role: null, team: null };
  }
  
  // Yetki kontrolü
  if (requiredRole && !requiredRole.includes(membership.role)) {
    return { access: false, role: membership.role, team: null };
  }
  
  return { access: true, role: membership.role, team: await prisma.team.findUnique({ where: { id: teamId } }) };
}

// Ekip dosyalarını listele
export async function listTeamFiles(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;
    const { folderId } = req.query;
    
    // Erişim kontrolü
    const { access, role } = await checkTeamAccess(userId, teamId);
    if (!access) {
      return res.status(403).json({ error: "Bu ekibe erişim yetkiniz yok" });
    }
    
    // Dosyaları getir
    const files = await prisma.file.findMany({
      where: {
        teamId,
        folderId: folderId ? String(folderId) : null,
        isDeleted: false
      },
      orderBy: { createdAt: "desc" },
      include: {
        User: { select: { id: true, name: true, email: true } }
      }
    });
    
    // Klasörleri getir
    const folders = await prisma.folder.findMany({
      where: {
        teamId,
        parentFolderId: folderId ? String(folderId) : null,
        isDeleted: false
      },
      orderBy: { createdAt: "desc" },
      include: {
        User: { select: { id: true, name: true, email: true } }
      }
    });
    
    res.json({
      files: files.map(f => ({
        id: f.id,
        filename: f.filename,
        originalName: f.originalName,
        sizeBytes: Number(f.sizeBytes),
        mimeType: f.mimeType,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        uploadedBy: f.User?.name || f.User?.email || "Bilinmiyor",
        // Şifreleme bilgileri
        isEncrypted: f.isEncrypted,
        encryptionVersion: f.cryptoVersion,
        cipherIv: f.cipherIv,
        metaNameEnc: f.metaNameEnc,
        metaNameIv: f.metaNameIv,
        // Ekip DEK bilgileri (ekip üyeleri için)
        teamDek: f.teamDek,
        teamDekIv: f.teamDekIv
      })),
      folders: folders.map(f => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt.toISOString(),
        createdBy: f.User?.name || f.User?.email || "Bilinmiyor"
      })),
      userRole: role
    });
  } catch (error) {
    console.error("Ekip dosyaları listesi hatası:", error);
    res.status(500).json({ error: "Dosyalar yüklenemedi" });
  }
}

// Dosyayı ekiple paylaş (kişisel dosyayı ekibe taşı)
export async function shareFileWithTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId, teamId, teamDek, teamDekIv } = req.body;
    
    if (!fileId || !teamId) {
      return res.status(400).json({ error: "Dosya ID ve Ekip ID gerekli" });
    }
    
    // Dosya kontrolü
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId, isDeleted: false }
    });
    
    if (!file) {
      return res.status(404).json({ error: "Dosya bulunamadı" });
    }
    
    // Ekip erişim kontrolü - MEMBER, EDITOR, OWNER dosya ekleyebilir
    const { access } = await checkTeamAccess(userId, teamId, [TeamRole.MEMBER, TeamRole.EDITOR]);
    if (!access) {
      return res.status(403).json({ error: "Bu ekibe dosya ekleme yetkiniz yok" });
    }
    
    // Dosyayı ekiple paylaş (kopyala değil, taşı)
    // Şifreli dosya ise teamDek bilgisini de kaydet
    await prisma.file.update({
      where: { id: fileId },
      data: { 
        teamId,
        // Şifreli dosya için DEK bilgileri (ekip üyeleri erişebilir)
        teamDek: file.isEncrypted && teamDek ? teamDek : null,
        teamDekIv: file.isEncrypted && teamDekIv ? teamDekIv : null
      }
    });
    
    res.json({ success: true, message: "Dosya ekiple paylaşıldı" });
  } catch (error) {
    console.error("Dosya paylaşma hatası:", error);
    res.status(500).json({ error: "Dosya paylaşılamadı" });
  }
}

// Dosyayı ekipten kaldır (kişisel alana taşı)
export async function unshareFileFromTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.body;
    
    // Dosya kontrolü
    const file = await prisma.file.findFirst({
      where: { id: fileId, isDeleted: false },
      include: { Team: true }
    });
    
    if (!file || !file.teamId) {
      return res.status(404).json({ error: "Ekip dosyası bulunamadı" });
    }
    
    // Sadece EDITOR, ADMIN veya sahibi kaldırabilir
    const { access, role } = await checkTeamAccess(userId, file.teamId);
    if (!access) {
      return res.status(403).json({ error: "Ekipe erişim yetkiniz yok" });
    }
    
    // EDITOR, OWNER silebilir
    const canDelete = role === "EDITOR" || role === "OWNER" || file.userId === userId;
    if (!canDelete) {
      return res.status(403).json({ error: "Bu dosyayı silme yetkiniz yok" });
    }
    
    // Dosyayı ekipten kaldır
    await prisma.file.update({
      where: { id: fileId },
      data: { teamId: null }
    });
    
    res.json({ success: true, message: "Dosya ekipten kaldırıldı" });
  } catch (error) {
    console.error("Dosya kaldırma hatası:", error);
    res.status(500).json({ error: "Dosya kaldırılamadı" });
  }
}

// Yardımcı: Ekip üyelerine etkinlik bildirimi gönder
async function notifyTeamMembers(
  teamId: string,
  actorId: string,
  type: string,
  details: {
    fileId?: string;
    fileName?: string;
    folderId?: string;
    folderName?: string;
    metadata?: any;
  }
) {
  try {
    // Aktör bilgisini al
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, email: true }
    });
    const actorName = actor?.name || actor?.email?.split('@')[0] || 'Bilinmeyen';

    // Ekip sahibini al
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { ownerId: true, name: true }
    });

    // Ekip üyelerini al (aktörü hariç tut)
    const members = await prisma.teamMember.findMany({
      where: { teamId, userId: { not: actorId } },
      select: { userId: true }
    });

    // Ekip sahibini de ekle (aktör değilse)
    const userIds = members.map(m => m.userId);
    if (team?.ownerId && team.ownerId !== actorId && !userIds.includes(team.ownerId)) {
      userIds.push(team.ownerId);
    }

    // Her üye için etkinlik oluştur
    for (const memberId of userIds) {
      await createActivity({
        userId: memberId,
        type,
        fileId: details.fileId,
        fileName: details.fileName,
        folderId: details.folderId,
        folderName: details.folderName,
        actorId,
        actorName,
        metadata: { ...details.metadata, teamId, teamName: team?.name }
      });
    }
  } catch (error) {
    console.error("Ekip bildirimi oluşturma hatası:", error);
  }
}

// Ekip klasörü oluştur
export async function createTeamFolder(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { teamId, name, parentFolderId } = req.body;
    
    if (!teamId || !name?.trim()) {
      return res.status(400).json({ error: "Ekip ID ve klasör adı gerekli" });
    }
    
    // Erişim kontrolü - MEMBER, EDITOR, OWNER klasör oluşturabilir
    const { access } = await checkTeamAccess(userId, teamId, [TeamRole.MEMBER, TeamRole.EDITOR]);
    if (!access) {
      return res.status(403).json({ error: "Bu ekipte klasör oluşturma yetkiniz yok" });
    }
    
    // Klasör oluştur
    const folder = await prisma.folder.create({
      data: {
        id: crypto.randomUUID(),
        name: name.trim(),
        userId,
        teamId,
        parentFolderId: parentFolderId || null,
        updatedAt: new Date()
      }
    });
    
    // Ekip üyelerine bildirim gönder
    await notifyTeamMembers(teamId, userId, 'TEAM_FOLDER_CREATE', {
      folderId: folder.id,
      folderName: folder.name
    });
    
    res.json({ success: true, folder });
  } catch (error) {
    console.error("Ekip klasörü oluşturma hatası:", error);
    res.status(500).json({ error: "Klasör oluşturulamadı" });
  }
}

// Ekip dosyasını sil
export async function deleteTeamFile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    
    // Dosya kontrolü
    const file = await prisma.file.findFirst({
      where: { id: fileId, isDeleted: false }
    });
    
    if (!file || !file.teamId) {
      return res.status(404).json({ error: "Ekip dosyası bulunamadı" });
    }
    
    // Erişim kontrolü
    const { access, role } = await checkTeamAccess(userId, file.teamId);
    if (!access) {
      return res.status(403).json({ error: "Bu dosyaya erişim yetkiniz yok" });
    }
    
    // EDITOR, ADMIN, OWNER silebilir
    if (role === TeamRole.VIEWER || role === TeamRole.MEMBER) {
      return res.status(403).json({ error: "Dosya silme yetkiniz yok" });
    }
    
    // Soft delete
    await prisma.file.update({
      where: { id: fileId },
      data: { isDeleted: true, deletedAt: new Date() }
    });
    
    // Ekip üyelerine bildirim gönder
    await notifyTeamMembers(file.teamId, userId, 'TEAM_FILE_DELETE', {
      fileId: file.id,
      fileName: file.filename
    });
    
    res.json({ success: true, message: "Dosya silindi" });
  } catch (error) {
    console.error("Ekip dosyası silme hatası:", error);
    res.status(500).json({ error: "Dosya silinemedi" });
  }
}

// Ekip klasörünü sil
export async function deleteTeamFolder(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { folderId } = req.params;
    
    // Klasör kontrolü
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, isDeleted: false }
    });
    
    if (!folder || !folder.teamId) {
      return res.status(404).json({ error: "Ekip klasörü bulunamadı" });
    }
    
    // Erişim kontrolü
    const { access, role } = await checkTeamAccess(userId, folder.teamId);
    if (!access) {
      return res.status(403).json({ error: "Bu klasöre erişim yetkiniz yok" });
    }
    
    // EDITOR, ADMIN, OWNER silebilir
    if (role === TeamRole.VIEWER || role === TeamRole.MEMBER) {
      return res.status(403).json({ error: "Klasör silme yetkiniz yok" });
    }
    
    // Soft delete
    await prisma.folder.update({
      where: { id: folderId },
      data: { isDeleted: true }
    });
    
    // Ekip üyelerine bildirim gönder
    await notifyTeamMembers(folder.teamId, userId, 'TEAM_FOLDER_DELETE', {
      folderId: folder.id,
      folderName: folder.name
    });
    
    res.json({ success: true, message: "Klasör silindi" });
  } catch (error) {
    console.error("Ekip klasörü silme hatası:", error);
    res.status(500).json({ error: "Klasör silinemedi" });
  }
}

// Ekibe doğrudan dosya yükle
export async function uploadTeamFile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;
    const folderId = req.body?.folderId || null;
    
    if (!req.file) {
      return res.status(400).json({ error: "Dosya yüklenmedi" });
    }
    
    // Erişim kontrolü
    const { access, role } = await checkTeamAccess(userId, teamId, [TeamRole.MEMBER, TeamRole.EDITOR]);
    if (!access) {
      return res.status(403).json({ error: "Bu ekibe dosya yükleme yetkiniz yok" });
    }
    
    const file = req.file;
    const fs = await import("fs");
    const path = await import("path");
    
    // Dosya buffer'ını al
    let fileBuffer: Buffer;
    if ((file as any).buffer && Buffer.isBuffer((file as any).buffer)) {
      fileBuffer = (file as any).buffer;
    } else if (file.path && fs.existsSync(file.path)) {
      fileBuffer = fs.readFileSync(file.path);
    } else {
      return res.status(500).json({ error: "Yüklenen dosya okunamadı" });
    }
    
    // Uzantı çıkar
    const originalName = file.originalname;
    let ext = path.extname(originalName).toLowerCase().replace(/^\./, "");
    if (!ext && file.mimetype) {
      const parts = file.mimetype.split("/");
      ext = parts[1] ? parts[1].toLowerCase() : parts[0];
    }
    
    // Aynı isimde dosya var mı kontrol et (sürüm kontrolü)
    const existing = await prisma.file.findFirst({
      where: {
        filename: file.originalname,
        teamId: teamId,
        folderId: folderId,
        isDeleted: false,
      }
    });
    
    let resultFile;
    let isNewVersion = false;
    let previousVersion = 0;
    
    if (existing) {
      // Dosya zaten var - yeni sürüm olarak kaydet
      previousVersion = 0;
      const newVersion = previousVersion + 1;
      
      // Eski versiyonu FileVersion tablosuna taşı
      await prisma.fileVersion.create({
        data: {
          fileId: existing.id,
          version: previousVersion,
          filename: existing.filename,
          sizeBytes: existing.sizeBytes,
          storagePath: existing.storagePath || '',
          storageKey: existing.storageKey,
          storageProvider: existing.storageProvider,
          mimeType: existing.mimeType,
        },
      });
      
      // Dosyayı kaydet
      const safeName = originalName.replace(/[^a-zA-Z0-9.\-_%]/g, "_");
      const storageKey = `team/${teamId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const localPath = path.join(__dirname, "../../uploads", storageKey);
      
      try {
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(localPath, fileBuffer);
      } catch (e) {
        console.error("Local upload error:", e);
        return res.status(500).json({ error: "Dosya kaydedilirken hata oldu" });
      }
      
      // Ana kayıt güncelle
      resultFile = await prisma.file.update({
        where: { id: existing.id },
        data: {
          sizeBytes: BigInt(file.size),
          mimeType: file.mimetype,
          storageKey: storageKey,
          storagePath: storageKey,
          storageProvider: "LOCAL",
          extension: ext,
          version: newVersion,
          updatedAt: new Date()
        }
      });
      
      isNewVersion = true;
      
      // Ekip üyelerine bildirim gönder
      await notifyTeamMembers(teamId, userId, 'TEAM_FILE_UPLOAD', {
        fileId: resultFile.id,
        fileName: resultFile.filename,
        isNewVersion: true,
        version: newVersion,
        metadata: { sizeBytes: Number(resultFile.sizeBytes), mimeType: resultFile.mimeType }
      });
      
      // Temp dosyasını sil
      try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
      
      return res.status(201).json({ 
        success: true,
        isNewVersion: true,
        previousVersion: previousVersion,
        message: `"${file.originalname}" zaten mevcut. Yeni sürüm (v${newVersion}) olarak kaydedildi.`,
        file: {
          id: resultFile.id,
          filename: resultFile.filename,
          sizeBytes: Number(resultFile.sizeBytes),
          mimeType: resultFile.mimeType,
          version: newVersion,
          createdAt: resultFile.createdAt,
          uploadedBy: userId
        }
      });
    }
    
    // Dosyayı kaydet
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_%]/g, "_");
    const storageKey = `team/${teamId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const localPath = path.join(__dirname, "../../uploads", storageKey);
    
    try {
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(localPath, fileBuffer);
    } catch (e) {
      console.error("Local upload error:", e);
      return res.status(500).json({ error: "Dosya kaydedilirken hata oldu" });
    }
    
    // Veritabanına kaydet (yeni dosya)
    resultFile = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        filename: file.originalname,
        sizeBytes: BigInt(file.size),
        mimeType: file.mimetype,
        storagePath: storageKey,
        storageKey: storageKey,
        storageProvider: "LOCAL",
        extension: ext,
        userId: userId,
        teamId: teamId,
        folderId: folderId,
        updatedAt: new Date()
      }
    });
    
    // Temp dosyasını sil
    try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    
    // Ekip üyelerine bildirim gönder
    await notifyTeamMembers(teamId, userId, 'TEAM_FILE_UPLOAD', {
      fileId: resultFile.id,
      fileName: resultFile.filename,
      metadata: { sizeBytes: Number(resultFile.sizeBytes), mimeType: resultFile.mimeType }
    });
    
    res.status(201).json({ 
      success: true, 
      file: {
        id: resultFile.id,
        filename: resultFile.filename,
        sizeBytes: Number(resultFile.sizeBytes),
        mimeType: resultFile.mimeType,
        version: 0,
        createdAt: resultFile.createdAt,
        uploadedBy: userId
      }
    });
  } catch (error) {
    console.error("Ekip dosyası yükleme hatası:", error);
    console.error("Hata detayı:", error instanceof Error ? error.message : String(error));
    console.error("Stack:", error instanceof Error ? error.stack : null);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : "Dosya yüklenemedi",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// ==================== YORUM SİSTEMİ ====================

// Rol yetki kontrolü yardımcı fonksiyonu
export function hasPermission(role: string, action: 'view' | 'download' | 'upload' | 'delete' | 'manage' | 'comment'): boolean {
  const rolePermissions: Record<string, string[]> = {
    'VIEWER': ['view', 'comment', 'upload'],
    'MEMBER': ['view', 'download', 'comment', 'upload'],
    'EDITOR': ['view', 'download', 'upload', 'delete', 'comment'],
    'OWNER': ['view', 'download', 'upload', 'delete', 'manage', 'comment']
  };
  
  return rolePermissions[role]?.includes(action) || false;
}

// Dosya yorumlarını listele
export async function listFileComments(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;

    // Dosyayı bul ve ekip kontrolü yap
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { Team: true }
    });

    if (!file) {
      return res.status(404).json({ error: "Dosya bulunamadı" });
    }

    // Ekip dosyası değilse veya kullanıcı ekip üyesi değilse
    if (file.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId }
      });
      
      const isOwner = file.Team?.ownerId === userId;
      
      if (!membership && !isOwner) {
        return res.status(403).json({ error: "Bu dosyaya erişim yetkiniz yok" });
      }
    } else if (file.userId !== userId) {
      return res.status(403).json({ error: "Bu dosyaya erişim yetkiniz yok" });
    }

    // Yorumları getir
    const comments = await prisma.fileComment.findMany({
      where: { fileId },
      include: {
        User: {
          select: { id: true, name: true, email: true, profilePhoto: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        user: {
          id: c.User.id,
          name: c.User.name || c.User.email?.split('@')[0],
          email: c.User.email,
          profilePhoto: c.User.profilePhoto
        }
      }))
    });
  } catch (error) {
    console.error("Yorum listeleme hatası:", error);
    res.status(500).json({ error: "Yorumlar yüklenemedi" });
  }
}

// Yorum ekle
export async function addFileComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: "Yorum içeriği gerekli" });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: "Yorum en fazla 1000 karakter olabilir" });
    }

    // Dosyayı bul ve ekip kontrolü yap
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { Team: true }
    });

    if (!file) {
      return res.status(404).json({ error: "Dosya bulunamadı" });
    }

    // Ekip dosyası kontrolü - tüm ekip üyeleri yorum yapabilir
    if (file.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId }
      });
      
      const isOwner = file.Team?.ownerId === userId;
      
      if (!membership && !isOwner) {
        return res.status(403).json({ error: "Bu dosyaya yorum yapma yetkiniz yok" });
      }
    } else if (file.userId !== userId) {
      return res.status(403).json({ error: "Bu dosyaya yorum yapma yetkiniz yok" });
    }

    // Yorum oluştur
    const comment = await prisma.fileComment.create({
      data: {
        id: crypto.randomUUID(),
        fileId,
        userId,
        content: content.trim()
      },
      include: {
        User: {
          select: { id: true, name: true, email: true, profilePhoto: true }
        }
      }
    });

    // Ekip dosyasına yorum yapıldığında diğer üyelere bildir
    if (file.teamId) {
      await notifyTeamMembers(file.teamId, userId, 'TEAM_FILE_COMMENT', {
        fileId: file.id,
        fileName: file.filename,
        metadata: { commentId: comment.id, commentPreview: content.substring(0, 50) }
      });
    }

    res.status(201).json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user: {
          id: comment.User.id,
          name: comment.User.name || comment.User.email?.split('@')[0],
          email: comment.User.email,
          profilePhoto: comment.User.profilePhoto
        }
      }
    });
  } catch (error) {
    console.error("Yorum ekleme hatası:", error);
    res.status(500).json({ error: "Yorum eklenemedi" });
  }
}

// Yorum sil
export async function deleteFileComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { commentId } = req.params;

    // Yorumu bul
    const comment = await prisma.fileComment.findUnique({
      where: { id: commentId },
      include: {
        File: {
          include: { Team: true }
        }
      }
    });

    if (!comment) {
      return res.status(404).json({ error: "Yorum bulunamadı" });
    }

    // Yetki kontrolü - kendi yorumu veya EDITOR/ADMIN/sahibi silebilir
    const isOwnComment = comment.userId === userId;
    let canDelete = isOwnComment;

    if (!canDelete && comment.File.teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: comment.File.teamId, userId }
      });
      
      const isOwner = comment.File.Team?.ownerId === userId;
      const isEditor = membership?.role === 'EDITOR';
      
      canDelete = isOwner || isEditor;
    }

    if (!canDelete) {
      return res.status(403).json({ error: "Bu yorumu silme yetkiniz yok" });
    }

    await prisma.fileComment.delete({
      where: { id: commentId }
    });

    res.json({ success: true, message: "Yorum silindi" });
  } catch (error) {
    console.error("Yorum silme hatası:", error);
    res.status(500).json({ error: "Yorum silinemedi" });
  }
}

// Yorum güncelle
export async function updateFileComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: "Yorum içeriği gerekli" });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: "Yorum en fazla 1000 karakter olabilir" });
    }

    // Yorumu bul
    const comment = await prisma.fileComment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      return res.status(404).json({ error: "Yorum bulunamadı" });
    }

    // Sadece kendi yorumunu güncelleyebilir
    if (comment.userId !== userId) {
      return res.status(403).json({ error: "Sadece kendi yorumunuzu güncelleyebilirsiniz" });
    }

    const updatedComment = await prisma.fileComment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        User: {
          select: { id: true, name: true, email: true, profilePhoto: true }
        }
      }
    });

    res.json({
      comment: {
        id: updatedComment.id,
        content: updatedComment.content,
        createdAt: updatedComment.createdAt,
        updatedAt: updatedComment.updatedAt,
        user: {
          id: updatedComment.User.id,
          name: updatedComment.User.name || updatedComment.User.email?.split('@')[0],
          email: updatedComment.User.email,
          profilePhoto: updatedComment.User.profilePhoto
        }
      }
    });
  } catch (error) {
    console.error("Yorum güncelleme hatası:", error);
    res.status(500).json({ error: "Yorum güncellenemedi" });
  }
}

// ==================== EKİP DOSYA İŞLEMLERİ ====================

// Ekip dosyasını yeniden adlandır
export async function renameTeamFile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: "Dosya adı gerekli" });
    }

    // Dosyayı bul
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { Team: true }
    });

    if (!file) {
      return res.status(404).json({ error: "Dosya bulunamadı" });
    }

    // Ekip dosyası kontrolü
    if (!file.teamId) {
      return res.status(400).json({ error: "Bu bir ekip dosyası değil" });
    }

    // Üyelik ve yetki kontrolü
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: file.teamId, userId }
    });
    const isOwner = file.Team?.ownerId === userId;

    if (!membership && !isOwner) {
      return res.status(403).json({ error: "Bu dosyaya erişim yetkiniz yok" });
    }

    // Yeniden adlandırma yetkisi: MANAGER, ADMIN veya OWNER
    const role = isOwner ? 'OWNER' : membership?.role;
    if (!hasPermission(role || '', 'delete')) {
      return res.status(403).json({ error: "Dosyayı yeniden adlandırma yetkiniz yok" });
    }

    // Dosyayı güncelle
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { filename: name.trim() }
    });

    // Ekip üyelerine bildirim
    await notifyTeamMembers(file.teamId, userId, 'TEAM_FILE_RENAMED', {
      fileId: file.id,
      fileName: name.trim()
    });

    res.json({ 
      message: "Dosya adı güncellendi",
      file: {
        id: updatedFile.id,
        filename: updatedFile.filename
      }
    });
  } catch (error) {
    console.error("Ekip dosyası yeniden adlandırma hatası:", error);
    res.status(500).json({ error: "Dosya adı güncellenemedi" });
  }
}

// Ekip dosyasını kişisel dosyalara kopyala
export async function copyTeamFileToPersonal(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { folderId } = req.body; // Opsiyonel: hedef klasör

    // Dosyayı bul
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { Team: true }
    });

    if (!file) {
      return res.status(404).json({ error: "Dosya bulunamadı" });
    }

    // Ekip dosyası kontrolü
    if (!file.teamId) {
      return res.status(400).json({ error: "Bu bir ekip dosyası değil" });
    }

    // Üyelik ve yetki kontrolü
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: file.teamId, userId }
    });
    const isOwner = file.Team?.ownerId === userId;

    if (!membership && !isOwner) {
      return res.status(403).json({ error: "Bu dosyaya erişim yetkiniz yok" });
    }

    // İndirme yetkisi kontrolü (kopyalama için download yetkisi gerekli)
    const role = isOwner ? 'OWNER' : membership?.role;
    if (!hasPermission(role || '', 'download')) {
      return res.status(403).json({ error: "Dosyayı kopyalama yetkiniz yok" });
    }

    // Kullanıcının depolama limitini kontrol et
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { usedBytes: true, storageLimitBytes: true }
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    const newUsedBytes = BigInt(user.usedBytes) + BigInt(file.sizeBytes);
    if (newUsedBytes > BigInt(user.storageLimitBytes)) {
      return res.status(400).json({ error: "Depolama alanınız yetersiz" });
    }

    // Fiziksel dosyayı kopyala
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    
    const sourceKey = (file as any).storageKey || file.storagePath;
    const sourcePath = path.join(__dirname, "../../uploads", sourceKey);
    
    // Yeni dosya adı ve yolu oluştur
    const newFileId = crypto.randomUUID();
    const extension = path.extname(file.filename);
    const newStorageKey = `${userId}/${newFileId}${extension}`;
    const destPath = path.join(__dirname, "../../uploads", newStorageKey);

    // Hedef dizini oluştur
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Dosyayı kopyala
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
    } else {
      return res.status(404).json({ error: "Kaynak dosya bulunamadı" });
    }

    // Veritabanında yeni kayıt oluştur
    const createData: any = {
      id: newFileId,
      filename: file.filename,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      storagePath: newStorageKey,
      storageKey: newStorageKey,
      storageProvider: 'LOCAL',
      userId: userId,
      teamId: null, // Kişisel dosya olacak
      extension: file.extension,
      isEncrypted: false // Kopyalanan dosya şifrelenmemiş
    };
    if (folderId) {
      createData.folderId = folderId;
    }
    
    const newFile = await prisma.file.create({ data: createData });

    // Kullanıcının kullanılan alanını güncelle
    await prisma.user.update({
      where: { id: userId },
      data: { usedBytes: newUsedBytes }
    });

    res.status(201).json({ 
      message: "Dosya kişisel dosyalarınıza kopyalandı",
      file: {
        id: newFile.id,
        filename: newFile.filename,
        sizeBytes: Number(newFile.sizeBytes),
        mimeType: newFile.mimeType,
        createdAt: newFile.createdAt
      }
    });
  } catch (error) {
    console.error("Ekip dosyası kopyalama hatası:", error);
    res.status(500).json({ error: "Dosya kopyalanamadı" });
  }
}

// Ekipten çık
export async function leaveTeam(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;

    if (!teamId) {
      return res.status(400).json({ error: "Ekip ID gerekli" });
    }

    // Ekip sahibi mi kontrol et
    const team = await prisma.team.findFirst({
      where: { id: teamId, ownerId: userId }
    });

    if (team) {
      return res.status(403).json({ error: "Ekip sahibi ekipten çıkamaz" });
    }

    // Ekip üyeliğini bul ve sil
    const membership = await prisma.teamMember.findFirst({
      where: { teamId, userId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Bu ekibin üyesi değilsiniz" });
    }

    // Üyeliği sil
    await prisma.teamMember.delete({
      where: { id: membership.id }
    });

    res.json({ success: true, message: "Ekipten başarıyla ayrıldınız" });
  } catch (error) {
    console.error("Ekipten çıkma hatası:", error);
    res.status(500).json({ error: "Ekipten çıkılamadı" });
  }
}

