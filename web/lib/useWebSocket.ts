// web/lib/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export interface SyncEvent {
  type: string;
  timestamp: string;
  data: any;
}

export type SyncEventHandler = (event: SyncEvent) => void;

export function useWebSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<SyncEventHandler>>>(new Map());

  // Bağlantıyı başlat
  useEffect(() => {
    if (!token) {
      // Token yoksa bağlantıyı kapat
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // WebSocket bağlantısı oluştur
    const socket = io(API_BASE, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
    });

    socket.on('sync', (event: SyncEvent) => {
      console.log('📥 WebSocket sync event:', event);
      
      // Event handler'ları çağır
      const handlers = handlersRef.current.get(event.type) || new Set();
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in sync event handler:', error);
        }
      });

      // Tüm handler'ları da çağır (*)
      const allHandlers = handlersRef.current.get('*') || new Set();
      allHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Error in sync event handler:', error);
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Event listener ekle
  const on = useCallback((eventType: string, handler: SyncEventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);

    // Cleanup fonksiyonu döndür
    return () => {
      const handlers = handlersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          handlersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  // Event listener kaldır
  const off = useCallback((eventType: string, handler: SyncEventHandler) => {
    const handlers = handlersRef.current.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        handlersRef.current.delete(eventType);
      }
    }
  }, []);

  return {
    isConnected,
    on,
    off,
    socket: socketRef.current,
  };
}
