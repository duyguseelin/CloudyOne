import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import { api } from '../services/api';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  SharedFiles: undefined;
  HiddenFiles: undefined;
  QuickTransfer: undefined;
  Team: undefined;
  Favorites: undefined;
  Activities: undefined;
  Trash: undefined;
  Scan: undefined;
};

type MoreScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface StorageCategory {
  name: string;
  size: number;
  count: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const MoreScreen: React.FC = () => {
  const navigation = useNavigation<MoreScreenNavigationProp>();
  const [storageInfo, setStorageInfo] = useState<{ usedBytes: number; totalBytes: number; trashBytes: number } | null>(null);
  const [categories, setCategories] = useState<StorageCategory[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStorageInfo();
    }, [])
  );

  const loadStorageInfo = async () => {
    try {
      const data = await api.getStorageInfo();
      setStorageInfo({
        usedBytes: data.usedStorage || data.usedStorageBytes || 0,
        totalBytes: data.totalStorage || data.storageLimitBytes || 5 * 1024 * 1024 * 1024, // 5GB default
        trashBytes: data.trashStorageBytes || 0,
      });
      
      // Kategorileri API'den gelen verilerle güncelle
      if (data.categoryBytes) {
        setCategories([
          { 
            name: 'Resimler', 
            size: data.categoryBytes.image || 0, 
            count: data.categoryCounts?.image || 0,
            color: '#f97316', 
            icon: 'image' 
          },
          { 
            name: 'Medya', 
            size: data.categoryBytes.media || 0, 
            count: data.categoryCounts?.media || 0,
            color: '#a855f7', 
            icon: 'videocam' 
          },
          { 
            name: 'Belgeler', 
            size: data.categoryBytes.document || 0, 
            count: data.categoryCounts?.document || 0,
            color: '#3b82f6', 
            icon: 'document-text' 
          },
          { 
            name: 'Diğer', 
            size: data.categoryBytes.other || 0, 
            count: data.categoryCounts?.other || 0,
            color: '#6b7280', 
            icon: 'folder' 
          },
        ]);
      }
    } catch (error) {
      console.error('Depolama bilgisi yüklenemedi:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const usagePercent = storageInfo 
    ? (storageInfo.usedBytes / storageInfo.totalBytes) * 100
    : 0;

  const menuItems = [
    {
      icon: 'scan' as const,
      title: 'Belge Tara',
      subtitle: 'Belge, makbuz veya not tarayın',
      color: '#8b5cf6',
      onPress: () => (navigation as any).navigate('Scan'),
    },
    {
      icon: 'images' as const,
      title: 'Fotoğraflar',
      subtitle: 'Resim ve videolarınız',
      color: '#f97316',
      onPress: () => (navigation as any).navigate('Gallery'),
    },
    {
      icon: 'star' as const,
      title: 'Favoriler',
      subtitle: 'Favori dosyalarınız',
      color: colors.warning,
      onPress: () => (navigation as any).navigate('Favorites'),
    },
    {
      icon: 'trash' as const,
      title: 'Çöp Kutusu',
      subtitle: 'Silinen dosyalar',
      color: colors.error,
      onPress: () => (navigation as any).navigate('Trash'),
    },
    {
      icon: 'share-social' as const,
      title: 'Paylaşılanlar',
      subtitle: 'Paylaştığınız dosyalar',
      color: colors.secondary,
      onPress: () => navigation.navigate('SharedFiles'),
    },
    {
      icon: 'eye-off' as const,
      title: 'Gizli Dosyalar',
      subtitle: 'PIN korumalı dosyalar',
      color: '#ef4444',
      onPress: () => navigation.navigate('HiddenFiles'),
    },
    {
      icon: 'cloud-upload' as const,
      title: 'Dosya İstekleri',
      subtitle: 'Başkalarından dosya toplayın',
      color: '#06b6d4',
      onPress: () => (navigation as any).navigate('FileRequests'),
    },
    {
      icon: 'send' as const,
      title: 'Hızlı Transfer',
      subtitle: 'Dosya gönder ve al',
      color: colors.primary,
      onPress: () => navigation.navigate('QuickTransfer'),
    },
    {
      icon: 'people' as const,
      title: 'Ekip Yönetimi',
      subtitle: 'Ekip üyelerini yönet',
      color: colors.success,
      onPress: () => navigation.navigate('Team'),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
      <LinearGradient
        colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Daha Fazla</Text>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Storage Card - Yuvarlak Grafik */}
          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <Ionicons name="server" size={20} color={colors.primary} />
              <Text style={styles.storageTitle}>Depolama Durumu</Text>
            </View>

            <View style={styles.storageContent}>
              {/* Yuvarlak Grafik */}
              <View style={styles.circleChartContainer}>
                <Svg width={140} height={140}>
                  {/* Arka plan çemberi */}
                  <Circle
                    cx={70}
                    cy={70}
                    r={60}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={12}
                    fill="transparent"
                  />
                  {/* Kullanılan alan çemberi */}
                  <Circle
                    cx={70}
                    cy={70}
                    r={60}
                    stroke={colors.primary}
                    strokeWidth={12}
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 60}`}
                    strokeDashoffset={2 * Math.PI * 60 * (1 - usagePercent / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90 70 70)"
                  />
                </Svg>
                <View style={styles.circleChartCenter}>
                  <Text style={styles.circleChartPercent}>
                    %{usagePercent < 0.01 
                      ? (usagePercent > 0 ? '<0.1' : '0') 
                      : usagePercent < 1 
                        ? usagePercent.toFixed(2) 
                        : Math.round(usagePercent)}
                  </Text>
                  <Text style={styles.circleChartLabel}>Kullanılıyor</Text>
                </View>
              </View>

              {/* Kullanım Bilgileri */}
              <View style={styles.storageDetails}>
                <View style={styles.storageDetailRow}>
                  <View style={[styles.storageDot, { backgroundColor: colors.primary }]} />
                  <View style={styles.storageDetailInfo}>
                    <Text style={styles.storageDetailLabel}>Kullanılan</Text>
                    <Text style={styles.storageDetailValue}>{formatBytes(storageInfo?.usedBytes || 0)}</Text>
                  </View>
                </View>
                <View style={styles.storageDetailRow}>
                  <View style={[styles.storageDot, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                  <View style={styles.storageDetailInfo}>
                    <Text style={styles.storageDetailLabel}>Boş Alan</Text>
                    <Text style={styles.storageDetailValue}>{formatBytes((storageInfo?.totalBytes || 0) - (storageInfo?.usedBytes || 0))}</Text>
                  </View>
                </View>
                <View style={styles.storageTotalRow}>
                  <Text style={styles.storageTotalLabel}>Toplam</Text>
                  <Text style={styles.storageTotalValue}>{formatBytes(storageInfo?.totalBytes || 0)}</Text>
                </View>
              </View>
            </View>

            {/* Çöp Kutusu Bilgisi */}
            {(storageInfo?.trashBytes || 0) > 0 && (
              <View style={styles.trashInfoRow}>
                <View style={styles.trashInfoLeft}>
                  <Ionicons name="trash-outline" size={16} color={colors.warning} />
                  <Text style={styles.trashInfoLabel}>Çöp Kutusu</Text>
                </View>
                <Text style={styles.trashInfoValue}>{formatBytes(storageInfo?.trashBytes || 0)}</Text>
              </View>
            )}

            {/* Kategori Listesi */}
            {categories.length > 0 && (
              <View style={styles.categoryList}>
                {categories.filter(c => c.size > 0).map((category, index) => (
                  <View key={index} style={styles.categoryItem}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                      <Ionicons name={category.icon} size={16} color={category.color} />
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryCount}>({category.count})</Text>
                    </View>
                    <Text style={styles.categorySize}>{formatBytes(category.size)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Plan Yükseltme Butonu */}
            {usagePercent >= 80 && (
              <TouchableOpacity 
                style={styles.upgradePlanButton}
                onPress={() => {
                  // Plan değişikliği sayfasına yönlendir
                  alert('Plan değişikliği için web sitesini ziyaret ediniz.');
                }}
              >
                <LinearGradient
                  colors={usagePercent >= 95 ? ['#ef4444', '#f97316'] : ['#8b5cf6', '#6366f1']}
                  style={styles.upgradePlanGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons 
                    name={usagePercent >= 95 ? "warning" : "arrow-up-circle"} 
                    size={18} 
                    color="#fff" 
                  />
                  <Text style={styles.upgradePlanText}>
                    {usagePercent >= 95 ? 'Depolama Dolu! Planı Yükselt' : 'Daha Fazla Alan İçin Planı Yükselt'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Menu Items */}
          <View style={styles.menuContainer}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <View style={styles.menuInfo}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* App Info */}
          <View style={styles.appInfo}>
            <LinearGradient
              colors={gradients.secondary as [string, string]}
              style={styles.appLogo}
            >
              <Text style={styles.appLogoText}>☁️</Text>
            </LinearGradient>
            <Text style={styles.appName}>CloudyOne</Text>
            <Text style={styles.appVersion}>Versiyon 1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDarker,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  storageCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  storageTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  storageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  circleChartContainer: {
    width: 140,
    height: 140,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleChartCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  circleChartPercent: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  circleChartLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  storageDetails: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  storageDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  storageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  storageDetailInfo: {
    flex: 1,
  },
  storageDetailLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  storageDetailValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  storageTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  storageTotalLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  storageTotalValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  trashInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trashInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trashInfoLabel: {
    fontSize: fontSize.sm,
    color: colors.warning,
  },
  trashInfoValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.warning,
  },
  categoryList: {
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  categoryCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  categorySize: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  upgradePlanButton: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  upgradePlanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  upgradePlanText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  menuContainer: {
    marginBottom: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  menuTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  appLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  appLogoText: {
    fontSize: 28,
  },
  appName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  appVersion: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

export default MoreScreen;
