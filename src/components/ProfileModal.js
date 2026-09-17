import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { syncGoogleUser, logoutUser } from '../services/authService';

GoogleSignin.configure({
  webClientId: '127142107297-eqjrnnvko66pn6014ndesqimqbtof3ll.apps.googleusercontent.com',
  offlineAccess: false,
});

export default function ProfileModal({ visible, onClose, user, onUserUpdated, onOpenUpgrade }) {
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const isLoggedIn = !!(user && user.email);
  const isPremium = user && (user.premiumStatus === 'premium' || (user.plan && user.plan !== 'free'));

  async function handleOneTapGoogleSignIn() {
    setLoggingIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      const userInfo = response.data ? response.data : response;
      const userObj = userInfo.user || userInfo;

      if (userObj && userObj.email) {
        const updatedUser = await syncGoogleUser(
          userObj.email,
          userObj.name || userObj.givenName || userObj.email.split('@')[0],
          userObj.photo || '',
          userObj.id || ''
        );
        if (updatedUser) {
          if (onUserUpdated) onUserUpdated(updatedUser);
          Alert.alert('✅ Google Account Synced', `Signed in as ${updatedUser.email}`);
        } else {
          Alert.alert('Login Error', 'Failed to sync Google user with server.');
        }
      }
    } catch (error) {
      console.log('Native Google Sign-In Error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services Error', 'Play Services not available or outdated.');
      } else {
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
            if (onUserUpdated) onUserUpdated(null);
            onClose();
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <LinearGradient colors={['#0F172A', '#1E293B']} style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="person-circle" size={22} color="#6366F1" />
              <Text style={styles.headerTitle}>User Account & Profile</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* User Profile Card */}
            <LinearGradient
              colors={isPremium ? ['#1E1B4B', '#0F172A'] : ['#F8FAFC', '#F1F5F9']}
              style={[styles.profileCard, isPremium && styles.profileCardPremium]}
            >
              {/* Glowing Avatar Container */}
              <View style={[styles.avatarWrapper, isPremium && styles.avatarWrapperPremium]}>
                <View style={styles.avatarCircle}>
                  {user && user.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarInitial}>
                      {isLoggedIn ? (user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()) : 'G'}
                    </Text>
                  )}
                </View>
                {isPremium && (
                  <View style={styles.vipBadgeIcon}>
                    <Ionicons name="checkmark-circle" size={20} color="#F59E0B" />
                  </View>
                )}
              </View>

              <Text style={[styles.userName, isPremium && styles.textWhite]}>
                {isLoggedIn ? (user.name || user.email.split('@')[0]) : 'Guest Account'}
              </Text>
              <Text style={[styles.userEmail, isPremium && styles.textMutedDark]}>
                {isLoggedIn ? user.email : 'Sign in to sync your premium plan on App & Web'}
              </Text>

              {/* Status Badge */}
              <View style={styles.badgeRow}>
                {isPremium ? (
                  <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.statusBadge}>
                    <Ionicons name="star" size={14} color="#FFFFFF" />
                    <Text style={styles.statusBadgeText}>
                      PREMIUM ACTIVE ({user.plan ? user.plan.toUpperCase() : 'VIP'})
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.freeBadge}>
                    <Ionicons name="person-outline" size={14} color="#64748B" />
                    <Text style={styles.freeBadgeText}>FREE PLAN</Text>
                  </View>
                )}
              </View>

              {isPremium && user.premiumExpiresAt && (
                <View style={styles.expiryBox}>
                  <Ionicons name="calendar-outline" size={13} color="#10B981" />
                  <Text style={styles.expiryText}>
                    Valid until: {new Date(user.premiumExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              )}
            </LinearGradient>

            {/* Plan Perks Grid */}
            <View style={styles.perksCard}>
              <Text style={styles.perksHeading}>
                {isPremium ? '✨ Active Plan Benefits:' : '⚡ Upgrade Perks:'}
              </Text>

              <View style={styles.perksGrid}>
                <View style={styles.perkItem}>
                  <Ionicons name="sparkles-outline" size={18} color={isPremium ? "#10B981" : "#6366F1"} />
                  <View style={styles.perkTextCol}>
                    <Text style={styles.perkTitle}>100% Ad-Free</Text>
                    <Text style={styles.perkDesc}>{isPremium ? 'Active across App & Web' : 'Zero ads experience'}</Text>
                  </View>
                </View>

                <View style={styles.perkItem}>
                  <Ionicons name="flash-outline" size={18} color={isPremium ? "#10B981" : "#6366F1"} />
                  <View style={styles.perkTextCol}>
                    <Text style={styles.perkTitle}>10x High Speed</Text>
                    <Text style={styles.perkDesc}>Full HD Direct Download</Text>
                  </View>
                </View>

                <View style={styles.perkItem}>
                  <Ionicons name="play-circle-outline" size={18} color={isPremium ? "#10B981" : "#6366F1"} />
                  <View style={styles.perkTextCol}>
                    <Text style={styles.perkTitle}>1080p Web Player</Text>
                    <Text style={styles.perkDesc}>Instant Browser Streaming</Text>
                  </View>
                </View>

                <View style={styles.perkItem}>
                  <Ionicons name="sync-outline" size={18} color={isPremium ? "#10B981" : "#6366F1"} />
                  <View style={styles.perkTextCol}>
                    <Text style={styles.perkTitle}>Web & App Sync</Text>
                    <Text style={styles.perkDesc}>Same Gmail Access</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 1-Tap Google Sign In */}
            {!isLoggedIn && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.officialGoogleBtn}
                onPress={handleOneTapGoogleSignIn}
                disabled={loggingIn}
              >
                <Image
                  source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                  style={styles.officialGoogleLogo}
                />
                <Text style={styles.officialGoogleBtnText}>
                  {loggingIn ? 'Connecting...' : 'Sign in with Google'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Upgrade / Manage Plan Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.upgradeBtn}
              onPress={() => {
                onClose();
                if (onOpenUpgrade) onOpenUpgrade();
              }}
            >
              <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.upgradeGradient}>
                <Ionicons name="sparkles" size={18} color="#F59E0B" />
                <Text style={styles.upgradeBtnText}>
                  {isPremium ? 'Manage / Extend Subscription' : 'Upgrade to Premium'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Sync Notice */}
            <View style={styles.syncNotice}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#3B82F6" />
              <Text style={styles.syncNoticeText}>
                Purchased plan will automatically sync on Website (teraboxdownloader.co.in) using the same Gmail!
              </Text>
            </View>

            {/* Sign Out Button */}
            {isLoggedIn && (
              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                <Text style={styles.signOutText}>Sign Out Account</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  body: {
    padding: 18,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  profileCardPremium: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarWrapperPremium: {
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#F59E0B',
    padding: 2,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  vipBadgeIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textMutedDark: {
    color: '#94A3B8',
  },
  badgeRow: {
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  freeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  expiryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 10,
  },
  expiryText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  perksCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  perksHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
  },
  perksGrid: {
    gap: 10,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  perkTextCol: {
    flex: 1,
  },
  perkTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  perkDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  officialGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#4285F4',
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 14,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  officialGoogleLogo: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  officialGoogleBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3C4043',
  },
  upgradeBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  syncNoticeText: {
    fontSize: 11,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 15,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },
});
