import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import mobileAds, { AppOpenAd, AdEventType } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from './src/services/adConfig';
import {
  getStoredUser,
  checkIsPremium,
  subscribeAuthChange,
} from './src/services/authService';
import {
  setupNotificationChannel,
  requestNotificationPermission,
  setupFirebaseRemoteNotifications,
} from './src/services/notificationManager';
import { checkForAppUpdates } from './src/services/updateChecker';

import HomeScreen from './src/screens/HomeScreen';
import DownloadScreen from './src/screens/DownloadScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';

// Keep native splash screen visible while app checks persistent authentication state
SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F1F5F9', // light slate background matching our pastel screens
    card: '#FFFFFF',
    border: '#E2E8F0',
    primary: '#3B82F6',
    text: '#1E293B',
  },
};

const ICONS = {
  Home: { active: 'home', inactive: 'home-outline' },
  Downloads: { active: 'download', inactive: 'download-outline' },
  History: { active: 'time', inactive: 'time-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
};

function AppTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#64748B',
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 0.7,
        tabBarButton: (props) => (
          <TouchableOpacity
            {...props}
            activeOpacity={0.7}
            style={[props.style, { overflow: 'hidden' }]}
          />
        ),
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          height: 54 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = ICONS[route.name];
          return (
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Downloads" component={DownloadScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // 1. Initial Auth Check with Splash Screen
  useEffect(() => {
    let isMounted = true;

    async function checkAuthOnLaunch() {
      try {
        const stored = await getStoredUser();
        if (isMounted) {
          if (stored && stored.email) {
            setCurrentUser(stored);
          } else {
            setCurrentUser(null);
          }
        }
      } catch (err) {
        console.log('[App] Auth init error:', err);
      } finally {
        if (isMounted) {
          setIsAuthReady(true);
          // Hide native splash screen smoothly once auth check is complete
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    }

    checkAuthOnLaunch();

    // Subscribe to auth changes (login / sign out) across all screens
    const unsubscribeAuth = subscribeAuthChange((user) => {
      if (isMounted) {
        setCurrentUser(user || null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  // 2. Services Initialization (Notifications & App Open Ads)
  useEffect(() => {
    mobileAds()
      .initialize()
      .then((adapterStatuses) => {
        console.log('[AdMob] SDK initialized successfully:', adapterStatuses);
      })
      .catch((err) => {
        console.log('[AdMob] SDK init error:', err);
      });

    let appOpenAd = null;
    let unsubLoaded = null;
    let unsubError = null;

    const loadAppOpenAd = async () => {
      try {
        const user = await getStoredUser();
        if (!user || !user.email) return; // Do not show open ad on login screen
        const isPremium = checkIsPremium(user);
        if (isPremium) {
          console.log('[AdMob] VIP User - Skipping App Open Ad');
          return;
        }

        appOpenAd = AppOpenAd.createForAdRequest(AD_UNIT_IDS.APP_OPEN, {});

        unsubLoaded = appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
          console.log('[AdMob] App Open Ad loaded successfully. Showing now...');
          appOpenAd.show().catch((err) => {
            console.log('[AdMob] App Open Ad show error:', err.message);
          });
        });

        unsubError = appOpenAd.addAdEventListener(AdEventType.ERROR, (error) => {
          console.log('[AdMob] App Open Ad failed to load:', error.message);
        });

        appOpenAd.load();
      } catch (err) {
        console.log('[AdMob] App Open Ad init exception:', err.message);
      }
    };

    const initNotifications = async () => {
      try {
        await setupNotificationChannel();
        await requestNotificationPermission();
        await setupFirebaseRemoteNotifications();
      } catch (err) {
        console.log('[Notifications] Setup error:', err.message);
      }
    };

    initNotifications();
    const timer = setTimeout(() => {
      checkForAppUpdates();
      loadAppOpenAd();
    }, 1200);

    return () => {
      clearTimeout(timer);
      if (unsubLoaded) unsubLoaded();
      if (unsubError) unsubError();
    };
  }, []);

  // While splash screen is checking stored auth, render blank background
  if (!isAuthReady) {
    return <View style={styles.splashPlaceholder} />;
  }

  // Mandatory Login Gate: If no logged in user, show LoginScreen
  if (!currentUser || !currentUser.email) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />
      </SafeAreaProvider>
    );
  }

  // User is authenticated: Render main app tabs
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="dark" />
        <AppTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashPlaceholder: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
