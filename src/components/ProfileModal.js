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
      // Clear previous cached session so Google shows the account chooser sheet with all Gmails
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
        // User cancelled login flow
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Sign-in in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services Error', 'Play Services not available or outdated.');
      } else {
        Alert.alert('Google Sign-In', error.message || 'Could not complete Google Sign-In.');
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleQuickEmailLogin() {
    const email = googleEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Google Email', 'Please enter a valid Gmail address.');
      return;
    }

    setLoggingIn(true);
    try {
      const name = email.split('@')[0];
      const updatedUser = await syncGoogleUser(email, name);
      if (updatedUser) {
        if (onUserUpdated) onUserUpdated(updatedUser);
        setShowEmailFallback(false);
        setGoogleEmailInput('');
        Alert.alert('✅ Google Account Synced', `Signed in as ${updatedUser.email}`);
      } else {
        Alert.alert('Login Error', 'Could not sync Google account.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Login failed.');
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
          <View style={styles.header}>
            <Text style={styles.headerTitle}>User Account & Profile</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* User Profile Card */}
            <View style={styles.profileCard}>
              <View style={styles.avatarCircle}>
                {user && user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {isLoggedIn ? (user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()) : 'G'}
                  </Text>
                )}
              </View>

              <Text style={styles.userName}>
                {isLoggedIn ? (user.name || user.email.split('@')[0]) : 'Guest Account'}
              </Text>
              <Text style={styles.userEmail}>
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
                <Text style={styles.expiryText}>
                  Valid until: {new Date(user.premiumExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              )}
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

            {/* Upgrade to Premium Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.upgradeBtn}
              onPress={() => {
                onClose();
                if (onOpenUpgrade) onOpenUpgrade();
              }}
            >
              <LinearGradient colors={['#2563EB', '#4F46E5']} style={styles.upgradeGradient}>
                <Ionicons name="sparkles" size={18} color="#F59E0B" />
                <Text style={styles.upgradeBtnText}>
                  {isPremium ? 'Manage / Extend Plan' : 'Buy Premium Plan'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Sync Notice */}
            <View style={styles.syncNotice}>
              <Ionicons name="information-circle-outline" size={16} color="#3B82F6" />
              <Text style={styles.syncNoticeText}>
                Purchased plan will automatically sync on Website (teraboxdownloader.co.in) using the same Gmail!
              </Text>
            </View>

            {/* Sign Out Button */}
            {isLoggedIn && (
              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 20,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  badgeRow: {
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
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
  expiryText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 8,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#3C4043',
  },
  fallbackToggleBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  fallbackToggleText: {
    fontSize: 12,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 12,
  },
  switchAccountText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  emailInputCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  emailInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  emailInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelInputBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelInputText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  submitInputBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  submitInputText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  upgradeBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
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
    fontWeight: '700',
    color: '#FFFFFF',
  },
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  syncNoticeText: {
    fontSize: 11,
    color: '#1E40AF',
    flex: 1,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  signOutText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
});
