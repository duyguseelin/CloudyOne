import Constants from 'expo-constants';

// API Configuration
const getDevApiUrl = () => {
  // Expo'nun çalıştığı IP'yi otomatik algıla
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0]; // IP adresini al
    return `http://${host}:5001`;
  }
  // Fallback
  return 'http://localhost:5001';
};

export const API_BASE_URL = __DEV__ 
  ? getDevApiUrl()
  : 'https://api.cloudyone.com'; // Production

export const APP_NAME = 'CloudyOne';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER_DATA: 'userData',
};

export const COLORS = {
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  secondary: '#8b5cf6',
  accent: '#ec4899',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  
  // Dark theme
  background: '#0a0e27',
  surface: '#1a1f3c',
  surfaceLight: '#252b4a',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a8b3cf',
  textMuted: '#6b7a99',
  
  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};
