import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

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

function InnerPlayer({ url, name, headers, onClose }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const videoSource = useMemo(() => ({
    uri: url,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Referer': 'https://www.1024terabox.com/',
      'Accept': '*/*',
      ...(headers || {}),
    },
  }), [url, headers]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.playbackRate = 1.0;
    p.loop = false;
    p.play();
  });

  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [trackWidth, setTrackWidth] = useState(0);

  // AdMob Rewarded Ads Instances & State
  const [videoCompleteAdLoaded, setVideoCompleteAdLoaded] = useState(false);
  const [playerCloseAdLoaded, setPlayerCloseAdLoaded] = useState(false);
  const videoCompleteShownRef = useRef(false);
  const videoCompleteAdRef = useRef(null);
  const playerCloseAdRef = useRef(null);

  const hideTimerRef = useRef(null);

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // Initialize and load Video Complete Rewarded Ad (ID: ca-app-pub-9717309889631554/7595830621)
  useEffect(() => {
    const completeAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.VIDEO_COMPLETE, {
      requestNonPersonalizedAdsOnly: true,
    });
    videoCompleteAdRef.current = completeAd;

    const unsubs = [
      completeAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] Video Complete Rewarded Ad loaded.');
        setVideoCompleteAdLoaded(true);
      }),
      completeAd.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Video Complete Ad closed. Preloading next...');
        setVideoCompleteAdLoaded(false);
        completeAd.load();
      }),
      completeAd.addAdEventListener(AdEventType.ERROR, (error) => {
        console.log('[AdMob] Video Complete Ad load error:', error);
        setVideoCompleteAdLoaded(false);
      }),
    ];

    completeAd.load();

    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, []);

  // Initialize and load Player Close Rewarded Ad (ID: ca-app-pub-9717309889631554/5799533226)
  useEffect(() => {
    const closeAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.PLAYER_CLOSE, {
      requestNonPersonalizedAdsOnly: true,
    });
    playerCloseAdRef.current = closeAd;

    const unsubs = [
      closeAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('[AdMob] Player Close Rewarded Ad loaded.');
        setPlayerCloseAdLoaded(true);
      }),
      closeAd.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('[AdMob] Player Close Ad closed. Exiting player.');
        onClose();
      }),
      closeAd.addAdEventListener(AdEventType.ERROR, (error) => {
        console.log('[AdMob] Player Close Ad error:', error);
        onClose();
      }),
    ];

    closeAd.load();

    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [onClose]);

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

  // Video status & duration synchronization
  useEffect(() => {
    console.log('[PLAYER] statusChange:', status, '| dur:', player.duration);
    if (status === 'readyToPlay' && player.duration > 0) {
      setDuration(player.duration);
    }
    if (status === 'error') {
      console.error('[PLAYER] Error:', player.error);
    }
  }, [status, player]);

  // Decoupled timeline progress updater & Video Completion Trigger
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (player) {
        const cur = player.currentTime || 0;
        const dur = player.duration || duration || 0;
        setCurrentTime(cur);

        if (dur > 0 && duration === 0) {
          setDuration(dur);
        }

        // Trigger Video Completion Ad when video reaches end
        if (dur > 0 && cur >= dur - 0.8 && !videoCompleteShownRef.current) {
          videoCompleteShownRef.current = true;
          console.log('[PLAYER] Video completed! Triggering Video Complete Rewarded Ad...');
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

        // Reset completion flag if user seeks back before end
        if (dur > 0 && cur < dur - 2.0 && videoCompleteShownRef.current) {
          videoCompleteShownRef.current = false;
        }
      }
    }, 250);
    return () => clearInterval(intervalId);
  }, [player, duration, videoCompleteAdLoaded]);

  // Auto-hide when playing
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
      if (next) {
        if (player && player.playing) {
          startHideTimer(5000);
        }
      } else {
        clearHideTimer();
      }
      return next;
    });
  }, [player, startHideTimer, clearHideTimer]);

  const handlePlayPause = useCallback(() => {
    if (!player) return;
    if (player.playing) {
      console.log('[PLAYER] Pause pressed');
      player.pause();
      clearHideTimer();
      setShowControls(true);
    } else {
      console.log('[PLAYER] Play pressed');
      if (duration > 0 && currentTime >= duration - 0.5) {
        player.currentTime = 0;
        setCurrentTime(0);
        videoCompleteShownRef.current = false;
      }
      player.play();
      setShowControls(true);
      startHideTimer(5000);
    }
  }, [player, duration, currentTime, startHideTimer, clearHideTimer]);

  const handleSeek = useCallback((offset) => {
    if (!player) return;
    const cur = player.currentTime || currentTime || 0;
    const target = Math.max(0, Math.min(duration || 999999, cur + offset));
    console.log('[PLAYER] Seeking by', offset, 'to', target);
    player.currentTime = target;
    setCurrentTime(target);
    setShowControls(true);
    if (target < (duration || 999999) - 2) {
      videoCompleteShownRef.current = false;
    }
    if (player.playing) {
      startHideTimer(5000);
    }
  }, [player, duration, currentTime, startHideTimer]);

  const handleTimelinePress = useCallback((e) => {
    if (!player || trackWidth <= 0 || duration <= 0) return;
    const { locationX } = e.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const targetTime = ratio * duration;
    console.log('[PLAYER] Timeline pressed at ratio', ratio, '-> time:', targetTime);
    player.currentTime = targetTime;
    setCurrentTime(targetTime);
    setShowControls(true);
    if (targetTime < duration - 2) {
      videoCompleteShownRef.current = false;
    }
    if (player.playing) {
      startHideTimer(5000);
    }
  }, [player, trackWidth, duration, startHideTimer]);

  const toggleSpeed = useCallback(() => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    console.log('[PLAYER] Speed changed to:', nextSpeed);
    setPlaybackSpeed(nextSpeed);
    if (player) player.playbackRate = nextSpeed;
    setShowControls(true);
    if (player && player.playing) {
      startHideTimer(5000);
    }
  }, [player, playbackSpeed, startHideTimer]);

  // Handle player close ('X' cross button) with Player Close Rewarded Ad
  const handleClose = useCallback(() => {
    console.log('[PLAYER] Close pressed. Checking player close ad...');
    clearHideTimer();
    if (player) player.pause();

    if (playerCloseAdRef.current && playerCloseAdLoaded) {
      try {
        console.log('[AdMob] Showing Player Close Rewarded Ad...');
        playerCloseAdRef.current.show();
        return;
      } catch (err) {
        console.log('[AdMob] Error showing close ad:', err.message);
      }
    }
    onClose();
  }, [player, clearHideTimer, playerCloseAdLoaded, onClose]);

  const isLoading = (status === 'loading' || status === 'idle') && duration === 0;
  const isError = status === 'error';
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View style={st.root}>
      <StatusBar hidden />
      
      {/* 1. Base Native Video View */}
      <VideoView
        player={player}
        style={st.videoView}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically={false}
      />

      {/* 2. Fullscreen Tap Detector using direct native onTouchEnd */}
      <View 
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: showControls ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.01)' }
        ]} 
        onTouchEnd={() => {
          console.log('[PLAYER] onTouchEnd triggered!');
          toggleControls();
        }}
      />

      {/* 3. Top Header Bar */}
      {showControls && !isError && (
        <View 
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
          
          <TouchableOpacity onPress={toggleSpeed} style={st.speedBadge} activeOpacity={0.7}>
            <Text style={st.speedText}>{playbackSpeed}x</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. Bottom Footer Bar: Timeline & Playback Buttons */}
      {showControls && !isError && (
        <View 
          style={[
            st.bottomContainer, 
            { 
              paddingBottom: isLandscape ? 16 : Math.max(insets.bottom, 16) + 12,
              paddingHorizontal: isLandscape ? Math.max(insets.left, insets.right, 24) : 16 
            }
          ]}
        >
          {/* Interactive Scrubbing Timeline */}
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

          {/* Bottom Actions Row */}
          <View style={st.bottomControlsRow}>
            <TouchableOpacity 
              onPress={() => handleSeek(-10)} 
              style={st.bottomBtn} 
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              activeOpacity={0.7}
            >
              <Ionicons name="play-back" size={28} color="#FFFFFF" />
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
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              activeOpacity={0.7}
            >
              <Ionicons name="play-forward" size={28} color="#FFFFFF" />
              <Text style={st.btnLabel}>+10s</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. Loading Spinner Overlay */}
      {isLoading && !isError && (
        <View style={st.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={st.loadingText}>Loading video stream...</Text>
        </View>
      )}

      {/* 5. Playback Error Overlay */}
      {isError && (
        <View style={st.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={54} color="#EF4444" />
          <Text style={st.errorTitle}>Playback Error</Text>
          <Text style={st.errorText}>Video load failed. The direct link may have expired or format is unsupported.</Text>
          <View style={st.errorBtns}>
            <TouchableOpacity style={st.retryBtn} onPress={() => player.replace(videoSource)}>
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

export default function PlayerScreen({ visible, url, headers, name, onClose }) {
  return (
    <Modal 
      visible={visible} 
      animationType="fade" 
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {visible && url ? (
        <InnerPlayer url={url} name={name} headers={headers} onClose={onClose} />
      ) : (
        <View style={st.root}><StatusBar hidden /><ActivityIndicator size="large" color="#FFF" /></View>
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', position: 'relative' },
  videoView: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  controlsWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  controlsDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  iconBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  title: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '700', marginHorizontal: 12 },
  speedBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, backgroundColor: 'rgba(99, 102, 241, 0.8)',
  },
  speedText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingTop: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeText: { color: '#FFF', fontSize: 12, fontWeight: '600', minWidth: 44, textAlign: 'center' },
  trackTouchArea: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#6366F1' },
  thumb: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#FFFFFF',
    marginLeft: -7,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  bottomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 46,
    marginTop: 2,
  },
  bottomBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  btnLabel: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  mainPlayBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
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


