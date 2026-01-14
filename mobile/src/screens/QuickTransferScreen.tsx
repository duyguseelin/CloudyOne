import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api, API_BASE } from '../services/api';
import { getToken } from '../utils/storage';
import { colors, gradients, borderRadius, fontSize, spacing } from '../constants/theme';

interface TransferFile {
  name: string;
  uri: string;
  size: number;
  type?: string;
}

interface TransferHistoryItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  link: string;
  shareToken: string;
  expiresAt: string;
  isExpired: boolean;
  downloadLimit: number | null;
  downloadCount: number;
  hasPassword: boolean;
  sendMethod: 'link' | 'email';
  recipientEmail: string | null;
  message: string | null;
  createdAt: string;
}

const QuickTransferScreen: React.FC = () => {
  const navigation = useNavigation();
  const [sendMethod, setSendMethod] = useState<'link' | 'email'>('link');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Paylaşım ayarları
  const [showSettings, setShowSettings] = useState(false);
  const [expiryOption, setExpiryOption] = useState('24h');
  const [customExpiryDate, setCustomExpiryDate] = useState<Date>(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState<number | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [notifyOnDownload, setNotifyOnDownload] = useState(true);
  const [customFileName, setCustomFileName] = useState('');
  
  // Transfer geçmişi
  const [history, setHistory] = useState<TransferHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await (api as any).getTransferHistory();
      setHistory(response?.transfers || []);
    } catch (error) {
      console.error('Transfer geçmişi yüklenemedi:', error);
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  };

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map((asset) => ({
          name: asset.name,
          uri: asset.uri,
          size: asset.size || 0,
          type: asset.mimeType,
        }));
        setFiles([...files, ...newFiles]);
      }
    } catch (error) {
      console.error('Dosya seçme hatası:', error);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getTotalSize = () => {
    return files.reduce((total, file) => total + file.size, 0);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatExpiry = (opt: string): string => {
    switch (opt) {
      case '1h': return '1 saat';
      case '6h': return '6 saat';
      case '24h': return '24 saat';
      case '3d': return '3 gün';
      case '7d': return '7 gün';
      case 'custom': return 'Özel';
      default: return opt;
    }
  };

  const formatCustomDate = (): string => {
    const date = customExpiryDate;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      selectedDate.setHours(customExpiryDate.getHours());
      selectedDate.setMinutes(customExpiryDate.getMinutes());
      setCustomExpiryDate(selectedDate);
      setExpiryOption('custom');
      // iOS'ta saat seçiciyi de göster
      if (Platform.OS === 'ios') {
        setTimeout(() => setShowTimePicker(true), 300);
      }
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(customExpiryDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setCustomExpiryDate(newDate);
    }
  };

  const copyToClipboard = async (text: string, id?: string) => {
    await Clipboard.setStringAsync(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    Alert.alert(
      'Transferi Sil',
      'Bu transferi silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await (api as any).deleteTransfer(id);
              setHistory(prev => prev.filter(t => t.id !== id));
            } catch (error) {
              Alert.alert('Hata', 'Transfer silinemedi');
            }
          }
        }
      ]
    );
  };

  const handleDeleteExpiredTransfers = async () => {
    const expiredCount = history.filter(t => t.isExpired).length;
    if (expiredCount === 0) {
      Alert.alert('Bilgi', 'Süresi dolmuş transfer bulunmuyor');
      return;
    }
    
    Alert.alert(
      'Süresi Dolmuşları Sil',
      `${expiredCount} süresi dolmuş transfer silinecek. Devam etmek istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await (api as any).deleteExpiredTransfers();
              setHistory(prev => prev.filter(t => !t.isExpired));
              Alert.alert('Başarılı', `${expiredCount} süresi dolmuş transfer silindi`);
            } catch (error) {
              Alert.alert('Hata', 'Süresi dolmuş transferler silinemedi');
            }
          }
        }
      ]
    );
  };

  const handleSend = async () => {
    if (files.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir dosya seçin');
      return;
    }

    if (sendMethod === 'email' && !email) {
      Alert.alert('Hata', 'Lütfen alıcı e-posta adresini girin');
      return;
    }

    if (usePassword && !password) {
      Alert.alert('Hata', 'Lütfen bir şifre belirleyin');
      return;
    }

    setLoading(true);
    try {
      const file = files[0]; // İlk dosya
      
      console.log('� Dosya gönderiliyor:', file.name, file.size, 'bytes');
      
      // FormData oluştur - şifreleme yok, TLS güvenliği
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type || 'application/octet-stream',
      } as any);
      
      formData.append('sendMethod', sendMethod);
      
      // Transfer parametreleri
      if (expiryOption === 'custom') {
        formData.append('expiry', customExpiryDate.toISOString());
      } else {
        formData.append('expiry', expiryOption);
      }
      
      if (sendMethod === 'email' && email) {
        formData.append('recipientEmail', email);
      }
      if (message) formData.append('message', message);
      if (downloadLimit) formData.append('downloadLimit', downloadLimit.toString());
      if (usePassword && password) formData.append('password', password);
      if (customFileName.trim()) formData.append('customFileName', customFileName.trim());
      formData.append('notifyOnDownload', notifyOnDownload.toString());

      // HTTPS üzerinden güvenli API çağrısı
      const token = await getToken();
      const response = await fetch(`${API_BASE}/files/quick-transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer oluşturulamadı');
      }
      
      const result = await response.json();
      
      // Transfer linki hazır
      setShareLink(result.link);
      setSent(true);
      loadHistory();
      
      console.log('✅ Transfer başarılı:', result.link);
    } catch (error: any) {
      Alert.alert('Hata', error.message || 'Transfer oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const resetTransfer = () => {
    setFiles([]);
    setSent(false);
    setShareLink('');
    setEmail('');
    setMessage('');
    setCopied(false);
    setExpiryOption('24h');
    setDownloadLimit(null);
    setUsePassword(false);
    setPassword('');
    setNotifyOnDownload(true);
    setShowSettings(false);
    setCustomFileName('');
    setCustomExpiryDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 saat sonra
  };

  const renderHistoryItem = ({ item }: { item: TransferHistoryItem }) => (
    <View style={[styles.historyItem, item.isExpired && styles.historyItemExpired]}>
      <View style={styles.historyItemHeader}>
        <View style={styles.historyFileIcon}>
          <Ionicons 
            name={item.mimeType?.startsWith('image/') ? 'image' : 'document'} 
            size={20} 
            color={item.isExpired ? colors.textMuted : colors.primary} 
          />
        </View>
        <View style={styles.historyItemInfo}>
          <Text style={styles.historyFileName} numberOfLines={1}>{item.fileName}</Text>
          <Text style={styles.historyMeta}>
            {formatFileSize(item.sizeBytes)} • {formatDate(item.createdAt)}
          </Text>
        </View>
        {item.isExpired ? (
          <View style={styles.expiredBadge}>
            <Text style={styles.expiredText}>Süresi Doldu</Text>
          </View>
        ) : (
          <View style={styles.activeBadge}>
            <Text style={styles.activeText}>Aktif</Text>
          </View>
        )}
      </View>
      
      <View style={styles.historyItemDetails}>
        <View style={styles.historyDetailRow}>
          <Ionicons name={item.sendMethod === 'email' ? 'mail' : 'link'} size={14} color={colors.textMuted} />
          <Text style={styles.historyDetailText}>
            {item.sendMethod === 'email' ? item.recipientEmail : 'Link ile paylaşım'}
          </Text>
        </View>
        <View style={styles.historyDetailRow}>
          <Ionicons name="download-outline" size={14} color={colors.textMuted} />
          <Text style={styles.historyDetailText}>
            {item.downloadCount} indirme {item.downloadLimit ? `/ ${item.downloadLimit}` : ''}
          </Text>
        </View>
      </View>
      
      {!item.isExpired && (
        <View style={styles.historyActions}>
          <TouchableOpacity 
            style={styles.historyActionButton}
            onPress={() => copyToClipboard(item.link, item.id)}
          >
            <Ionicons 
              name={copiedId === item.id ? 'checkmark' : 'copy-outline'} 
              size={16} 
              color={copiedId === item.id ? colors.success : colors.primary} 
            />
            <Text style={[styles.historyActionText, copiedId === item.id && { color: colors.success }]}>
              {copiedId === item.id ? 'Kopyalandı' : 'Linki Kopyala'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.historyActionButton, styles.historyDeleteButton]}
            onPress={() => handleDeleteTransfer(item.id)}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (sent) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bgDarker} />
        <LinearGradient
          colors={[colors.bgDarker, colors.bgDark, '#1e1b4b']}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <LinearGradient
                colors={['#10b981', '#059669']}
                style={styles.successGradient}
              >
                <Ionicons name="checkmark-circle" size={64} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.successTitle}>
              {sendMethod === 'email' ? 'Gönderildi!' : 'Hazır!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {sendMethod === 'email' 
                ? `Dosyalarınız ${email} adresine gönderildi`
                : 'Dosyalarınız paylaşıma hazır'}
            </Text>

            {shareLink ? (
              <View style={styles.linkContainer}>
                <TouchableOpacity style={styles.linkBox} onPress={() => copyToClipboard(shareLink)}>
                  <Text style={styles.linkText} numberOfLines={1}>{shareLink}</Text>
                  <Ionicons 
                    name={copied ? 'checkmark' : 'copy'} 
                    size={20} 
                    color={copied ? colors.success : colors.primary} 
                  />
                </TouchableOpacity>
                {copied && (
                  <Text style={styles.copiedText}>Link panoya kopyalandı!</Text>
                )}
              </View>
            ) : null}

            {/* Transfer Bilgileri */}
            <View style={styles.transferInfoBox}>
              <View style={styles.transferInfoRow}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text style={styles.transferInfoText}>
                  Geçerlilik: {expiryOption === 'custom' ? formatCustomDate() : formatExpiry(expiryOption)}
                </Text>
              </View>
              {downloadLimit && (
                <View style={styles.transferInfoRow}>
                  <Ionicons name="download-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.transferInfoText}>İndirme limiti: {downloadLimit} kez</Text>
                </View>
              )}
              {usePassword && (
                <View style={styles.transferInfoRow}>
                  <Ionicons name="lock-closed" size={16} color={colors.primary} />
                  <Text style={styles.transferInfoText}>Şifre korumalı</Text>
                </View>
              )}
            </View>

            <View style={styles.successActions}>
              <TouchableOpacity
                style={styles.newTransferButton}
                onPress={resetTransfer}
              >
                <LinearGradient
                  colors={gradients.primary as [string, string]}
                  style={styles.newTransferButtonGradient}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.newTransferButtonText}>Yeni Transfer</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.doneButtonText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
          <Text style={styles.headerTitle}>Hızlı Transfer</Text>
          <TouchableOpacity 
            onPress={() => setShowHistory(!showHistory)} 
            style={[styles.historyButton, showHistory && styles.historyButtonActive]}
          >
            <Ionicons name="time-outline" size={22} color={showHistory ? colors.primary : colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {showHistory ? (
          /* Transfer Geçmişi */
          <View style={styles.historyContainer}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>Transfer Geçmişi</Text>
                <Text style={styles.historyCount}>{history.length} transfer</Text>
              </View>
              {/* Süresi Dolmuşları Temizle butonu */}
              {history.filter(t => t.isExpired).length > 0 && (
                <TouchableOpacity
                  style={styles.clearExpiredButton}
                  onPress={handleDeleteExpiredTransfers}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={styles.clearExpiredText}>
                    Süresi Dolmuş ({history.filter(t => t.isExpired).length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
            {historyLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : history.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>Henüz transfer yok</Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={renderHistoryItem}
                contentContainerStyle={styles.historyList}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); loadHistory(); }}
                    tintColor={colors.primary}
                  />
                }
              />
            )}
          </View>
        ) : (
          /* Transfer Formu */
          <>
            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Gönderim Yöntemi */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gönderim Yöntemi</Text>
                <View style={styles.methodSelector}>
                  <TouchableOpacity
                    style={[styles.methodOption, sendMethod === 'link' && styles.methodOptionActive]}
                    onPress={() => setSendMethod('link')}
                  >
                    <Ionicons 
                      name="link" 
                      size={20} 
                      color={sendMethod === 'link' ? colors.primary : colors.textMuted} 
                    />
                    <Text style={[styles.methodText, sendMethod === 'link' && styles.methodTextActive]}>
                      Link ile
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.methodOption, sendMethod === 'email' && styles.methodOptionActive]}
                    onPress={() => setSendMethod('email')}
                  >
                    <Ionicons 
                      name="mail" 
                      size={20} 
                      color={sendMethod === 'email' ? colors.primary : colors.textMuted} 
                    />
                    <Text style={[styles.methodText, sendMethod === 'email' && styles.methodTextActive]}>
                      E-posta ile
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Files Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Dosyalar</Text>
                
                <TouchableOpacity 
                  style={styles.addFileButton}
                  onPress={handlePickFiles}
                >
                  <LinearGradient
                    colors={[`${colors.primary}20`, `${colors.secondary}20`]}
                    style={styles.addFileGradient}
                  >
                    <View style={styles.addFileIcon}>
                      <Ionicons name="add-circle" size={32} color={colors.primary} />
                    </View>
                    <Text style={styles.addFileText}>Dosya Seç</Text>
                    <Text style={styles.addFileHint}>veya sürükle bırak</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {files.length > 0 && (
                  <View style={styles.filesList}>
                    {files.map((file, index) => (
                      <View key={index} style={styles.fileItem}>
                        <View style={styles.fileIcon}>
                          <Ionicons name="document" size={24} color={colors.primary} />
                        </View>
                        <View style={styles.fileInfo}>
                          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                          <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.removeButton}
                          onPress={() => handleRemoveFile(index)}
                        >
                          <Ionicons name="close-circle" size={24} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={styles.totalSize}>
                      <Text style={styles.totalSizeLabel}>Toplam:</Text>
                      <Text style={styles.totalSizeValue}>{formatFileSize(getTotalSize())}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Recipient Section - Sadece E-posta seçiliyse */}
              {sendMethod === 'email' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Alıcı</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder="Email adresi"
                      placeholderTextColor={colors.textMuted}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}

              {/* Message Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Mesaj (Opsiyonel)</Text>
                <View style={[styles.inputWrapper, styles.messageWrapper]}>
                  <TextInput
                    style={[styles.input, styles.messageInput]}
                    placeholder="Alıcıya bir mesaj yazın..."
                    placeholderTextColor={colors.textMuted}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Transfer Ayarları Toggle */}
              <TouchableOpacity
                style={styles.settingsToggle}
                onPress={() => setShowSettings(!showSettings)}
              >
                <View style={styles.settingsToggleLeft}>
                  <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.settingsToggleText}>Transfer Ayarları</Text>
                </View>
                <Ionicons 
                  name={showSettings ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color={colors.textMuted} 
                />
              </TouchableOpacity>

              {/* Transfer Ayarları Panel */}
              {showSettings && (
                <View style={styles.settingsPanel}>
                  {/* Görüntülenecek Dosya Adı */}
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Görüntülenecek Dosya Adı (isteğe bağlı)</Text>
                    <TextInput
                      style={styles.customFileNameInput}
                      placeholder={files.length > 0 ? files[0].name : 'Dosya adı'}
                      placeholderTextColor={colors.textMuted}
                      value={customFileName}
                      onChangeText={setCustomFileName}
                    />
                    <Text style={styles.customFileNameHint}>
                      Boş bırakılırsa orijinal dosya adı kullanılır
                    </Text>
                  </View>

                  {/* Son Geçerlilik Tarihi */}
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>Son Geçerlilik Tarihi</Text>
                    <View style={styles.expiryOptions}>
                      {['1h', '6h', '24h', '3d', '7d'].map((opt) => (
                        <TouchableOpacity
                          key={opt}
                          style={[
                            styles.expiryOption,
                            expiryOption === opt && styles.expiryOptionActive
                          ]}
                          onPress={() => setExpiryOption(opt)}
                        >
                          <Text style={[
                            styles.expiryOptionText,
                            expiryOption === opt && styles.expiryOptionTextActive
                          ]}>
                            {formatExpiry(opt)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    {/* Özel Tarih Seçici */}
                    <View style={styles.customDateRow}>
                      <Text style={styles.customDateLabel}>veya</Text>
                      <TouchableOpacity
                        style={[
                          styles.customDateButton,
                          expiryOption === 'custom' && styles.customDateButtonActive
                        ]}
                        onPress={() => {
                          setExpiryOption('custom');
                          setShowDatePicker(true);
                        }}
                      >
                        <Ionicons name="calendar-outline" size={16} color={expiryOption === 'custom' ? '#fff' : colors.text} />
                        <Text style={[
                          styles.customDateButtonText,
                          expiryOption === 'custom' && styles.customDateButtonTextActive
                        ]}>
                          {formatCustomDate()}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Date Picker */}
                    {showDatePicker && (
                      <DateTimePicker
                        value={customExpiryDate}
                        mode="date"
                        display="default"
                        minimumDate={new Date()}
                        onChange={handleDateChange}
                        themeVariant="dark"
                        textColor="#ffffff"
                      />
                    )}

                    {/* Time Picker */}
                    {showTimePicker && (
                      <DateTimePicker
                        value={customExpiryDate}
                        mode="time"
                        display="default"
                        onChange={handleTimeChange}
                        themeVariant="dark"
                        textColor="#ffffff"
                      />
                    )}
                  </View>

                  {/* İndirme Limiti */}
                  <View style={styles.settingItem}>
                    <Text style={styles.settingLabel}>İndirme Limiti (isteğe bağlı)</Text>
                    <View style={styles.downloadLimitWrapper}>
                      <TextInput
                        style={styles.downloadLimitInput}
                        placeholder="Sınırsız"
                        placeholderTextColor={colors.textMuted}
                        value={downloadLimit?.toString() || ''}
                        onChangeText={(val) => setDownloadLimit(val ? parseInt(val) : null)}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.downloadLimitHint}>kez</Text>
                    </View>
                  </View>

                  {/* Şifre Koruması */}
                  <View style={styles.settingItem}>
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setUsePassword(!usePassword)}
                    >
                      <View style={[
                        styles.checkbox,
                        usePassword && styles.checkboxActive
                      ]}>
                        {usePassword && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={styles.passwordToggleText}>Şifre ile koru</Text>
                    </TouchableOpacity>
                    
                    {usePassword && (
                      <View style={styles.passwordInputWrapper}>
                        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                        <TextInput
                          style={styles.passwordInput}
                          placeholder="Şifre belirleyin"
                          placeholderTextColor={colors.textMuted}
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                        />
                      </View>
                    )}
                  </View>

                  {/* Bildirim Seçeneği */}
                  <View style={styles.settingItem}>
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setNotifyOnDownload(!notifyOnDownload)}
                    >
                      <View style={[
                        styles.checkbox,
                        notifyOnDownload && styles.checkboxActive
                      ]}>
                        {notifyOnDownload && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={styles.passwordToggleText}>Dosya indirildiğinde beni bilgilendir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Send Button */}
            <View style={styles.bottomSection}>
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSend}
                disabled={loading || files.length === 0}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={files.length === 0 ? [colors.textMuted, colors.textMuted] : gradients.secondary as [string, string]}
                  style={[styles.sendButtonGradient, loading && styles.buttonDisabled]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={sendMethod === 'email' ? 'send' : 'link'} size={20} color="#fff" />
                      <Text style={styles.sendButtonText}>
                        {sendMethod === 'email' ? 'Gönder' : 'Link Oluştur'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyButtonActive: {
    backgroundColor: `${colors.primary}20`,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  methodOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodOptionActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  methodText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textMuted,
  },
  methodTextActive: {
    color: colors.primary,
  },
  addFileButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  addFileGradient: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addFileIcon: {
    marginBottom: spacing.sm,
  },
  addFileText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addFileHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  filesList: {
    marginTop: spacing.md,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  fileName: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  fileSize: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeButton: {
    padding: spacing.xs,
  },
  totalSize: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  totalSizeLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  totalSizeValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  messageWrapper: {
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  messageInput: {
    minHeight: 80,
    paddingTop: spacing.sm,
  },
  bottomSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgDarker,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sendButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  sendButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  // Success Screen
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successIcon: {
    marginBottom: spacing.lg,
  },
  successGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  linkContainer: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  copiedText: {
    fontSize: fontSize.sm,
    color: colors.success,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  successActions: {
    width: '100%',
    gap: spacing.md,
  },
  newTransferButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  newTransferButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  newTransferButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  doneButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // History
  historyContainer: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  historyCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  clearExpiredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  clearExpiredText: {
    fontSize: fontSize.xs,
    color: colors.error,
    fontWeight: '500',
  },
  historyList: {
    padding: spacing.lg,
  },
  historyItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyItemExpired: {
    opacity: 0.6,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  historyFileIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  historyItemInfo: {
    flex: 1,
  },
  historyFileName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  historyMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  expiredBadge: {
    backgroundColor: `${colors.error}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  expiredText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.error,
  },
  activeBadge: {
    backgroundColor: `${colors.success}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  activeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.success,
  },
  historyItemDetails: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  historyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  historyDetailText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  historyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.primary}15`,
    borderRadius: borderRadius.md,
  },
  historyDeleteButton: {
    flex: 0,
    paddingHorizontal: spacing.md,
    backgroundColor: `${colors.error}15`,
  },
  historyActionText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  // Transfer Ayarları Stilleri
  settingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsToggleText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: '500',
  },
  settingsPanel: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingItem: {
    marginBottom: spacing.lg,
  },
  settingLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  expiryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  expiryOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.textMuted}20`,
    borderRadius: borderRadius.md,
  },
  expiryOptionActive: {
    backgroundColor: colors.primary,
  },
  expiryOptionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textMuted,
  },
  expiryOptionTextActive: {
    color: '#fff',
  },
  downloadLimitWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customFileNameInput: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  customFileNameHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  downloadLimitInput: {
    width: 100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  downloadLimitHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  passwordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  passwordToggleText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  // Transfer Bilgi Kutusu (Success Screen)
  transferInfoBox: {
    backgroundColor: `${colors.surface}80`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  transferInfoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customDateLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  customDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customDateButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  customDateButtonText: {
    fontSize: fontSize.sm,
    color: '#fff',
  },
  customDateButtonTextActive: {
    color: '#fff',
  },
});

export default QuickTransferScreen;
