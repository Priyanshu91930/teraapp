import React, { useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getStoredUser, checkIsPremium, syncGoogleUser, logoutUser } from '../services/authService';
import SubscriptionModal from '../components/SubscriptionModal';
import NotificationCenterModal from '../components/NotificationCenterModal';
import AnnouncementsModal from '../components/AnnouncementsModal';
import {
  getInAppNotifications,
  getUnreadNotificationCount,
  markNotificationsAsRead,
  subscribeNotificationUpdates,
} from '../services/notificationStorage';
import { openDirectPlayStorePage } from '../services/storeReview';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';

GoogleSignin.configure({
  webClientId: '127142107297-eqjrnnvko66pn6014ndesqimqbtof3ll.apps.googleusercontent.com',
  offlineAccess: false,
});

export function getExpiryDetails(user) {
  const isPremium = checkIsPremium(user);
  if (!isPremium) {
    return {
      isPremium: false,
      daysLeft: 0,
      formattedDate: 'N/A',
      dayOfWeek: 'N/A',
      fullDayName: 'N/A',
      fullDateStr: 'No Active Plan',
    };
  }

  let expiryDate;
  if (user?.premiumExpiresAt) {
    expiryDate = new Date(user.premiumExpiresAt);
    if (isNaN(expiryDate.getTime())) {
      expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }
  } else {
    expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }

  const diffMs = expiryDate.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const dayOfWeek = expiryDate.toLocaleDateString('en-US', { weekday: 'short' });
  const fullDayName = expiryDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = expiryDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  return {
    isPremium: true,
    daysLeft,
    dayOfWeek,
    fullDayName,
    formattedDate: dateStr,
    fullDateStr: `${fullDayName}, ${dateStr}`,
  };
}

function AnimatedExpiryHeaderBadge({ expiryDetails }) {
  if (!expiryDetails.isPremium) return null;
  return (
    <View style={styles.expiryHeaderPill}>
      <Ionicons name="calendar-outline" size={13} color="#059669" />
      <Text style={styles.expiryHeaderPillText}>Expires {expiryDetails.dayOfWeek}, {expiryDetails.formattedDate}</Text>
    </View>
  );
}

