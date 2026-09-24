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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getStoredUser, checkIsPremium, syncGoogleUser, logoutUser } from '../services/authService';
import SubscriptionModal from '../components/SubscriptionModal';
import NotificationCenterModal from '../components/NotificationCenterModal';
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

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loggingIn, setLoggingIn] = useState(false);

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
      {/* Top Header Banner */}
      <View style={[styles.darkHeader, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => navigation?.navigate('Home')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleOpenNotifications}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
            {unreadCount > 0 && <View style={styles.bellBadgeDot} />}
          </TouchableOpacity>
        </View>

        {/* User Profile Center */}
        <View style={styles.userCenter}>
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

          <Text style={styles.userName}>
            {isLoggedIn ? (user.name || user.email.split('@')[0]) : 'Guest Account'}
          </Text>
          <Text style={styles.userEmail}>
            {isLoggedIn ? user.email : 'Sign in to sync your plan on App & Web'}
          </Text>

          <View style={styles.badgeRow}>
            {isPremiumUser ? (
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.vipBadge}>
                <Ionicons name="star" size={11} color="#FFFFFF" />
                <Text style={styles.vipBadgeText}>★ VIP PREMIUM MEMBER</Text>
              </LinearGradient>
            ) : (
              <TouchableOpacity
                style={styles.upgradeBadge}
                activeOpacity={0.8}
                onPress={() => setShowSubscriptionModal(true)}
              >
                <Ionicons name="flash" size={11} color="#6366F1" />
                <Text style={styles.upgradeBadgeText}>UPGRADE TO VIP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* White Curved Sheet Container */}
      <View style={styles.whiteSheet}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 20 }
          ]}
          showsVerticalScrollIndicator={false}
        >

          {/* Group 0: Official Blue Google Sign In Button (Only when NOT logged in) */}
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

          {/* Group 1: Buy Premium & Manage Premium */}
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
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
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
                  {isPremiumUser ? 'View active plan, expiry & 6 unlocked features' : 'Tap to view membership benefits'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          {/* Group 2: Edit Profile & Downloads */}
          <View style={styles.groupCard}>
            {isLoggedIn && (
              <>
                <TouchableOpacity
                  style={styles.rowItem}
                  activeOpacity={0.7}
                  onPress={() => Alert.alert('Profile Info', `Name: ${user.name || 'N/A'}\nEmail: ${user.email}`)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                    <Ionicons name="create-outline" size={18} color="#27272A" />
                  </View>
                  <Text style={styles.rowLabel}>Edit Profile</Text>
                  <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
                </TouchableOpacity>

                <View style={styles.divider} />
              </>
            )}

            <TouchableOpacity
              style={styles.rowItem}
              activeOpacity={0.7}
              onPress={() => navigation?.navigate('Downloads')}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                <Ionicons name="download-outline" size={18} color="#27272A" />
              </View>
              <Text style={styles.rowLabel}>Downloads</Text>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          {/* Group 3: Support & Legal */}
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
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.rowItem}
              activeOpacity={0.7}
              onPress={() => Linking.openURL('https://teraboxdownloader.co.in/privacy-policy').catch(() => {})}
            >
              <View style={[styles.iconCircle, { backgroundColor: '#F1F5F9' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.rowLabel}>Privacy Policy & Terms</Text>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
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
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          {/* Group 4: Logout (ONLY shown when logged in) */}
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
      </View>

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
            {/* Header */}
            <View style={styles.manageHeader}>
              <View style={styles.manageHeaderTitleRow}>
                <Ionicons name="star" size={20} color="#F59E0B" />
                <Text style={styles.manageHeaderTitle}>Manage Premium</Text>
              </View>
              <TouchableOpacity onPress={() => setShowManageModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.manageBody} showsVerticalScrollIndicator={false}>
              {/* Active Membership Banner Card */}
              <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.manageStatusCard}>
                <View style={styles.manageStatusBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.manageStatusBadgeText}>
                    {isPremiumUser ? '★ VIP MEMBERSHIP ACTIVE' : 'FREE USER'}
                  </Text>
                </View>
                <Text style={styles.managePlanName}>
                  {isPremiumUser ? `${user?.plan ? user.plan.toUpperCase() : 'YEARLY'} VIP PLAN` : 'No Active Plan'}
                </Text>
                <Text style={styles.manageExpiryText}>
                  {isPremiumUser ? 'Valid Status: Active & Valid until 2027' : 'Upgrade to unlock all premium features'}
                </Text>
                <Text style={styles.manageEmailText}>Linked Account: {isLoggedIn ? user.email : 'Not Logged In'}</Text>
              </LinearGradient>

              {/* Unlocked Features List */}
              <Text style={styles.manageSectionHeading}>✨ Features Included in Subscription:</Text>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="folder-open" size={20} color="#6366F1" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>TeraBox Folder Download Support</Text>
                  <Text style={styles.manageFeatureSub}>Download full multi-file TeraBox folders at once</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="paper-plane" size={20} color="#0284C7" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>Direct Files in Telegram Bot</Text>
                  <Text style={styles.manageFeatureSub}>Get direct playable video & document files in Telegram</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="flash" size={20} color="#D97706" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>10x Ultra-Fast Multi-Thread Speed</Text>
                  <Text style={styles.manageFeatureSub}>Maximum ISP acceleration with zero speed limits</Text>
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

              <View style={styles.manageFeatureItem}>
                <View style={[styles.manageIconBox, { backgroundColor: '#FCE7F3' }]}>
                  <Ionicons name="film" size={20} color="#DB2777" />
                </View>
                <View style={styles.manageFeatureTextCol}>
                  <Text style={styles.manageFeatureTitle}>1080p Full HD Video Player</Text>
                  <Text style={styles.manageFeatureSub}>Instant streaming with multi-quality resolution selector</Text>
                </View>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>

              {/* Extend / Upgrade Button */}
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

      {!isPremiumUser && (
        <View style={styles.bannerContainer}>
          <BannerAd
            unitId={AD_UNIT_IDS.BANNER_5}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#18181B',
  },
  darkHeader: {
    backgroundColor: '#18181B',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellBadgeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userCenter: {
    alignItems: 'center',
    marginTop: 4,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userEmail: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 2,
    marginBottom: 8,
  },
  badgeRow: {
    marginTop: 2,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  upgradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  upgradeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.5,
  },
  whiteSheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  googleSignInBtn: {
    backgroundColor: '#4285F4',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingRight: 20,
    marginBottom: 4,
    elevation: 4,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  googleIconTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  googleLogoImg: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  googleBtnText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  groupCard: {
    backgroundColor: '#F4F4F6',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },
  rowSubtitle: {
    fontSize: 11,
    color: '#71717A',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#E4E4E7',
    marginLeft: 50,
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
  manageStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  manageStatusBadgeText: {
    fontSize: 11,
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
