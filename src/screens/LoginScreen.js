import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { syncGoogleUser } from '../services/authService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

GoogleSignin.configure({
  webClientId: '127142107297-eqjrnnvko66pn6014ndesqimqbtof3ll.apps.googleusercontent.com',
  offlineAccess: false,
});

export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    if (loading) return;
    setLoading(true);
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
          if (onLoginSuccess) {
            onLoginSuccess(syncRes.user);
          }
        } else {
          const errMsg = syncRes?.error || 'Failed to sync account with server. Please try again.';
          Alert.alert('Sign-In Error', errMsg);
        }
      }
    } catch (error) {
      console.log('[LoginScreen] Google Sign-In error:', error);
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        Alert.alert('Sign-In', error.message || 'Could not complete Google Sign-In.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Top Half: Blue Gradient Background */}
      <LinearGradient
        colors={['#1D4ED8', '#2563EB', '#3B82F6']}
        style={styles.topSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Background decorative soft circles */}
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        {/* Top Header Row: Left "Welcome Back!" + Headline + Subtitle; Right: Big Logo */}
        <View style={styles.topHeaderRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.welcomeBackText}>Welcome Back!</Text>
            <Text style={styles.mainHeading}>Access your</Text>
            <Text style={styles.mainHeading}>downloaded</Text>
            <Text style={styles.mainHeading}>files securely</Text>
            <Text style={styles.headingSub}>
              Log in to unlock full features and enjoy ultra-fast downloads.
            </Text>
          </View>

          <View style={styles.topRightLogoWrap}>
            <View style={styles.topRightLogoCard}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.bigBrandLogo}
                resizeMode="cover"
              />
            </View>
            <View style={styles.logoBadgePill}>
              <View style={styles.greenDot} />
              <Text style={styles.logoBadgeText}>Fast & Secure</Text>
            </View>
            {/* Subtle Dot Matrix Pattern */}
            <View style={styles.dotMatrix}>
              <View style={styles.matrixRow}>
                <View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} />
              </View>
              <View style={styles.matrixRow}>
                <View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} />
              </View>
              <View style={styles.matrixRow}>
                <View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} /><View style={styles.matrixDot} />
              </View>
            </View>
          </View>
        </View>

        {/* Middle Illustration Area: Left 3 Side Features + Right Phone Mockup */}
        <View style={styles.illustrationContainer}>
          {/* Left 3 Side Features */}
          <View style={styles.sideFeaturesWrap}>
            <View style={styles.sideFeatureRow}>
              <View style={styles.sideIconBox}>
                <Ionicons name="flash" size={13} color="#FFFFFF" />
              </View>
              <View style={styles.sideTextBox}>
                <Text style={styles.sideTitle}>Ultra Fast</Text>
                <Text style={styles.sideDesc}>Lightning speed downloads</Text>
              </View>
            </View>

            <View style={styles.sideFeatureRow}>
              <View style={styles.sideIconBox}>
                <Ionicons name="cloud-outline" size={13} color="#FFFFFF" />
              </View>
              <View style={styles.sideTextBox}>
                <Text style={styles.sideTitle}>Cloud Sync</Text>
                <Text style={styles.sideDesc}>Access anywhere, anytime</Text>
              </View>
            </View>

            <View style={styles.sideFeatureRow}>
              <View style={styles.sideIconBox}>
                <Ionicons name="shield-checkmark-outline" size={13} color="#FFFFFF" />
              </View>
              <View style={styles.sideTextBox}>
                <Text style={styles.sideTitle}>100% Secure</Text>
                <Text style={styles.sideDesc}>Your data is always protected</Text>
              </View>
            </View>
          </View>

          {/* Right Phone Mockup */}
          <View style={styles.phoneMockup}>
            {/* Dynamic island notch */}
            <View style={styles.phoneNotch} />

            <View style={styles.phoneInnerContent}>
              {/* Play Store Top Bar */}
              <View style={styles.playTopBar}>
                <View style={styles.playLogoGroup}>
                  <Ionicons name="arrow-back" size={11} color="#5F6368" style={{ marginRight: 3 }} />
                  <Text style={styles.playLogoText}>Google Play</Text>
                </View>
                <View style={styles.playTopIcons}>
                  <Ionicons name="search" size={11} color="#5F6368" style={{ marginRight: 6 }} />
                  <Ionicons name="ellipsis-vertical" size={11} color="#5F6368" />
                </View>
              </View>

              {/* App Info Header */}
              <View style={styles.playAppHeader}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.playAppIcon}
                  resizeMode="cover"
                />
                <View style={styles.playAppDetails}>
                  <Text style={styles.playAppTitle} numberOfLines={1}>Tera Downloader</Text>
                  <Text style={styles.playAppDev} numberOfLines={1}>Swadesi App Studio</Text>
                  <Text style={styles.playAppMeta} numberOfLines={1}>Contains ads · In-app purchases</Text>
                </View>
              </View>

              {/* Ratings & Downloads Row */}
              <View style={styles.playStatsRow}>
                <View style={styles.playStatItem}>
                  <View style={styles.playRatingWrap}>
                    <Text style={styles.playStatBold}>4.1</Text>
                    <Ionicons name="star" size={8} color="#202124" style={{ marginLeft: 1 }} />
                  </View>
                  <Text style={styles.playStatSub}>87K reviews</Text>
                </View>

                <View style={styles.playStatDivider} />

                <View style={styles.playStatItem}>
                  <View style={styles.playBadgeMb}>
                    <Ionicons name="arrow-down" size={7} color="#5F6368" />
                    <Text style={styles.playBadgeMbText}>12 MB</Text>
                  </View>
                  <Text style={styles.playStatSub}>12 MB</Text>
                </View>

                <View style={styles.playStatDivider} />

                <View style={styles.playStatItem}>
                  <Text style={styles.playStatBold}>1M+</Text>
                  <Text style={styles.playStatSub}>Downloads</Text>
                </View>
              </View>

              {/* Green Install Button */}
              <View style={styles.playInstallBtn}>
                <Text style={styles.playInstallBtnText}>Install on more devices</Text>
              </View>

              {/* Mini Screenshots Carousel Row */}
              <View style={styles.playScreenshotsRow}>
                <View style={[styles.miniScreenCard, { backgroundColor: '#1E3A8A' }]}>
                  <Ionicons name="cloud-download" size={11} color="#93C5FD" />
                  <Text style={styles.miniScreenTitle}>Turbo</Text>
                  <Text style={styles.miniScreenSub}>Downloads</Text>
                </View>
                <View style={[styles.miniScreenCard, { backgroundColor: '#0F172A' }]}>
                  <Ionicons name="flash" size={11} color="#FBBF24" />
                  <Text style={styles.miniScreenTitle}>Blazing</Text>
                  <Text style={styles.miniScreenSub}>Fast Speed</Text>
                </View>
                <View style={[styles.miniScreenCard, { backgroundColor: '#064E3B' }]}>
                  <Ionicons name="shield-checkmark" size={11} color="#34D399" />
                  <Text style={styles.miniScreenTitle}>Secure</Text>
                  <Text style={styles.miniScreenSub}>& Private</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Bottom Half: Curved White Bottom Sheet */}
      <View style={styles.bottomCard}>
        <View style={styles.dragPill} />

        {/* Lock Icon Badge + Login Title & Subtitle */}
        <View style={styles.titleContainer}>
          <View style={styles.lockBadgeWrap}>
            <Ionicons name="lock-closed" size={16} color="#2563EB" />
          </View>
          <Text style={styles.loginTitle}>Login</Text>
          <Text style={styles.subtext}>
            Connect your Google account to unlock full features
          </Text>
        </View>

        {/* Feature Benefits Box */}
        <View style={styles.benefitsCard}>
          <View style={styles.benefitRow}>
            <View style={[styles.benefitIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="flash" size={16} color="#2563EB" />
            </View>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Ultra Fast CDN Speeds</Text>
              <Text style={styles.benefitSub}>Multi-server acceleration with zero waiting</Text>
            </View>
          </View>

          <View style={styles.benefitDivider} />

          <View style={styles.benefitRow}>
            <View style={[styles.benefitIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="play" size={16} color="#16A34A" />
            </View>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Instant 1080p Streaming</Text>
              <Text style={styles.benefitSub}>Watch full HD videos directly in player</Text>
            </View>
          </View>

          <View style={styles.benefitDivider} />

          <View style={styles.benefitRow}>
            <View style={[styles.benefitIconWrap, { backgroundColor: '#FAF5FF' }]}>
              <Ionicons name="cloud-done" size={16} color="#9333EA" />
            </View>
            <View style={styles.benefitTextWrap}>
              <Text style={styles.benefitTitle}>Cloud Sync & History</Text>
              <Text style={styles.benefitSub}>Safely save & access your downloaded links</Text>
            </View>
          </View>
        </View>

        {/* Clean White Google Pill Button (Official Brand Guidelines) */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#1E293B" size="small" />
          ) : (
            <View style={styles.googleContentRow}>
              <Image
                source={require('../../assets/google-g-icon.png')}
                style={styles.googleIconImg}
                resizeMode="contain"
              />
              <Text style={styles.googleBtnLabel}>Sign in with Google</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Trust & Terms */}
        <View style={styles.footerWrap}>
          <View style={styles.trustRow}>
            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
            <Text style={styles.trustText}>100% Safe · Instant 1-Tap Sign In</Text>
          </View>
          <Text style={styles.footerTerms}>
            By continuing, you agree to our <Text style={styles.termsLink}>Terms of Service</Text> & <Text style={styles.termsLink}>Privacy Policy</Text>.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1D4ED8',
  },
  topSection: {
    height: SCREEN_HEIGHT * 0.53,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 46,
    paddingHorizontal: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    top: 60,
    left: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },

  /* Top Header Row with Left Headline & Right Big Logo */
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 2,
    marginBottom: 4,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  welcomeBackText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38BDF8',
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  mainHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 29,
  },
  headingSub: {
    fontSize: 10,
    color: '#BFDBFE',
    marginTop: 4,
    lineHeight: 14,
    maxWidth: 190,
  },
  topRightLogoWrap: {
    alignItems: 'center',
    marginTop: 2,
  },
  topRightLogoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    padding: 5,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  bigBrandLogo: {
    width: 60,
    height: 60,
    borderRadius: 14,
  },
  logoBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginTop: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  logoBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E0E7FF',
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
    marginRight: 4,
  },

  /* Dot Matrix Pattern */
  dotMatrix: {
    marginTop: 8,
    opacity: 0.35,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 3,
  },
  matrixDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },

  /* Middle Illustration Area */
  illustrationContainer: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
    marginTop: 8,
  },

  /* Left Side Feature Items */
  sideFeaturesWrap: {
    width: 140,
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  sideFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  sideTextBox: {
    flex: 1,
  },
  sideTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sideDesc: {
    fontSize: 8,
    color: '#BFDBFE',
    marginTop: 0.5,
  },

  /* Phone Mockup floating from bottom right */
  phoneMockup: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 198,
    height: 252,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 3.5,
    borderColor: '#0F172A',
    paddingHorizontal: 7,
    paddingTop: 5,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
    alignItems: 'center',
    overflow: 'hidden',
  },
  phoneNotch: {
    width: 42,
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    marginBottom: 6,
  },
  phoneInnerContent: {
    width: '100%',
  },

  /* Mini Google Play Store Listing Mockup */
  playTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
    marginBottom: 5,
  },
  playLogoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playLogoText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#202124',
    letterSpacing: -0.2,
    marginLeft: 3,
  },
  playTopIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playAppHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  playAppIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  playAppDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  playAppTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#202124',
    letterSpacing: -0.2,
  },
  playAppDev: {
    fontSize: 7.8,
    fontWeight: '600',
    color: '#01875F',
    marginTop: 0.5,
  },
  playAppMeta: {
    fontSize: 6.2,
    color: '#5F6368',
    marginTop: 0.5,
  },
  playStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 3.5,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#F1F5F9',
    marginBottom: 5,
  },
  playStatItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  playRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playStatBold: {
    fontSize: 8,
    fontWeight: '800',
    color: '#202124',
  },
  playStatSub: {
    fontSize: 5.8,
    color: '#5F6368',
    marginTop: 0.5,
  },
  playBadgeMb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  playBadgeMbText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: '#202124',
  },
  playStatDivider: {
    width: 0.8,
    height: 13,
    backgroundColor: '#E2E8F0',
  },
  playInstallBtn: {
    backgroundColor: '#01875F',
    borderRadius: 12,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
    shadowColor: '#01875F',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  playInstallBtnText: {
    color: '#FFFFFF',
    fontSize: 7.8,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  playScreenshotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  miniScreenCard: {
    flex: 1,
    height: 48,
    borderRadius: 5,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  miniScreenTitle: {
    color: '#FFFFFF',
    fontSize: 6.2,
    fontWeight: '800',
    marginTop: 1.5,
    textAlign: 'center',
  },
  miniScreenSub: {
    color: '#93C5FD',
    fontSize: 5.2,
    textAlign: 'center',
    marginTop: 0.5,
  },

  /* Bottom Curved Login Sheet */
  bottomCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -26,
    zIndex: 10,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 20,
  },
  dragPill: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginBottom: 3,
  },
  titleContainer: {
    alignItems: 'center',
  },
  lockBadgeWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  subtext: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1.5,
    textAlign: 'center',
  },

  /* Benefits Card */
  benefitsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2.5,
  },
  benefitIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 11.8,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  benefitSub: {
    fontSize: 9.8,
    color: '#64748B',
    marginTop: 0.5,
  },
  benefitDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 2.5,
  },

  /* Clean Official White Google Sign-In Button */
  googleBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  googleContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconImg: {
    width: 21,
    height: 21,
    marginRight: 12,
  },
  googleBtnLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.2,
  },

  /* Footer */
  footerWrap: {
    alignItems: 'center',
    width: '100%',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  trustText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
  },
  footerTerms: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 14,
  },
  termsLink: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