function AnimatedManageExpiryCard({ expiryDetails, isLoggedIn, user }) {
  const glowAnim = React.useRef(new Animated.Value(0.4)).current;
  const badgePulse = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );

    glowLoop.start();
    pulseLoop.start();

    return () => {
      glowLoop.stop();
      pulseLoop.stop();
    };
  }, [glowAnim, badgePulse]);

  return (
    <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.manageStatusCard}>
      <View style={styles.manageStatusBadgeRow}>
        <View style={styles.manageStatusBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          <Text style={styles.manageStatusBadgeText}>
            {expiryDetails.isPremium ? '★ VIP MEMBERSHIP ACTIVE' : 'FREE USER'}
          </Text>
        </View>
        {expiryDetails.isPremium && (
          <View style={styles.livePulseContainer}>
            <Animated.View style={[styles.livePulseDot, { opacity: glowAnim }]} />
            <Text style={styles.livePulseText}>ACTIVE</Text>
          </View>
        )}
      </View>

      <Text style={styles.managePlanName}>
        {expiryDetails.isPremium ? `${user?.plan ? user.plan.toUpperCase() : 'YEARLY'} VIP PLAN` : 'No Active Plan'}
      </Text>

      {expiryDetails.isPremium ? (
        <View style={styles.expiryDetailCardBox}>
          <View style={styles.expiryDetailRow}>
            <Ionicons name="calendar-outline" size={16} color="#38BDF8" />
            <Text style={styles.expiryDetailDateLabel}>Expires On:</Text>
            <Text style={styles.expiryDetailDateValue}>
              {expiryDetails.fullDateStr}
            </Text>
          </View>

          <View style={styles.expiryDaysBannerRow}>
            <Text style={styles.expiryDaysTitle}>Days Remaining:</Text>
            <Animated.View style={[styles.daysLeftPill, { transform: [{ scale: badgePulse }] }]}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.daysLeftPillGradient}>
                <Ionicons name="flame" size={13} color="#FFFFFF" />
                <Text style={styles.daysLeftPillText}>{expiryDetails.daysLeft} Days Left</Text>
              </LinearGradient>
            </Animated.View>
          </View>
        </View>
      ) : (
        <Text style={styles.manageExpiryText}>Upgrade to unlock all premium features</Text>
      )}

      <Text style={styles.manageEmailText}>Linked Account: {isLoggedIn ? user.email : 'Not Logged In'}</Text>
    </LinearGradient>
  );
}

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loggingIn, setLoggingIn] = useState(false);
  const [bannerAdError, setBannerAdError] = useState(false);

  const loadNotifications = useCallback(async () => {
    const list = await getInAppNotifications();
    const unread = await getUnreadNotificationCount();
    setNotifications(list);
    setUnreadCount(unread);
  }, []);

  useEffect(() => {
    loadNotifications();
    const unsubscribe = subscribeNotificationUpdates(loadNotifications);
    return () => unsubscribe();
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      getStoredUser().then((u) => {
        setUser(u || null);
      });
      loadNotifications();
    }, [loadNotifications])
  );

  const handleOpenNotifications = async () => {
    setShowNotificationModal(true);
    await markNotificationsAsRead();
    setUnreadCount(0);
  };

  const isLoggedIn = !!(user && user.email);
  const isPremiumUser = checkIsPremium(user);
  const expiryDetails = getExpiryDetails(user);

  async function handleOneTapGoogleSignIn() {
    setLoggingIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      const userInfo = response.data ? response.data : response;
      const userObj = userInfo.user || userInfo;

      if (userObj && userObj.email) {
        const syncRes = await syncGoogleUser(
          userObj.email,
          userObj.name || userObj.givenName || userObj.email.split('@')[0],
          userObj.photo || '',
          userObj.id || ''
        );
        if (syncRes && syncRes.success && syncRes.user) {
          setUser(syncRes.user);
          Alert.alert('✅ Account Synced', `Signed in as ${syncRes.user.email}`);
        } else {
          const errMsg = syncRes?.error || 'Failed to sync Google user with server.';
          Alert.alert('Login Error', errMsg);
        }
      }
    } catch (error) {
      console.log('Native Google Sign-In Error:', error);
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Google Sign-In', error.message || 'Could not complete Google Sign-In.');
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logoutUser();
            await GoogleSignin.signOut().catch(() => {});
            setUser(null);
          },
        },
      ]
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Blue Top Header */}
      <View style={[styles.blueHeader, { paddingTop: insets.top + 6, height: 60 + insets.top }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.headerCircleBtn}
            onPress={() => navigation?.navigate('Home')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity
            style={styles.headerCircleBtn}
            onPress={handleOpenNotifications}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            {unreadCount > 0 && <View style={styles.bellBadgeDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Body */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 20 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Hero User Profile Card */}
        <View style={styles.profileHeroCard}>
          <View style={styles.heroCardInner}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                {user && user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {isLoggedIn ? (user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()) : 'G'}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.cameraIconBadge}
                activeOpacity={0.8}
                onPress={isLoggedIn ? undefined : handleOneTapGoogleSignIn}
              >
                <Ionicons name="camera-outline" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfoCol}>
              <Text style={styles.profileNameText}>
                {isLoggedIn ? (user.name || user.email.split('@')[0]) : 'Guest Account'}
              </Text>
              <Text style={styles.profileEmailText} numberOfLines={1}>
                {isLoggedIn ? user.email : 'Sign in to sync VIP plan across devices'}
              </Text>

              <View style={styles.heroBadgesRow}>
                {isPremiumUser ? (
                  <>
                    <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.vipMemberBadge}>
                      <MaterialCommunityIcons name="crown" size={13} color="#FFFFFF" />
                      <Text style={styles.vipMemberBadgeText}>VIP PREMIUM MEMBER</Text>
                    </LinearGradient>

                    <View style={styles.expiryPillsRow}>
                      <View style={styles.expiresPill}>
                        <Ionicons name="calendar-outline" size={12} color="#059669" />
                        <Text style={styles.expiresPillText}>Expires {expiryDetails.dayOfWeek}, {expiryDetails.formattedDate}</Text>
                      </View>
                      <View style={styles.daysLeftPillHeader}>
                        <Text style={styles.daysLeftPillHeaderText}>{expiryDetails.daysLeft} Days Left</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.freeUserBadge}
                    activeOpacity={0.8}
                    onPress={() => setShowSubscriptionModal(true)}
                  >
                    <Ionicons name="sparkles" size={12} color="#2563EB" />
                    <Text style={styles.freeUserBadgeText}>FREE USER • UPGRADE TO VIP</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isLoggedIn && isPremiumUser && (
              <MaterialCommunityIcons name="crown" size={76} color="rgba(245, 158, 11, 0.25)" style={styles.crownWatermark} />
            )}
          </View>
        </View>

        {/* 2. Premium Benefits Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Premium Benefits</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSubscriptionModal(true)}>
            <View style={styles.unlockLinkRow}>
              <Text style={styles.unlockPowerLink}>Unlock More Power</Text>
              <Ionicons name="chevron-forward" size={14} color="#2563EB" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.benefitsGridRow}>
          <TouchableOpacity activeOpacity={0.8} style={styles.benefitCard} onPress={() => setShowSubscriptionModal(true)}>
            <View style={[styles.benefitIconBox, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="flash" size={20} color="#2563EB" />
            </View>
            <Text style={styles.benefitTitle} numberOfLines={1}>10x Speed</Text>
            <Text style={styles.benefitSubtitle} numberOfLines={2}>Faster Downloads</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.8} style={styles.benefitCard} onPress={() => setShowSubscriptionModal(true)}>
            <View style={[styles.benefitIconBox, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="paper-plane" size={20} color="#0EA5E9" />
            </View>
            <Text style={styles.benefitTitle} numberOfLines={1}>Telegram Bot</Text>
            <Text style={styles.benefitSubtitle} numberOfLines={2}>Instant Access</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.8} style={styles.benefitCard} onPress={() => setShowSubscriptionModal(true)}>
            <View style={[styles.benefitIconBox, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="folder-open" size={20} color="#6366F1" />
            </View>
            <Text style={styles.benefitTitle} numberOfLines={1}>Folder Download</Text>
            <Text style={styles.benefitSubtitle} numberOfLines={2}>Download Entire Folders</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.8} style={styles.benefitCard} onPress={() => setShowSubscriptionModal(true)}>
            <View style={[styles.benefitIconBox, { backgroundColor: '#E6F4EA' }]}>
              <Ionicons name="headset" size={20} color="#10B981" />
            </View>
            <Text style={styles.benefitTitle} numberOfLines={1}>Priority Support</Text>
            <Text style={styles.benefitSubtitle} numberOfLines={2}>Get Help Anytime</Text>
          </TouchableOpacity>
        </View>

        {/* 3. GO PREMIUM / Unlock Full Power Banner */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => setShowSubscriptionModal(true)}>
          <LinearGradient colors={['#3B82F6', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.promoBannerCard}>
            <View style={styles.promoLeftCol}>
              <Text style={styles.promoTag}>GO PREMIUM</Text>
              <Text style={styles.promoTitle}>Unlock Full Power</Text>
              <Text style={styles.promoDesc}>Faster downloads, Telegram bot access, 10x speed and more features!</Text>
            </View>
            <View style={styles.promoRightCol}>
              <MaterialCommunityIcons name="crown" size={38} color="#FBBF24" style={styles.promoCrownIcon} />
              <View style={styles.promoArrowCircle}>
                <Ionicons name="chevron-forward" size={18} color="#2563EB" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Official Google Sign In Button (When not logged in) */}
        {!isLoggedIn && (
          <TouchableOpacity
            style={styles.googleSignInBtn}
            activeOpacity={0.85}
            onPress={handleOneTapGoogleSignIn}
          >
            <View style={styles.googleIconTile}>
              <Ionicons name="logo-google" size={24} color="#4285F4" />
            </View>
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}

        {/* 4. Grouped Options Card 1: Premium */}
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => setShowSubscriptionModal(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="sparkles" size={18} color="#D97706" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Buy Premium</Text>
              <Text style={styles.rowSubtitle}>Folder Download, Telegram Bot & 10x Speed</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => setShowManageModal(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#6366F1" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Manage Premium</Text>
              <Text style={styles.rowSubtitle}>
                {isPremiumUser
                  ? `${expiryDetails.daysLeft} Days Left • Expires ${expiryDetails.dayOfWeek}, ${expiryDetails.formattedDate}`
                  : 'Tap to view membership benefits'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 5. Grouped Options Card 2: Profile & Announcements */}
        <View style={styles.groupCard}>
          {isLoggedIn && (
            <>
              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Profile Info', `Name: ${user.name || 'N/A'}\nEmail: ${user.email}`)}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="create-outline" size={18} color="#0284C7" />
                </View>
                <Text style={styles.rowLabel}>Edit Profile</Text>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => setShowAnnouncementsModal(true)}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="megaphone-outline" size={18} color="#EF4444" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>Announcements & Updates</Text>
              <Text style={styles.rowSubtitle}>View all news, anime releases & app updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => navigation?.navigate('Downloads')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#E6F4EA' }]}>
              <Ionicons name="download-outline" size={18} color="#10B981" />
            </View>
            <Text style={styles.rowLabel}>Downloads</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 6. Grouped Options Card 3: Support & Policies */}
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://t.me/+L7tcuoCsTaMxZWVl').catch(() => {})}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}>
              <Ionicons name="paper-plane-outline" size={18} color="#0284C7" />
            </View>
            <Text style={styles.rowLabel}>Telegram Bot & Support</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://teraboxdownloader.co.in/privacy-policy').catch(() => {})}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#6366F1" />
            </View>
            <Text style={styles.rowLabel}>Privacy Policy & Terms</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={openDirectPlayStorePage}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="star" size={18} color="#D97706" />
            </View>
            <Text style={styles.rowLabel}>Rate Us on Play Store ⭐️</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 7. Grouped Options Card 4: Logout (When logged in) */}
        {isLoggedIn && (
          <View style={styles.groupCard}>
            <TouchableOpacity
              style={styles.rowItem}
              activeOpacity={0.7}
              onPress={handleSignOut}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.rowLabel, { color: '#EF4444' }]}>
                Logout
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Subscription Checkout Modal */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        user={user}
        onPaymentSuccess={(updatedEmail) => {
          getStoredUser().then(setUser);
          setShowSubscriptionModal(false);
        }}
      />

      {/* Manage Premium Modal View */}
      <Modal visible={showManageModal} animationType="slide" transparent onRequestClose={() => setShowManageModal(false)}>
        <View style={styles.manageOverlay}>
          <View style={styles.manageContainer}>
            <View style={styles.manageHeader}>
              <View style={styles.manageHeaderTitleRow}>
                <Ionicons name="star" size={20} color="#F59E0B" />
                <Text style={styles.manageHeaderTitle}>Manage Premium</Text>
              </View>
              <TouchableOpacity onPress={() => setShowManageModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.manageBody}>
              <AnimatedManageExpiryCard expiryDetails={expiryDetails} isLoggedIn={isLoggedIn} user={user} />

              <Text style={styles.manageSectionHeading}>✨ Premium Membership Benefits:</Text>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="flash" size={20} color="#6366F1" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>10x Ultra-Fast Speeds</Text>
                  <Text style={styles.manageFeatureSub}>Multi-connection parallel downloads enabled</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="folder-open" size={20} color="#0EA5E9" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>TeraBox Folder Downloads</Text>
                  <Text style={styles.manageFeatureSub}>Extract and download multi-file folder links</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="paper-plane" size={20} color="#D97706" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>Telegram Bot Access</Text>
                  <Text style={styles.manageFeatureSub}>Direct file delivery in official Telegram Bot</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <Ionicons name="hardware-chip" size={20} color="#9333EA" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>1 Subscription = 3 Memberships</Text>
                  <Text style={styles.manageFeatureSub}>Use on Mobile App, Website & Telegram Bot simultaneously</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="ban" size={20} color="#10B981" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>100% Ad-Free Experience</Text>
                  <Text style={styles.manageFeatureSub}>Zero banner ads, zero video interstitial ads</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <TouchableOpacity
                style={styles.extendBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setShowManageModal(false);
                  setShowSubscriptionModal(true);
                }}
              >
                <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.extendGradient}>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                  <Text style={styles.extendBtnText}>Extend Subscription Plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Notification Center Modal */}
      <NotificationCenterModal
        visible={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        notifications={notifications}
        onClear={() => {
          setNotifications([]);
          setUnreadCount(0);
        }}
      />

      {/* Announcements & Updates Modal */}
      <AnnouncementsModal
        visible={showAnnouncementsModal}
        onClose={() => setShowAnnouncementsModal(false)}
      />

      {!isPremiumUser && !bannerAdError && (
        <View style={styles.bannerContainer}>
          <BannerAd
            unitId={AD_UNIT_IDS.BANNER_5}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            onAdLoaded={() => setBannerAdError(false)}
            onAdFailedToLoad={(error) => {
              console.log('Settings Banner Ad failed to load:', error.message);
              setBannerAdError(true);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  blueHeader: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },

  /* Profile Hero Card */
  profileHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    position: 'relative',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  avatarImg: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  profileInfoCol: {
    flex: 1,
  },
  profileNameText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  profileEmailText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  heroBadgesRow: {
    marginTop: 8,
    gap: 6,
  },
  vipMemberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vipMemberBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  expiryPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  expiresPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  expiresPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  daysLeftPillHeader: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  daysLeftPillHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  freeUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
  },
  freeUserBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.4,
  },
  crownWatermark: {
    position: 'absolute',
    right: -10,
    top: -10,
  },

  /* Benefits Horizontal Section */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: -4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  unlockLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  unlockPowerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  benefitsGridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 6,
    paddingVertical: 4,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  benefitIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  benefitTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  benefitSubtitle: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 11,
  },

  /* GO PREMIUM Banner Card */
  promoBannerCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  promoLeftCol: {
    flex: 1,
    paddingRight: 10,
  },
  promoTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1,
  },
  promoTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  promoDesc: {
    fontSize: 12,
    color: '#E0E7FF',
    marginTop: 4,
    lineHeight: 16,
    fontWeight: '500',
  },
  promoRightCol: {
    alignItems: 'center',
    gap: 8,
  },
  promoCrownIcon: {
    marginBottom: -4,
  },
  promoArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  /* Google Sign In Button */
  googleSignInBtn: {
    backgroundColor: '#4285F4',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingRight: 20,
    elevation: 3,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  googleIconTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  googleBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Group Cards */
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 52,
  },

  bannerContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  manageContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 20,
  },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  manageHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  manageBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 14,
  },
  manageStatusCard: {
    borderRadius: 18,
    padding: 16,
  },
  manageStatusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  manageStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manageStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  livePulseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  livePulseText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  managePlanName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  manageExpiryText: {
    fontSize: 13,
    color: '#CBD5E1',
    marginTop: 4,
  },
  manageEmailText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 8,
  },
  manageSectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  manageFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  manageIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageFeatureTextCol: {
    flex: 1,
  },
  manageFeatureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  manageFeatureSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  expiryDetailCardBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  expiryDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expiryDetailDateLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  expiryDetailDateValue: {
    fontSize: 13,
    color: '#F8FAFC',
    fontWeight: '700',
    flex: 1,
  },
  expiryDaysBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  expiryDaysTitle: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  daysLeftPill: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  daysLeftPillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  daysLeftPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  extendBtn: {
    marginTop: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  extendGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  extendBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
