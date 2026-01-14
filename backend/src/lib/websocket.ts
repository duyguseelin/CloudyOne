// backend/src/lib/websocket.ts
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/tokenServiceRS256"; // FAZ 7: RS256 JWT

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

let io: Server | null = null;
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

export function initializeWebSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || ["http://localhost:3000", "http://localhost:8081"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    
    console.log('🔌 [WebSocket] Auth attempt, token:', token ? `${token.substring(0, 20)}...` : 'YOK');
    
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    try {
      // FAZ 7: RS256 JWT verification
      const decoded = verifyAccessToken(token);
      console.log('✅ [WebSocket] Token verified, userId:', decoded.userId);
      socket.userId = decoded.userId;
      next();
    } catch (err: any) {
      console.error('❌ [WebSocket] Token verify failed:', err.message);
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    
    console.log(`✅ WebSocket: User ${userId} connected (socket: ${socket.id})`);
    
    // Kullanıcının socket'lerini kaydet
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    
    // Kullanıcıyı kendi odasına ekle
    socket.join(`user:${userId}`);
    
    socket.on("disconnect", () => {
      console.log(`❌ WebSocket: User ${userId} disconnected (socket: ${socket.id})`);
      
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
    
    socket.on("error", (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
    });
  });

  console.log("🔌 WebSocket server initialized");
  return io;
}

export function getIO(): Server | null {
  return io;
}

// Kullanıcıya olay gönder (tüm aktif cihazlarına)
export function emitToUser(userId: string, event: string, data: any) {
  if (!io) {
    console.warn("WebSocket not initialized");
    return;
  }
  
  io.to(`user:${userId}`).emit(event, data);
  console.log(`📤 WebSocket: Sent ${event} to user ${userId}`, data);
}

// Tüm kullanıcılara olay gönder
export function emitToAll(event: string, data: any) {
  if (!io) {
    console.warn("WebSocket not initialized");
    return;
  }
  
  io.emit(event, data);
}

// Belirli kullanıcı grubuna olay gönder
export function emitToUsers(userIds: string[], event: string, data: any) {
  if (!io) {
    console.warn("WebSocket not initialized");
    return;
  }
  
  userIds.forEach(userId => {
    io!.to(`user:${userId}`).emit(event, data);
  });
}

// Kullanıcının aktif bağlantı sayısı
export function getUserConnectionCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}

// Kullanıcı çevrimiçi mi?
export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId) && userSockets.get(userId)!.size > 0;
}
