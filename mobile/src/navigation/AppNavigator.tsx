import React, { useEffect, useState, forwardRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import FilesScreen from '../screens/FilesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MoreScreen from '../screens/MoreScreen';
import UserInfoScreen from '../screens/UserInfoScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SharedFilesScreen from '../screens/SharedFilesScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import TwoFactorScreen from '../screens/TwoFactorScreen';
import HiddenFilesScreen from '../screens/HiddenFilesScreen';
import QuickTransferScreen from '../screens/QuickTransferScreen';
import TeamScreen from '../screens/TeamScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ActivitiesScreen from '../screens/ActivitiesScreen';
import TrashScreen from '../screens/TrashScreen';
import FilePreviewScreen from '../screens/FilePreviewScreen';
import FileViewerScreen from '../screens/FileViewerScreen';
import GalleryScreen from '../screens/GalleryScreen';
import FileRequestsScreen from '../screens/FileRequestsScreen';
import FileRequestUploadScreen from '../screens/FileRequestUploadScreen';
import ScanScreen from '../screens/ScanScreen';
import ShareViewScreen from '../screens/ShareViewScreen';
import TransferViewScreen from '../screens/TransferViewScreen';
import FileDetailsScreen from '../screens/FileDetailsScreen';
import { storage } from '../utils/storage';
import { api } from '../services/api';
import { colors } from '../constants/theme';
import { hasMasterKey, initializeMasterKey } from '../crypto';
import * as Linking from 'expo-linking';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const [unreadCount, setUnreadCount] = useState(0);

  // Uygulama açıldığında ve belirli aralıklarla okunmamış etkinlik sayısını kontrol et
  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Her 30 saniyede bir kontrol et
    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const response = await api.getActivities();
      setUnreadCount(response?.unreadCount || 0);
    } catch (error) {
      // Sessizce hata yönetimi
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgDark,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 85,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Files') {
            iconName = focused ? 'folder' : 'folder-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'More') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Activities') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          }

          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Files" 
        component={FilesScreen} 
        options={{ tabBarLabel: 'Dosyalar' }}
      />
      <Tab.Screen 
        name="More" 
        component={MoreScreen} 
        options={{ tabBarLabel: 'Daha' }}
      />
      <Tab.Screen 
        name="Activities" 
        options={{ 
          tabBarLabel: 'Etkinlikler',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.error,
            fontSize: 10,
            fontWeight: '700',
            minWidth: 18,
            height: 18,
          }
        }}
      >
        {() => <ActivitiesScreen onActivitiesRead={() => setUnreadCount(0)} />}
      </Tab.Screen>
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ tabBarLabel: 'Profil' }}
      />
    </Tab.Navigator>
  );
}

const AppNavigator = forwardRef<NavigationContainerRef<any>, {}>((props, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Otomatik giriş yapma - her zaman Login ekranından başla
      await storage.clearAccessToken();
      setIsAuthenticated(false);
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgDark }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Deep link yapılandırması
  const linking = {
    prefixes: [
      Linking.createURL('/'),
      'cloudyone://',
      'https://cloudyone.app',
      'http://localhost:3000',
    ],
    config: {
      screens: {
        ShareView: {
          path: 'share/:token',
          parse: {
            token: (token: string) => token,
          },
        },
        TransferView: {
          path: 'transfer/:token',
          parse: {
            token: (token: string) => token,
          },
        },
        Main: 'main',
        Login: 'login',
      },
    },
  };

  return (
    <NavigationContainer ref={ref} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgDark },
        }}
        initialRouteName={isAuthenticated ? 'Main' : 'Login'}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="UserInfo" component={UserInfoScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="SharedFiles" component={SharedFilesScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
        <Stack.Screen name="HiddenFiles" component={HiddenFilesScreen} />
        <Stack.Screen name="QuickTransfer" component={QuickTransferScreen} />
        <Stack.Screen name="Team" component={TeamScreen} />
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="Activities" component={ActivitiesScreen} />
        <Stack.Screen name="Trash" component={TrashScreen} />
        <Stack.Screen name="FilePreview" component={FilePreviewScreen} />
        <Stack.Screen name="FileViewer" component={FileViewerScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
        <Stack.Screen name="FileRequests" component={FileRequestsScreen} />
        <Stack.Screen name="FileRequestUpload" component={FileRequestUploadScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="ShareView" component={ShareViewScreen} />
        <Stack.Screen name="TransferView" component={TransferViewScreen} />
        <Stack.Screen name="FileDetails" component={FileDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
});

export default AppNavigator;
