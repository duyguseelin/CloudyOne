import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { Buffer } from 'buffer';

// Buffer'ı global olarak tanımla (React Native için gerekli)
global.Buffer = Buffer;

export default function App() {
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    // Deep link dinleyicisi
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      console.log('📲 Deep link received:', url);
      
      // Share link'lerini işle: cloudyone://share/TOKEN#dek=...
      // veya https://cloudyone.app/share/TOKEN#dek=...
      if (url.includes('/share/')) {
        const urlParts = url.split('/share/');
        if (urlParts.length > 1) {
          const tokenWithFragment = urlParts[1];
          const [token, fragmentPart] = tokenWithFragment.split('#dek=');
          
          console.log('📲 Share token:', token);
          console.log('📲 DEK fragment:', fragmentPart ? 'present' : 'missing');
          
          // Navigation ref hazırsa yönlendir
          if (navigationRef.current) {
            navigationRef.current.navigate('ShareView', {
              token: token,
              dekFragment: fragmentPart || undefined,
            });
          }
        }
      }
    };

    // İlk açılışta URL varsa işle
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Uygulama açıkken gelen linkleri dinle
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator ref={navigationRef} />
    </SafeAreaProvider>
  );
}
