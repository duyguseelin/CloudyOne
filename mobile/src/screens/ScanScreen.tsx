import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { colors, borderRadius, fontSize, spacing } from '../constants/theme';
import { encryptAndUploadFileV3, getMasterKey, hasMasterKey } from '../crypto';
import { API_BASE_URL } from '../constants/config';
import { storage } from '../utils/storage';

interface ScannedDocument {
  uri: string;
  name: string;
}

const ScanScreen: React.FC = () => {
  const navigation = useNavigation();
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Kameradan fotoğraf çek
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Kamera izni verilmedi');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        setScannedDocuments(prev => [...prev, {
          uri: result.assets[0].uri,
          name: `Tarama_${timestamp}`,
        }]);
      }
    } catch (error) {
      console.error('Kamera hatası:', error);
      Alert.alert('Hata', 'Fotoğraf çekilemedi');
    }
  };

  // Galeriden seç
  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Galeri izni verilmedi');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newDocs = result.assets.map((asset, index) => {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          return {
            uri: asset.uri,
            name: `Tarama_${timestamp}_${index + 1}`,
          };
        });
        setScannedDocuments(prev => [...prev, ...newDocs]);
      }
    } catch (error) {
      console.error('Galeri hatası:', error);
      Alert.alert('Hata', 'Resim seçilemedi');
    }
  };

  // Belgeyi kaldır
  const removeDocument = (index: number) => {
    Alert.alert(
      'Belgeyi Kaldır',
      'Bu belgeyi listeden kaldırmak istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            setScannedDocuments(prev => prev.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  // İsim düzenle
  const openRenameModal = (index: number) => {
    setSelectedIndex(index);
    setDocumentName(scannedDocuments[index].name);
    setShowNameModal(true);
  };

  const saveDocumentName = () => {
    if (selectedIndex !== null && documentName.trim()) {
      setScannedDocuments(prev => prev.map((doc, i) => 
        i === selectedIndex ? { ...doc, name: documentName.trim() } : doc
      ));
    }
    setShowNameModal(false);
    setDocumentName('');
    setSelectedIndex(null);
  };

  // Tüm belgeleri yükle
  const uploadAllDocuments = async () => {
    if (scannedDocuments.length === 0) {
      Alert.alert('Uyarı', 'Yüklenecek belge yok');
      return;
    }

    // Master key kontrolü
    if (!hasMasterKey()) {
      Alert.alert('Uyarı', 'Güvenlik anahtarı bulunamadı. Lütfen yeniden giriş yapın.');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    let versionCount = 0;

    const masterKey = getMasterKey();
    const token = await storage.getAccessToken();
    
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı');
      setUploading(false);
      return;
    }

    for (const doc of scannedDocuments) {
      try {
        // V3 Envelope encryption ile yükle
        const response = await encryptAndUploadFileV3(
          doc.uri,
          `${doc.name}.jpg`,
          'image/jpeg',
          masterKey,
          token,
          API_BASE_URL
        );
        successCount++;
        
        // Sürüm güncellemesi varsa say
        if (response.isNewVersion) {
          versionCount++;
        }
      } catch (error) {
        console.error('Yükleme hatası:', error);
        failCount++;
      }
    }

    setUploading(false);

    if (failCount === 0) {
      let message = '';
      if (versionCount > 0 && versionCount < successCount) {
        message = `${successCount - versionCount} yeni belge, ${versionCount} sürüm güncellendi`;
      } else if (versionCount === successCount && versionCount > 0) {
        message = `${versionCount} belge sürüm olarak güncellendi`;
      } else {
        message = `${successCount} belge başarıyla yüklendi`;
      }
      
      Alert.alert(
        'Başarılı',
        message,
        [{ text: 'Tamam', onPress: () => {
          setScannedDocuments([]);
          navigation.goBack();
        }}]
      );
    } else {
      Alert.alert(
        'Kısmi Başarı',
        `${successCount} belge yüklendi, ${failCount} belge yüklenemedi`
      );
    }
  };

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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Belge Tara</Text>
          {scannedDocuments.length > 0 && (
            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={uploadAllDocuments}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="cloud-upload" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          )}
          {scannedDocuments.length === 0 && <View style={{ width: 44 }} />}
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="scan" size={32} color={colors.primary} />
            </View>
            <Text style={styles.infoTitle}>Belge Tarayıcı</Text>
            <Text style={styles.infoText}>
              Kameranızı kullanarak belge, makbuz, fatura veya notlarınızı tarayın ve doğrudan buluta kaydedin.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
              <LinearGradient
                colors={['#8b5cf6', '#6366f1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="camera" size={28} color="#fff" />
                <Text style={styles.actionButtonText}>Fotoğraf Çek</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={pickFromGallery}>
              <LinearGradient
                colors={['#06b6d4', '#0891b2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="images" size={28} color="#fff" />
                <Text style={styles.actionButtonText}>Galeriden Seç</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Scanned Documents */}
          {scannedDocuments.length > 0 && (
            <View style={styles.documentsSection}>
              <Text style={styles.sectionTitle}>
                Taranan Belgeler ({scannedDocuments.length})
              </Text>
              
              {scannedDocuments.map((doc, index) => (
                <View key={index} style={styles.documentCard}>
                  <Image source={{ uri: doc.uri }} style={styles.documentThumbnail} />
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text style={styles.documentMeta}>JPEG Görsel</Text>
                  </View>
                  <View style={styles.documentActions}>
                    <TouchableOpacity 
                      style={styles.documentActionBtn}
                      onPress={() => openRenameModal(index)}
                    >
                      <Ionicons name="pencil" size={18} color={colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.documentActionBtn}
                      onPress={() => removeDocument(index)}
                    >
                      <Ionicons name="trash" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Upload Button */}
              <TouchableOpacity 
                style={styles.uploadAllButton}
                onPress={uploadAllDocuments}
                disabled={uploading}
              >
                <LinearGradient
                  colors={['#6366f1', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.uploadAllGradient}
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={22} color="#fff" />
                      <Text style={styles.uploadAllText}>
                        Tümünü Yükle ({scannedDocuments.length} belge)
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 İpuçları</Text>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.tipText}>İyi aydınlatılmış ortamda çekin</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.tipText}>Belgeyi düz bir yüzeye koyun</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.tipText}>Kamerayı belgeye paralel tutun</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Rename Modal */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Belge Adı</Text>
            <TextInput
              style={styles.modalInput}
              value={documentName}
              onChangeText={setDocumentName}
              placeholder="Belge adını girin"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={saveDocumentName}
              >
                <Text style={styles.modalSaveText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  uploadButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  infoTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  documentsSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  documentThumbnail: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bgDark,
  },
  documentInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  documentName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  documentMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  documentActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  documentActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadAllButton: {
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  uploadAllGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  uploadAllText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  modalInput: {
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalSaveButton: {
    backgroundColor: colors.primary,
  },
  modalSaveText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ScanScreen;
