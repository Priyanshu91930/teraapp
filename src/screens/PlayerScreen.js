import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { lockAsync, unlockAsync, OrientationLock } from 'expo-screen-orientation';
import { RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';
import { AD_UNIT_IDS } from '../services/adConfig';

function formatTime(secs) {
  if (!secs || isNaN(secs) || secs < 0) return '0:00';
  const t = Math.floor(secs);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function InnerPlayer({ url, fallbackUrl, name, headers, onClose, isPremium }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [activeUrl, setActiveUrl] = useState(url);

  // Stable initial source object for useVideoPlayer to prevent native re-initialization crashes
  const initialSource = useMemo(() => {
    const obj = { uri: url };
    if (headers && Object.keys(headers).length > 0) {
      obj.headers = headers;
    }
    return obj;
  }, [url]);

  const player = useVideoPlayer(initialSource, (p) => {
    if (!p) return;
    console.log('[Player] Stable useVideoPlayer instance initialized');
    p.playbackRate = 1.0;
    p.loop = false;
    try {
      p.play();
    } catch (e) {
      console.log('[Player] Native play exception:', e.message);
    }
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player ? player.playing : false });
  const { status } = useEvent(player, 'statusChange', { status: player ? player.status : 'idle' });

  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [contentFit, setContentFit] = useState('contain');
  const [trackWidth, setTrackWidth] = useState(0);

  const [videoCompleteAdLoaded, setVideoCompleteAdLoaded] = useState(false);
  const [playerCloseAdLoaded, setPlayerCloseAdLoaded] = useState(false);
  const videoCompleteShownRef = useRef(false);
  const videoCompleteAdRef = useRef(null);
  const playerCloseAdRef = useRef(null);

  const hideTimerRef = useRef(null);

  // Dynamically switch sources via player.replace() when activeUrl changes (e.g., fallback failover)
  useEffect(() => {
    if (player && activeUrl && activeUrl !== url) {
      console.log('[Player] Replacing stream with fallback source:', activeUrl.substring(0, 80));
      const nextSource = { uri: activeUrl };
      if (headers && Object.keys(headers).length > 0) {
        nextSource.headers = headers;
      }
      try {
        if (player.replaceAsync) {
          player.replaceAsync(nextSource);
        } else if (player.replace) {
          player.replace(nextSource);
        }
      } catch (err) {
        console.error('[Player] Source replace failed:', err.message);
      }
    }
  }, [player, activeUrl, headers, url]);

  const [hasFatalError, setHasFatalError] = useState(false);

  // Handle status changes and trigger auto-failover on stream error
  useEffect(() => {
    console.log('[PLAYER] statusChange:', status, '| dur:', player ? player.duration : 0);
    if (status === 'readyToPlay' && player && player.duration > 0) {
      setDuration(player.duration);
      setHasFatalError(false);
    }
    if (status === 'error') {
      const errDetails = player && player.error ? (player.error.message || player.error.code || JSON.stringify(player.error)) : 'unknown';

      if (activeUrl !== fallbackUrl && fallbackUrl) {
        console.log('[PLAYER] Stream auto-switching to fallback URL:', fallbackUrl.substring(0, 80));
        setActiveUrl(fallbackUrl);
      } else {
        console.log('[PLAYER] Transient error state encountered:', errDetails);
      }
    }
  }, [status, player, activeUrl, fallbackUrl]);

  // Grace timer: Only set hasFatalError = true if error persists for > 2 seconds
  useEffect(() => {
    let timer;
    if (status === 'error' && (activeUrl === fallbackUrl || !fallbackUrl)) {
      timer = setTimeout(() => {
        if (status === 'error') {
          console.log('[PLAYER] Fatal playback error confirmed after grace period');
          setHasFatalError(true);
        }
      }, 2000);
    } else {
      setHasFatalError(false);
    }
    return () => clearTimeout(timer);
  }, [status, activeUrl, fallbackUrl]);

  // Video Complete Rewarded Ad (Disabled for Premium users)
  useEffect(() => {
    if (isPremium) return;
    let completeAd = null;
    let timer = setTimeout(() => {
      try {
        completeAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.VIDEO_COMPLETE, {
          requestNonPersonalizedAdsOnly: true,
        });
        videoCompleteAdRef.current = completeAd;

        completeAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          console.log('[AdMob] Video Complete Rewarded Ad loaded.');
          setVideoCompleteAdLoaded(true);
        });
        completeAd.addAdEventListener(AdEventType.CLOSED, () => {
          setVideoCompleteAdLoaded(false);
        });
        completeAd.addAdEventListener(AdEventType.ERROR, () => {
          setVideoCompleteAdLoaded(false);
        });
        completeAd.load();
      } catch (err) {
        console.log('[AdMob] Video Complete Ad init error:', err.message);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [isPremium]);

  const isClosingRef = useRef(false);

  // Player Close Rewarded Ad (Disabled for Premium users)
  useEffect(() => {
    if (isPremium) return;
    let closeAd = null;
    let timer = setTimeout(() => {
      try {
        closeAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.PLAYER_CLOSE, {
          requestNonPersonalizedAdsOnly: true,
        });
        playerCloseAdRef.current = closeAd;

        closeAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
          console.log('[AdMob] Player Close Rewarded Ad loaded.');
          setPlayerCloseAdLoaded(true);
        });
        closeAd.addAdEventListener(AdEventType.CLOSED, () => {
          if (isClosingRef.current) {
            onClose();
          }
        });
        closeAd.addAdEventListener(AdEventType.ERROR, () => {});
        closeAd.load();
      } catch (err) {
        console.log('[AdMob] Close Ad init error:', err.message);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [onClose, isPremium]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback((delay = 5000) => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, delay);
  }, [clearHideTimer]);

  // Timeline & Video Completion Ad Trigger
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (player) {
        const cur = player.currentTime || 0;
        const dur = player.duration || duration || 0;
        setCurrentTime(cur);

        if (dur > 0 && duration === 0) {
          setDuration(dur);
        }

        if (dur > 0 && cur >= dur - 0.8 && !videoCompleteShownRef.current) {
          videoCompleteShownRef.current = true;
          if (videoCompleteAdRef.current && videoCompleteAdLoaded) {
            try {
              player.pause();
              setShowControls(true);
              videoCompleteAdRef.current.show();
            } catch (err) {
              console.log('[AdMob] Failed to show video complete ad:', err.message);
            }
          }
        }

        if (dur > 0 && cur < dur - 2.0 && videoCompleteShownRef.current) {
          videoCompleteShownRef.current = false;
        }
      }
    }, 250);
    return () => clearInterval(intervalId);
  }, [player, duration, videoCompleteAdLoaded]);

  useEffect(() => {
    if (isPlaying) {
      startHideTimer(5000);
    } else {
      clearHideTimer();
      setShowControls(true);
    }
  }, [isPlaying, startHideTimer, clearHideTimer]);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  const toggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next && isPlaying) {
        startHideTimer(5000);
      } else {
        clearHideTimer();
      }
      return next;
    });
  }, [isPlaying, startHideTimer, clearHideTimer]);

  const handlePlayPause = useCallback(() => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
      clearHideTimer();
      setShowControls(true);
    } else {
      if (duration > 0 && currentTime >= duration - 0.5) {
        player.currentTime = 0;
        setCurrentTime(0);
        videoCompleteShownRef.current = false;
      }
      player.play();
      setShowControls(true);
      startHideTimer(5000);
    }
  }, [player, isPlaying, duration, currentTime, startHideTimer, clearHideTimer]);

  const handleSeek = useCallback((offset) => {
    if (!player) return;
    const cur = player.currentTime || currentTime || 0;
    const target = Math.max(0, Math.min(duration || 999999, cur + offset));
    player.currentTime = target;
    setCurrentTime(target);
    setShowControls(true);
    if (target < (duration || 999999) - 2) {
      videoCompleteShownRef.current = false;
    }
    if (isPlaying) {
      startHideTimer(5000);
    }
  }, [player, duration, currentTime, isPlaying, startHideTimer]);

  const handleTimelinePress = useCallback((e) => {
    if (!player || trackWidth <= 0 || duration <= 0) return;
    const { locationX } = e.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const targetTime = ratio * duration;
    player.currentTime = targetTime;
    setCurrentTime(targetTime);
    setShowControls(true);
    if (targetTime < duration - 2) {
      videoCompleteShownRef.current = false;
    }
    if (isPlaying) {
      startHideTimer(5000);
    }
  }, [player, trackWidth, duration, isPlaying, startHideTimer]);

  const toggleSpeed = useCallback(() => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (player) player.playbackRate = nextSpeed;
    setShowControls(true);
    if (isPlaying) {
      startHideTimer(5000);
    }
  }, [player, playbackSpeed, isPlaying, startHideTimer]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (player) player.muted = next;
      setShowControls(true);
      if (isPlaying) startHideTimer(5000);
      return next;
    });
  }, [player, isPlaying, startHideTimer]);

  const toggleContentFit = useCallback(() => {
    setContentFit((prev) => {
      const next = prev === 'contain' ? 'cover' : 'contain';
      setShowControls(true);
      if (isPlaying) startHideTimer(5000);
      return next;
    });
  }, [isPlaying, startHideTimer]);

  const toggleOrientation = useCallback(async () => {
    setShowControls(true);
    try {
      console.log('[ScreenOrientation] Toggling orientation. isLandscape:', isLandscape);
      if (isLandscape) {
        await lockAsync(OrientationLock.PORTRAIT_UP);
      } else {
        await lockAsync(OrientationLock.LANDSCAPE_LEFT);
      }
    } catch (err) {
      console.log('[ScreenOrientation] Primary lock error:', err.message);
      try {
        if (isLandscape) {
          await unlockAsync();
        } else {
          await lockAsync(OrientationLock.LANDSCAPE);
        }
      } catch (err2) {
        console.log('[ScreenOrientation] Fallback lock error:', err2.message);
      }
    }
    if (isPlaying) startHideTimer(5000);
  }, [isLandscape, isPlaying, startHideTimer]);

  useEffect(() => {
    return () => {
      try {
        unlockAsync();
      } catch (e) {}
    };
  }, []);

  const handleClose = useCallback(() => {
    clearHideTimer();
    isClosingRef.current = true;
    if (player) player.pause();

    try {
      unlockAsync();
    } catch (e) {}

    if (playerCloseAdRef.current && playerCloseAdLoaded) {
      try {
        playerCloseAdRef.current.show();
        return;
      } catch (err) {
        console.log('[AdMob] Error showing close ad:', err.message);
      }
    }
    onClose();
  }, [player, clearHideTimer, playerCloseAdLoaded, onClose]);

  const handleRetry = useCallback(() => {
    if (player) {
      const source = { uri: activeUrl };
      if (headers && Object.keys(headers).length > 0) {
        source.headers = headers;
      }
      if (player.replaceAsync) {
        player.replaceAsync(source);
      } else if (player.replace) {
        player.replace(source);
      }
    }
  }, [player, activeUrl, headers]);

  const isLoading = (status === 'loading' || status === 'idle') && duration === 0;
  const isError = hasFatalError;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View style={st.root}>
      <StatusBar hidden />

      <VideoView
        player={player}
        style={st.videoView}
        contentFit={contentFit}
        nativeControls={false}
        surfaceType="textureView"
        pointerEvents="none"
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
      />

      <TouchableOpacity
        activeOpacity={1}
        style={[
          st.touchOverlay,
          { backgroundColor: showControls ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.001)' }
        ]}
        onPress={toggleControls}
      />

      {showControls && !isError && (
        <View
          pointerEvents="box-none"
          style={[
            st.topBar,
            {
              paddingTop: isLandscape ? 12 : Math.max(insets.top, 24) + 6,
              paddingHorizontal: isLandscape ? Math.max(insets.left, insets.right, 24) : 16
            }
          ]}
        >
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={st.iconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={st.title} numberOfLines={1}>{name || 'Playing Video'}</Text>
        </View>
      )}

      {showControls && !isError && (
        <View
          pointerEvents="box-none"
          style={[
            st.bottomContainer,
            {
              paddingBottom: isLandscape ? 16 : Math.max(insets.bottom, 16) + 12,
              paddingHorizontal: isLandscape ? Math.max(insets.left, insets.right, 24) : 16
            }
          ]}
        >
          <View style={st.timelineRow}>
            <Text style={st.timeText}>{formatTime(currentTime)}</Text>

            <TouchableOpacity
              activeOpacity={1}
              style={st.trackTouchArea}
              onPress={handleTimelinePress}
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            >
              <View style={st.track}>
                <View style={[st.fill, { width: `${progress * 100}%` }]} />
                <View style={[st.thumb, { left: `${Math.max(0, Math.min(98, progress * 100))}%` }]} />
              </View>
            </TouchableOpacity>

            <Text style={st.timeText}>{formatTime(duration)}</Text>
          </View>

          <View style={st.bottomControlsRow}>
            {/* Left Controls: Mute */}
            <View style={st.bottomGroupLeft}>
              <TouchableOpacity
                onPress={toggleMute}
                style={st.iconBtnSmall}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Center Controls: Rewind, Play/Pause, Forward */}
            <View style={st.bottomGroupCenter}>
              <TouchableOpacity
                onPress={() => handleSeek(-10)}
                style={st.bottomBtn}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                activeOpacity={0.7}
              >
                <Ionicons name="play-back" size={26} color="#FFFFFF" />
                <Text style={st.btnLabel}>-10s</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayPause}
                style={st.mainPlayBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color="#FFFFFF"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSeek(10)}
                style={st.bottomBtn}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward" size={26} color="#FFFFFF" />
                <Text style={st.btnLabel}>+10s</Text>
              </TouchableOpacity>
            </View>

            {/* Right Controls: Speed & Fullscreen / Landscape Toggle */}
            <View style={st.bottomGroupRight}>
              <TouchableOpacity onPress={toggleSpeed} style={st.speedBadge} activeOpacity={0.7}>
                <Text style={st.speedText}>{playbackSpeed}x</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleOrientation}
                style={st.iconBtnSmall}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name={isLandscape ? 'fullscreen-exit' : 'fullscreen'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {isLoading && !isError && (
        <View style={st.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={st.loadingText}>Loading video stream...</Text>
        </View>
      )}

      {isError && (
        <View style={st.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={54} color="#EF4444" />
          <Text style={st.errorTitle}>Playback Error</Text>
          <Text style={st.errorText}>Video load failed. The direct link may have expired or format is unsupported.</Text>
          <View style={st.errorBtns}>
            <TouchableOpacity style={st.retryBtn} onPress={handleRetry}>
              <Ionicons name="refresh" size={16} color="#FFF" />
              <Text style={st.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.backBtn2} onPress={handleClose}>
              <Ionicons name="arrow-back" size={16} color="#94A3B8" />
              <Text style={st.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function PlayerScreen({ visible, url, fallbackUrl, headers, name, onClose, isPremium }) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {visible && url ? (
        <InnerPlayer url={url} fallbackUrl={fallbackUrl} name={name} headers={headers} onClose={onClose} isPremium={isPremium} />
      ) : (
        <View style={st.root}><StatusBar hidden /><ActivityIndicator size="large" color="#FFF" /></View>
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', position: 'relative' },
  videoView: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 10,
    elevation: 10,
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20,
    flexDirection: 'row', alignItems: 'center', paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  iconBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  title: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '700', marginHorizontal: 12 },
  topRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speedBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(99, 102, 241, 0.8)',
  },
  speedText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  bottomContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, elevation: 20,
    backgroundColor: 'rgba(0,0,0,0.85)', paddingTop: 14,
  },
  timelineRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
  },
  timeText: { color: '#FFF', fontSize: 12, fontWeight: '600', minWidth: 44, textAlign: 'center' },
  trackTouchArea: { flex: 1, height: 32, justifyContent: 'center', marginHorizontal: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', position: 'relative', justifyContent: 'center' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#6366F1' },
  thumb: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#FFFFFF', marginLeft: -7, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 3,
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  bottomGroupLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  bottomGroupCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, flex: 2 },
  bottomGroupRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flex: 1 },
  iconBtnSmall: { padding: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  bottomBtn: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  btnLabel: { color: '#CBD5E1', fontSize: 10, fontWeight: '700', marginTop: 2 },
  mainPlayBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  loadingText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 12 },
  errorOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.92)', paddingHorizontal: 36 },
  errorTitle: { color: '#EF4444', fontSize: 18, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  errorText: { color: '#94A3B8', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  errorBtns: { flexDirection: 'row', marginTop: 20, gap: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, gap: 6 },
  retryText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  backBtn2: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 6 },
  backText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
});
