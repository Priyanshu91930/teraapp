import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Switch,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { syncGoogleUser, logoutUser } from '../services/authService';

GoogleSignin.configure({
  webClientId: '127142107297-eqjrnnvko66pn6014ndesqimqbtof3ll.apps.googleusercontent.com',
  offlineAccess: false,
});

export default function ProfileModal({ visible, onClose, user, onUserUpdated, onOpenUpgrade, navigation }) {
  const insets = useSafeAreaInsets();
  const [loggingIn, setLoggingIn] = useState(false);

  // Quick settings switches
  const [highSpeedEnabled, setHighSpeedEnabled] = useState(true);
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [useProxy, setUseProxy] = useState(true);

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
          Alert.alert('✅ Account Synced', `Signed in as ${updatedUser.email}`);
        } else {
          Alert.alert('Login Error', 'Failed to sync Google user with server.');
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
            if (onUserUpdated) onUserUpdated(null);
            onClose();
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Dark Top Header Banner */}
        <View style={[styles.darkHeader, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.circleBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Account</Text>
            <TouchableOpacity style={styles.circleBtn} onPress={() => Alert.alert('Notifications', 'No new notifications.')} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              <View style={styles.bellBadgeDot} />
            </TouchableOpacity>
          </View>

          {/* User Info Center */}
          <View style={styles.userCenter}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                {user && user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {isLoggedIn ? (user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()) : 'P'}
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
              {isLoggedIn ? (user.name || user.email.split('@')[0]) : 'priya'}
            </Text>
            <Text style={styles.userEmail}>
              {isLoggedIn ? user.email : 'priay9193@gmail.com'}
            </Text>

            {/* VIP Status Badge */}
            <View style={styles.badgeRow}>
              {isPremium ? (
                <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.vipBadge}>
                  <Ionicons name="star" size={11} color="#FFFFFF" />
                  <Text style={styles.vipBadgeText}>★ VIP PREMIUM MEMBER</Text>
                </LinearGradient>
              ) : (
                <TouchableOpacity
                  style={styles.upgradeBadge}
                  activeOpacity={0.8}
                  onPress={() => {
                    onClose();
                    if (onOpenUpgrade) onOpenUpgrade();
                  }}
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

            {/* Group 1: Buy Premium & Manage Premium */}
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  if (onOpenUpgrade) onOpenUpgrade();
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="sparkles" size={18} color="#D97706" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowLabel}>Buy Premium</Text>
                  <Text style={styles.rowSubtitle}>100% Ad-Free, 10x Speed & Unlimited Downloads</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={() => {
                  if (isPremium) {
                    Alert.alert(
                      '★ Premium Membership Active',
                      `Plan: ${user?.plan ? user.plan.toUpperCase() : 'Yearly VIP'}\nStatus: Active & Valid until 2027\n\nFeatures Enabled:\n• 100% Ad-Free Experience\n• 10x Ultra Speed Downloads\n• 1080p HD Streaming`
                    );
                  } else {
                    onClose();
                    if (onOpenUpgrade) onOpenUpgrade();
                  }
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="shield-checkmark" size={18} color="#6366F1" />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowLabel}>Manage Premium</Text>
                  <Text style={styles.rowSubtitle}>
                    {isPremium ? 'View active plan details & benefits' : 'No active plan — Tap to view plans'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            {/* Group 2: Account & Downloads */}
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={isLoggedIn ? () => Alert.alert('Profile Info', `Name: ${user.name || 'N/A'}\nEmail: ${user.email}`) : handleOneTapGoogleSignIn}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                  <Ionicons name="create-outline" size={18} color="#27272A" />
                </View>
                <Text style={styles.rowLabel}>{isLoggedIn ? 'Edit Profile' : 'Sign In with Google'}</Text>
                <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  if (navigation) navigation.navigate('Downloads');
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                  <Ionicons name="download-outline" size={18} color="#27272A" />
                </View>
                <Text style={styles.rowLabel}>Downloads</Text>
                <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            {/* Group 3: App Toggles & Preferences */}
            <View style={styles.groupCard}>
              <View style={styles.switchRowItem}>
                <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                  <Ionicons name="speedometer-outline" size={18} color="#27272A" />
                </View>
                <Text style={styles.rowLabel}>10x Speed Acceleration</Text>
                <Switch
                  value={highSpeedEnabled}
                  onValueChange={setHighSpeedEnabled}
                  trackColor={{ true: '#6366F1', false: '#E4E4E7' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRowItem}>
                <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                  <Ionicons name="images-outline" size={18} color="#27272A" />
                </View>
                <Text style={styles.rowLabel}>Save Downloads to Gallery</Text>
                <Switch
                  value={saveToGallery}
                  onValueChange={setSaveToGallery}
                  trackColor={{ true: '#6366F1', false: '#E4E4E7' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRowItem}>
                <View style={[styles.iconCircle, { backgroundColor: '#F4F4F5' }]}>
                  <Ionicons name="swap-horizontal-outline" size={18} color="#27272A" />
                </View>
                <Text style={styles.rowLabel}>Proxy Server Mode</Text>
                <Switch
                  value={useProxy}
                  onValueChange={setUseProxy}
                  trackColor={{ true: '#6366F1', false: '#E4E4E7' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Group 4: Support & Legal */}
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  Linking.openURL('https://t.me/teraboxbot').catch(() => {});
                }}
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
                onPress={() => {
                  onClose();
                  Linking.openURL('https://teraboxdownloader.co.in/privacy-policy').catch(() => {});
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" />
                </View>
                <Text style={styles.rowLabel}>Privacy Policy & Terms</Text>
                <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            {/* Group 5: Logout */}
            <View style={styles.groupCard}>
              <TouchableOpacity
                style={styles.rowItem}
                activeOpacity={0.7}
                onPress={isLoggedIn ? handleSignOut : handleOneTapGoogleSignIn}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                </View>
                <Text style={[styles.rowLabel, { color: '#EF4444' }]}>
                  {isLoggedIn ? 'Logout' : 'Sign In'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
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
  switchRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
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
});
