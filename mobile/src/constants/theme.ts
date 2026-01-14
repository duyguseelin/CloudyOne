// Web tasarımına uygun tema renkleri
export const colors = {
  // Ana renkler
  primary: '#6366f1', // Indigo
  primaryDark: '#4f46e5',
  primaryLight: '#818cf8',
  secondary: '#8b5cf6', // Violet
  secondaryDark: '#7c3aed',
  secondaryLight: '#a78bfa',
  
  // Arka plan renkleri
  bgDark: '#0a0e27',
  bgDarker: '#050816',
  bgCard: 'rgba(255, 255, 255, 0.05)',
  bgCardHover: 'rgba(255, 255, 255, 0.08)',
  glass: 'rgba(255, 255, 255, 0.1)',
  
  // Surface
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.08)',
  surfaceBorder: 'rgba(255, 255, 255, 0.1)',
  
  // Metin renkleri
  textPrimary: '#ffffff',
  textSecondary: '#a8b3cf',
  textMuted: '#6b7a99',
  textDark: '#1f2937',
  
  // Accent renkler
  success: '#10b981',
  successDark: '#059669',
  error: '#ef4444',
  errorDark: '#dc2626',
  warning: '#f59e0b',
  warningDark: '#d97706',
  info: '#3b82f6',
  infoDark: '#2563eb',
  
  // Dosya tipleri için renkler
  filePdf: '#ef4444',
  fileDoc: '#3b82f6',
  fileXls: '#10b981',
  filePpt: '#f97316',
  fileImage: '#ec4899',
  fileVideo: '#8b5cf6',
  fileAudio: '#06b6d4',
  fileZip: '#6366f1',
  fileDefault: '#6b7280',
  
  // Klasör renkleri
  folderBlue: '#38bdf8',
  folderGreen: '#4ade80',
  folderYellow: '#facc15',
  folderPurple: '#a78bfa',
  
  // Border
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.15)',
  
  // Tab bar
  tabActive: '#6366f1',
  tabInactive: '#6b7a99',
};

// Gradient'ler
export const gradients = {
  primary: ['#667eea', '#764ba2'],
  secondary: ['#6366f1', '#8b5cf6'],
  accent: ['#ec4899', '#f43f5e'],
  success: ['#10b981', '#059669'],
  purple: ['#a855f7', '#7c3aed'],
  blue: ['#3b82f6', '#1d4ed8'],
  pink: ['#ec4899', '#be185d'],
  orange: ['#f97316', '#ea580c'],
  teal: ['#14b8a6', '#0d9488'],
};

// Gölgeler
export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  }),
};

// Spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border radius
export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

// Font sizes
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  title: 28,
  hero: 36,
};

// Font weights
export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export default {
  colors,
  gradients,
  shadows,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
};
