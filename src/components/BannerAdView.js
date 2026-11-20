import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useIsFocused } from '@react-navigation/native';

/**
 * Robust Banner Ad Component:
 * - Does NOT permanently vanish when an ad fails to load (No Fill, network blip, etc.)
 * - Retries loading with a safe 20s cooldown timer so ads recover automatically
 * - Auto-reloads when the user switches back to the tab if the ad was previously missing/errored
 * - Supports delay prop to stagger requests (prevents AdMob collisions when multiple banners exist)
 * - Keeps container hidden (zero height, no blank borders) until the ad actually loads
 * - Completely unmounts/disabled for VIP/Premium users
 */
export default function BannerAdView({
  unitId,
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  isPremium = false,
  delay = 0,
  containerStyle,
}) {
  const isFocused = useIsFocused();
  const [canLoad, setCanLoad] = useState(delay === 0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retryTimerRef = useRef(null);
  const delayTimerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const lastAttemptRef = useRef(Date.now());

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  // Handle delay prop for staggering ad requests (e.g. HomeScreen top banner)
  useEffect(() => {
    if (isPremium) return;

    if (delay > 0 && !canLoad) {
      if (isFocused) {
        delayTimerRef.current = setTimeout(() => {
          setCanLoad(true);
        }, delay);
      }
    }

    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [isFocused, delay, isPremium, canLoad]);

  // When screen comes into focus, safely reload ONLY if not loaded and 15s have passed (prevents rapid loops)
  useEffect(() => {
    if (isPremium || !canLoad) return;

    if (isFocused) {
      const now = Date.now();
      if (!isLoaded && !hasLoadedOnceRef.current && (now - lastAttemptRef.current > 15000)) {
        lastAttemptRef.current = now;
        setHasError(false);
        setReloadKey((prev) => prev + 1);
      }
    } else {
      // Screen lost focus: cancel pending retry timer
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }
  }, [isFocused, isPremium, canLoad, isLoaded]);

  // VIP users never see ads
  if (isPremium) {
    return null;
  }

  // Not ready to load yet (delay timer running)
  if (!canLoad) {
    return null;
  }

  const handleAdLoaded = (payload) => {
    console.log(`[AdMob Banner] SUCCESS LOADED (${unitId}):`, payload);
    hasLoadedOnceRef.current = true;
    setIsLoaded(true);
    setHasError(false);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const handleAdFailedToLoad = (error) => {
    console.log(`[AdMob Banner] Failed to load (${unitId}):`, error?.message || error);
    setIsLoaded(false);
    setHasError(true);
    lastAttemptRef.current = Date.now();

    // Schedule automatic retry after 30s cooldown (never spam AdMob servers)
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      lastAttemptRef.current = Date.now();
      setHasError(false);
      setReloadKey((prev) => prev + 1);
    }, 30000);
  };

  return (
    <View
      style={[
        styles.baseContainer,
        containerStyle,
        isLoaded ? styles.loadedContainer : styles.hiddenContainer,
      ]}
    >
      <BannerAd
        key={`${unitId}-${reloadKey}`}
        unitId={unitId}
        size={size}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdFailedToLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  baseContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadedContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 4,
  },
  hiddenContainer: {
    height: 0,
    minHeight: 0,
    maxHeight: 0,
    overflow: 'hidden',
    opacity: 0,
    paddingVertical: 0,
    borderTopWidth: 0,
    borderWidth: 0,
  },
});

