import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { BannerAd, BannerAdSize, RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';
import { colors, radius, spacing } from '../theme';
import { extractTeraboxUrl, resolveTeraboxLink, trackActivity } from '../services/api';
import { getSettings, getHistory, addHistoryItem } from '../services/storage';
import ShareSheet from '../components/ShareSheet';
import SubscriptionModal from '../components/SubscriptionModal';
import { checkAndPromptInAppReview } from '../services/storeReview';
import { getStoredUser, fetchFreshUserStatus, checkIsPremium } from '../services/authService';
import PlayerScreen from './PlayerScreen';
import {
  startDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  addDownloadListener,
  removeDownloadListener,
} from '../services/downloadManager';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);

  // State to track the active download from downloadManager
  const [activeDownloadId, setActiveDownloadId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);
  const [showMirrors, setShowMirrors] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [bannerAdLoaded, setBannerAdLoaded] = useState(false);
  const [topBannerAdLoaded, setTopBannerAdLoaded] = useState(false);

  // User Auth & Subscription Modal states
  const [user, setUser] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const isPremiumUser = checkIsPremium(user);

  useEffect(() => {
    if (isFocused) {
      (async () => {
        const stored = await getStoredUser();
        setUser(stored || null);
        if (stored && stored.email) {
          const fresh = await fetchFreshUserStatus(stored.email);
          if (fresh) setUser(fresh);
        }
      })();
    }
  }, [isFocused]);

  // In-app video player state
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerSource, setPlayerSource] = useState(null); // { url, headers }
  const [playerName, setPlayerName] = useState(null);

  // Reference for rewarded interstitial
  const rewardedInterstitialRef = useRef(null);

  useEffect(() => {
    if (isPremiumUser) {
      setAdLoaded(false);
      return;
    }
    rewardedInterstitialRef.current = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED, {});

    const unsubscribeLoaded = rewardedInterstitialRef.current.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        console.log('Rewarded Interstitial Ad loaded.');
        setAdLoaded(true);
      }
    );

    const unsubscribeEarned = rewardedInterstitialRef.current.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        console.log('User earned reward of ', reward);
      }
    );

    const unsubscribeClosed = rewardedInterstitialRef.current.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setAdLoaded(false);
        console.log('Rewarded Interstitial Ad closed, pre-loading next one...');
        rewardedInterstitialRef.current.load();
      }
    );

    rewardedInterstitialRef.current.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
    };
  }, [isPremiumUser]);
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [timeRemaining, setTimeRemaining] = useState('--');
  const [bytesWritten, setBytesWritten] = useState('0 MB');
  const [totalBytes, setTotalBytes] = useState('0 MB');

  useEffect(() => {
    loadSettings();
    const unsub = navigation.addListener('focus', loadSettings);
    return unsub;
  }, [navigation]);

  async function loadSettings() {
    const s = await getSettings();
    setSettings(s);
  }

  // Real-time listener for the active download ID
  useEffect(() => {
    if (activeDownloadId) {
      const handleUpdate = (update) => {
        if (update.status === 'downloaded') {
          setProgress(1);
          setDownloading(false);
          setActiveDownloadId(null);
          Alert.alert('Download Complete', 'File downloaded successfully.');
          checkAndPromptInAppReview();
        } else if (update.status === 'failed') {
          setError(update.error || 'Download failed.');
          setDownloading(false);
          setActiveDownloadId(null);
        } else if (update.status === 'cancelled') {
          setDownloading(false);
          setActiveDownloadId(null);
          setProgress(0);
        } else if (update.status === 'paused') {
          setIsPaused(true);
        } else if (update.status === 'downloading') {
          setIsPaused(false);
          setProgress(update.progress || 0);
          setDownloadSpeed(update.downloadSpeed || '0 KB/s');
          setTimeRemaining(update.timeRemaining || '--');
          setBytesWritten(update.bytesWritten || '0 MB');
          setTotalBytes(update.totalBytes || '0 MB');
        }
      };

      addDownloadListener(activeDownloadId, handleUpdate);
      return () => removeDownloadListener(activeDownloadId, handleUpdate);
    }
  }, [activeDownloadId]);

  async function pasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setInput(text);
      setError('');
    }
  }

  function validate() {
    const url = extractTeraboxUrl(input);
    if (!url) {
      setError('Invalid share link. Please paste a valid TeraBox link.');
      return null;
    }
    setError('');
    return url;
  }

  const showAdBeforeAction = (actionCallback) => {
    if (isPremiumUser || !rewardedInterstitialRef.current) {
      actionCallback();
      return;
    }

    if (adLoaded) {
      try {
        console.log('[HomeScreen] Showing Rewarded Ad before button action...');
        const unsubClose = rewardedInterstitialRef.current.addAdEventListener(
          AdEventType.CLOSED,
          () => {
            unsubClose();
            setAdLoaded(false);
            rewardedInterstitialRef.current?.load();
            actionCallback();
          }
        );
        rewardedInterstitialRef.current.show();
        return;
      } catch (err) {
        console.log('[HomeScreen] Failed to show rewarded ad:', err);
      }
    }
    actionCallback();
  };

  async function handleResolve() {
    const url = validate();
    if (!url) return;

    // Show rewarded ad first ONLY for free users if available, then resolve
    if (!isPremiumUser && rewardedInterstitialRef.current) {
      if (adLoaded) {
        // Condition 1: Ad is ALREADY loaded -> Show immediately with 0 delay
        try {
          console.log('Showing Rewarded Ad immediately before resolve...');
          const unsubClose = rewardedInterstitialRef.current.addAdEventListener(
            AdEventType.CLOSED,
            () => {
              unsubClose();
              setAdLoaded(false);
              rewardedInterstitialRef.current?.load(); // preload next
              doResolve(url);
            }
          );
          rewardedInterstitialRef.current.show();
          return; // wait for ad to close
        } catch (err) {
          console.log('Failed to show rewarded ad:', err);
        }
      } else {
        // Condition 2: Ad is NOT loaded yet -> Show spinner & wait up to 2.5s for ad load
        console.log('Ad not loaded yet, waiting up to 2.5s for ad load...');
        setParsing(true);

        const isAdShowAttempted = { current: false };

        const waitForAdPromise = new Promise((resolve) => {
          let timeoutId = null;
          let unsubLoaded = null;

          const finish = (wasLoaded) => {
            if (isAdShowAttempted.current) return;
            isAdShowAttempted.current = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (unsubLoaded) unsubLoaded();
            resolve(wasLoaded);
          };

          unsubLoaded = rewardedInterstitialRef.current.addAdEventListener(
            RewardedAdEventType.LOADED,
            () => {
              console.log('Rewarded Ad loaded during 2.5s wait window!');
              setAdLoaded(true);
              finish(true);
            }
          );

          timeoutId = setTimeout(() => {
            console.log('1.2s wait window expired for Rewarded Ad. Proceeding with resolve...');
            finish(false);
          }, 1200);
        });

        const adLoadedInTime = await waitForAdPromise;

        if (adLoadedInTime && rewardedInterstitialRef.current) {
          try {
            console.log('Showing Rewarded Ad after 2.5s wait window...');
            const unsubClose = rewardedInterstitialRef.current.addAdEventListener(
              AdEventType.CLOSED,
              () => {
                unsubClose();
                setAdLoaded(false);
                rewardedInterstitialRef.current?.load(); // preload next
                doResolve(url);
              }
            );
            rewardedInterstitialRef.current.show();
            return; // wait for ad to close
          } catch (err) {
            console.log('Failed to show rewarded ad after wait:', err);
          }
        }
      }
    }
    // Direct resolve if premium or ad failed to load within 2.5s
    await doResolve(url);
  }

  async function doResolve(url) {
    setParsing(true);
    setResult(null);
    setError('');
    // Reset all download UI states for the new file
    setDownloading(false);
    setProgress(0);
    setDownloadSpeed('0 KB/s');
    setTimeRemaining('--');
    setBytesWritten('0 MB');
    setActiveDownloadId(null);
    setIsPaused(false);

    try {
      const s = settings || await getSettings();
      const data = await resolveTeraboxLink(s.apiBaseUrl, url, s.downloadQuality, isPremiumUser);
      const firstResult = (data.list && data.list.length > 0) 
        ? {
            ...data.list[0],
            dlink: data.list[0].dlink || data.list[0].download_url || data.downloadUrl || '',
            download_url: data.list[0].download_url || data.list[0].dlink || data.downloadUrl || '',
            stream_url: data.stream_url || data.list[0].stream_url || '',
            downloadHeaders: data.downloadHeaders || data.list[0].downloadHeaders || {},
          }
        : {
            name: data.name || 'video.mp4',
            size: data.size || 'Unknown',
            thumbnail: data.thumbnail || '',
            dlink: data.downloadUrl || data.dlink || '',
            download_url: data.downloadUrl || data.dlink || '',
            stream_url: data.stream_url || '',
            downloadHeaders: data.downloadHeaders || {},
          };

      if (!firstResult.dlink && !firstResult.download_url) {
        throw new Error('Could not find any files for this link.');
      }

      console.log("[Resolve] Successfully resolved file:", firstResult.name);
      setResult(firstResult);

      // Save resolved link item to history with thumbnail and filename
      try {
        await addHistoryItem({
          name: firstResult.name,
          size: firstResult.size,
          thumbnail: firstResult.thumbnail || '',
          url: url,
          dlink: firstResult.dlink,
          stream_url: firstResult.stream_url,
          status: 'resolved',
        });
      } catch (histErr) {
        console.log('Failed to auto-save history:', histErr.message);
      }
    } catch (e) {
      setError(e.message || 'Failed to resolve link. Please try again.');
    } finally {
      setParsing(false);
    }
  }


  async function handleDownload() {
    console.log("[Download] Clicked! Current Result:", JSON.stringify(result));
    if (!result || !result.dlink) return;

    // Already downloading — show alert
    if (downloading) {
      Alert.alert(
        '⏳ Download In Progress',
        'A file is already being downloaded. Please wait for it to finish.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    try {
      const history = await getHistory();
      const existing = history.find(item => item.name === result.name);
      if (existing) {
        if (existing.status === 'downloading') {
          Alert.alert(
            '⏳ Already Downloading',
            'This file is already being downloaded.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        } else if (existing.status === 'downloaded') {
          Alert.alert(
            '✅ Already Downloaded',
            'This file has already been downloaded. Do you want to download it again?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Download Again', onPress: () => triggerDownloadWithAd() }
            ]
          );
          return;
        }
      }
    } catch (e) {
      console.log("Error checking history:", e);
    }



    await triggerDownloadWithAd();

    async function triggerDownloadWithAd() {
      showAdBeforeAction(proceedWithDownload);
    }

    async function proceedWithDownload() {
      setDownloading(true);
      setIsPaused(false);
      setProgress(0);
      setDownloadSpeed('0 KB/s');
      setTimeRemaining('--');
      setBytesWritten('0 MB');
      setTotalBytes(result.size || 'Unknown');

      try {
        const id = await startDownload(
          result.name,
          result.dlink,
          result.size,
          result.thumbnail || '',
          result.downloadHeaders || {}
        );
        setActiveDownloadId(id);

        // Track download in database
        const isVideo = /\.(mp4|mkv|avi|mov|webm|flv|mp3|wav)$/i.test(result.name || '');
        const trackType = isVideo ? 'stream' : 'download';
        const s = settings || await getSettings();
        if (s && s.apiBaseUrl) {
          trackActivity(s.apiBaseUrl, trackType).catch(e => console.log('Track activity failed:', e.message));
        }
      } catch (e) {
        setError('Download failed: ' + e.message);
        setDownloading(false);
      }
    }
  }

  async function handleWatch() {
    if (!result) return;

    async function openPlayer() {
      const s = settings || await getSettings();
      if (s && s.apiBaseUrl) {
        trackActivity(s.apiBaseUrl, 'stream').catch(() => {});
      }

      console.log('=== [WATCH PRESSED] ===');
      console.log('[Watch Debug] result.stream_url:', result.stream_url ? result.stream_url.substring(0, 80) + '...' : 'EMPTY');
      console.log('[Watch Debug] result.downloadUrl:', result.downloadUrl ? result.downloadUrl.substring(0, 80) + '...' : 'EMPTY');
      console.log('[Watch Debug] result.dlink:', result.dlink ? result.dlink.substring(0, 80) + '...' : 'EMPTY');

      const rawStreamUrl = result.stream_url || '';
      let playUrl = '';

      // Priority 1: Valid M3U8/HLS stream_url from API
      if (rawStreamUrl.startsWith('http')) {
        playUrl = rawStreamUrl;
        console.log('[Watch] Using stream_url directly');
      }
      // Priority 2: Base64 encoded M3U8 data
      else if (rawStreamUrl.startsWith('data:')) {
        try {
          const base64Data = rawStreamUrl.includes(',') ? rawStreamUrl.split(',')[1] : rawStreamUrl;
          const localM3u8Uri = FileSystem.cacheDirectory + 'playlist.m3u8';
          await FileSystem.writeAsStringAsync(localM3u8Uri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          console.log('[Watch Success] Successfully created local HLS playlist:', localM3u8Uri);
          playUrl = localM3u8Uri;
        } catch (err) {
          console.error('[Watch Error] Failed to write local M3U8 file:', err.message);
        }
      }
      // Priority 3: Direct dlink from API
      else if (result.dlink && result.dlink.startsWith('http')) {
        playUrl = result.dlink;
        console.log('[Watch] Using dlink directly from API');
      }
      // Priority 4: downloadUrl fallback
      else if (result.downloadUrl && result.downloadUrl.startsWith('http')) {
        playUrl = result.downloadUrl;
        console.log('[Watch] Fallback: Using downloadUrl directly from API');
      }

      if (!playUrl) {
        console.error('[Watch Error] No playable URL found in result object!');
        Alert.alert('Error', 'No playable URL found for this video.');
        return;
      }

      console.log('[Watch Success] Selected playUrl:', playUrl);

      // Do NOT pass downloadHeaders when playing through proxy (download.php) or direct TeraBox CDN (d8.freeterabox.com).
      const isProxyOrCdnUrl = playUrl.includes('download.php') || playUrl.includes('freeterabox.com') || playUrl.includes('1024terabox.com/file/') || playUrl.includes('bkt=');
      const headers = isProxyOrCdnUrl ? {} : (result.downloadHeaders || {});
      let secondaryFallbackUrl = '';
      if (playUrl !== result.dlink && result.dlink && result.dlink.startsWith('http')) {
        secondaryFallbackUrl = result.dlink;
      } else if (playUrl !== result.downloadUrl && result.downloadUrl && result.downloadUrl.startsWith('http')) {
        secondaryFallbackUrl = result.downloadUrl;
      }

      setPlayerSource({ url: playUrl, fallbackUrl: secondaryFallbackUrl, headers });
      setPlayerName(result.name || 'Video');
      setPlayerVisible(true);
    }

    showAdBeforeAction(openPlayer);
  }

  const handleOpenTelegram = async () => {
    const openTg = async () => {
      try {
        const rawUrl = result?.shareUrl || input.trim();
        let shortcode = '';
        const match = rawUrl.match(/\/s\/([\w-]+)/) || rawUrl.match(/surl=([\w-]+)/);
        if (match && match[1]) {
          shortcode = match[1];
        } else {
          shortcode = encodeURIComponent(rawUrl);
        }

        const botUsername = 'teraboxdownloader2027_bot';
        const tgUrl = `https://t.me/${botUsername}?start=app_${shortcode}`;

        await Linking.openURL(tgUrl).catch((e) => {
          console.error('Failed to open Telegram URL:', e);
        });
      } catch (err) {
        console.error('Error in handleOpenTelegram:', err);
      }
    };

    showAdBeforeAction(openTg);
  };

  async function handlePause() {
    if (activeDownloadId) {
      await pauseDownload(activeDownloadId);
      setIsPaused(true);
    }
  }

  async function handleResume() {
    if (activeDownloadId) {
      setIsPaused(false);
      await resumeDownload(activeDownloadId);
    }
  }

  async function handleCancel() {
    if (activeDownloadId) {
      await cancelDownload(activeDownloadId);
    }
  }

  const canResolve = input.trim().length > 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#E5F2FF', '#F1E5FF']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Royal Blue Top Header Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, height: 62 + insets.top }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.headerProfileBtn} onPress={() => navigation.navigate('Settings')}>
          {user && user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.headerAvatarImg} />
          ) : (
            <View style={styles.headerAvatarCircle}>
              <Ionicons name={user ? "person" : "person-circle"} size={22} color="#FFFFFF" />
            </View>
          )}
          {user && (user.premiumStatus === 'premium' || (user.plan && user.plan !== 'free')) && (
            <View style={styles.headerCrownBadge}>
              <Ionicons name="star" size={8} color="#FFFFFF" />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Terabox Downloader</Text>
        <View style={styles.headerRightActions}>
          {!isPremiumUser && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.headerVipBtn}
              onPress={() => setShowSubscriptionModal(true)}
            >
              <Ionicons name="sparkles" size={13} color="#F59E0B" />
              <Text style={styles.headerVipText}>VIP</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.7} style={styles.headerIconBtn} onPress={() => setShowShareSheet(true)}>
            <Ionicons name="share-social-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Glassmorphic main downloader card */}
          <View style={styles.mainCard}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Paste your video or file link here..."
                placeholderTextColor="#7C8BA1"
                value={input}
                onChangeText={(val) => {
                  setInput(val);
                  if (error) setError('');
                }}
                multiline
                numberOfLines={2}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Instructions tip */}
            <View style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={16} color="#6366F1" />
              <Text style={styles.tipText}>
                Paste any link above and tap Get Files to download instantly.
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.pasteButton}
                onPress={pasteFromClipboard}
                activeOpacity={0.8}
              >
                <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
                <Text style={styles.pasteButtonText}>Paste</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.getFilesButtonWrap, !canResolve && styles.disabledBtn]}
                onPress={handleResolve}
                disabled={!canResolve || parsing}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={canResolve ? ['#6366F1', '#4F46E5'] : ['#A5B4FC', '#818CF8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.getFilesGradient}
                >
                  {parsing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.getFilesText}>Get Files</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* Banner Ad 2 - Placed above Supported TeraBox Formats (Disabled for Premium Users) */}
          {!isPremiumUser && (
            <View style={[styles.bannerAdContainer, { marginVertical: 8, borderRadius: 8 }]}>
              <BannerAd
                unitId={AD_UNIT_IDS.BANNER_2}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                onAdLoaded={() => setTopBannerAdLoaded(true)}
                onAdFailedToLoad={(error) => {
                  console.log('Top Banner Ad failed to load:', error.message);
                }}
              />
            </View>
          )}

          {/* Supported Domains collapsible section */}
          <View style={styles.mirrorsCard}>
            <TouchableOpacity 
              style={styles.mirrorsHeader} 
              onPress={() => setShowMirrors(!showMirrors)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.mirrorsTitle}>Supported TeraBox Formats</Text>
              </View>
              <Ionicons 
                name={showMirrors ? "chevron-up" : "chevron-down"} 
                size={18} 
                color="#64748B" 
              />
            </TouchableOpacity>

            {showMirrors && (
              <View style={styles.mirrorsGrid}>
                {[
                  'terabox.com',
                  '1024tera.com',
                  'teraboxapp.com',
                  'mirrobox.com',
                  'nephobox.com',
                  '4funbox.co',
                  'freeterabox.com',
                  'tibibox.com',
                  'momerybox.com'
                ].map((domain) => (
                  <View key={domain} style={styles.mirrorItem}>
                    <Ionicons name="checkmark" size={14} color="#10B981" />
                    <Text style={styles.mirrorText} numberOfLines={1}>{domain}</Text>
                  </View>
                ))}
                <Text style={styles.mirrorsSubtext}>
                  ✓ Works with all official domains and regional mirror sites.
                </Text>
              </View>
            )}
          </View>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Premium Resolved Result Card / Downloader Card matching mockup */}
          {result && !parsing ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                {result.thumbnail ? (
                  <Image source={{ uri: result.thumbnail }} style={styles.thumbnailImage} />
                ) : (
                  <View style={styles.resultIconWrap}>
                    <Ionicons name="videocam" size={24} color="#3B82F6" />
                  </View>
                )}
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={2}>
                    {result.name}
                  </Text>
                  {downloading ? (
                    <View style={styles.statusPillRow}>
                      <View style={styles.statusPill}>
                        <Ionicons name="cloud-download-outline" size={12} color="#1E3A8A" />
                        <Text style={styles.statusPillText}>
                          {isPaused ? 'Paused' : 'Downloading'}
                        </Text>
                      </View>
                      <Text style={styles.totalSizeText}>{totalBytes}</Text>
                    </View>
                  ) : (
                    <Text style={styles.resultSize}>{result.size}</Text>
                  )}
                </View>
              </View>

              {downloading ? (
                <View style={styles.progressContainer}>
                  {/* Speed and Time remaining badges */}
                  <View style={styles.statsBadgesRow}>
                    <View style={styles.statBadge}>
                      <Ionicons name="speedometer-outline" size={14} color="#2563EB" />
                      <Text style={styles.statBadgeText}>{downloadSpeed}</Text>
                    </View>
                    <View style={styles.statBadge}>
                      <Ionicons name="time-outline" size={14} color="#2563EB" />
                      <Text style={styles.statBadgeText}>{timeRemaining}</Text>
                    </View>
                  </View>

                  {/* Progress numeric indicators */}
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressBytesText}>
                      {bytesWritten} / {totalBytes}
                    </Text>
                    <Text style={styles.progressPercentText}>
                      {Math.round(progress * 100)}%
                    </Text>
                  </View>

                  {/* Clean progress bar */}
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>

                  {/* Action controls: Pause/Resume and Cancel */}
                  <View style={styles.controlButtonsRow}>
                    {isPaused ? (
                      <TouchableOpacity
                        style={[styles.controlBtn, styles.pauseBtn]}
                        onPress={handleResume}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="play-outline" size={18} color="#2563EB" />
                        <Text style={styles.controlBtnTextBlue}>Resume</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.controlBtn, styles.pauseBtn]}
                        onPress={handlePause}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="pause-outline" size={18} color="#2563EB" />
                        <Text style={styles.controlBtnTextBlue}>Pause</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.controlBtn, styles.cancelBtn]}
                      onPress={handleCancel}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-outline" size={18} color="#EF4444" />
                      <Text style={styles.controlBtnTextRed}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.actionBtnsContainer}>
                  <View style={styles.actionBtnsRow}>
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={handleDownload}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.downloadBtnText}>Download File</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.watchBtn}
                      onPress={handleWatch}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play-circle-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.watchBtnText}>Watch</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.telegramBtn}
                    onPress={handleOpenTelegram}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.telegramBtnText}>Get in Telegram</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}


        </ScrollView>
      </KeyboardAvoidingView>

      <ShareSheet visible={showShareSheet} onClose={() => setShowShareSheet(false)} />

      <PlayerScreen
        visible={playerVisible}
        url={playerSource?.url}
        fallbackUrl={playerSource?.fallbackUrl}
        headers={playerSource?.headers}
        name={playerName}
        onClose={() => setPlayerVisible(false)}
        isPremium={isPremiumUser}
      />



      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        user={user}
        onPaymentSuccess={async (email) => {
          const fresh = await fetchFreshUserStatus(email);
          if (fresh) setUser(fresh);
          setShowSubscriptionModal(false);
          Alert.alert('🎉 Premium Activated!', 'Your plan is now active on both App & Website!');
        }}
      />

      {/* Banner Ad - Disabled for Premium Users */}
      {!isPremiumUser && (
        <View style={styles.bannerAdContainer}>
          <BannerAd
            unitId={AD_UNIT_IDS.BANNER_1}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            onAdLoaded={() => setBannerAdLoaded(true)}
            onAdFailedToLoad={(error) => {
              console.log('Banner Ad failed to load:', error.message);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  flex: {
    flex: 1,
  },
  topBar: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerVipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  headerVipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  headerIconBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerProfileBtn: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerCrownBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#F59E0B',
    borderRadius: 7,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  customMenuIcon: {
    width: 22,
    height: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuBarLong: {
    width: 22,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.25,
  },
  menuBarShort: {
    width: 14,
    height: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.25,
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 28,
    height: 28,
    marginRight: 8,
    borderRadius: 6,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  mainCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 20,
    padding: spacing.md,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    marginBottom: spacing.md,
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  input: {
    fontSize: 14,
    color: '#1E293B',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginLeft: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(238, 242, 255, 0.7)',
    borderRadius: 8,
    padding: 8,
    marginBottom: spacing.md,
  },
  tipText: {
    fontSize: 12,
    color: '#4F46E5',
    marginLeft: 6,
    flex: 1,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 10,
  },
  pasteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 4,
  },
  getFilesButtonWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  getFilesGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  getFilesText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  thumbnailImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    marginRight: spacing.md,
    backgroundColor: '#F1F5F9',
  },
  resultIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  resultSize: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 8,
  },
  statusPillText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  totalSizeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    marginRight: 8,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  watchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 12,
    marginLeft: 8,
  },
  watchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  actionBtnsContainer: {
    marginTop: 4,
  },
  actionBtnsRow: {
    flexDirection: 'row',
  },
  telegramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0088cc',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  telegramBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  progressContainer: {
    marginTop: spacing.xs,
  },
  statsBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  statBadgeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  progressTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBytesText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  progressPercentText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: '#2563EB',
  },
  controlButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pauseBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  cancelBtn: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEE2E2',
    marginLeft: 8,
  },
  controlBtnTextBlue: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  controlBtnTextRed: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  adCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  adBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  adBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight: 6,
  },
  adBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  adLabel: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '600',
  },
  adContent: {
    alignItems: 'center',
  },
  adMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  adLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  adInfo: {
    flex: 1,
  },
  adTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  adSubtitleText: {
    color: '#4B5563',
    fontSize: 11,
    marginTop: 2,
  },
  adImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  adPlaceholderText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  adInstallBtn: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adInstallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerAdContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 4,
  },
  mirrorsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  mirrorsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mirrorsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  mirrorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  mirrorItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  mirrorText: {
    fontSize: 11,
    color: '#334155',
    marginLeft: 6,
    fontWeight: '500',
  },
  mirrorsSubtext: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 6,
    width: '100%',
    textAlign: 'center',
  },
});
