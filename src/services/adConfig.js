import { TestIds } from 'react-native-google-mobile-ads';

// Use real AdMob ads in production (Play Store release), test ads only in dev
// Real AdMob ads only serve when app is live on Play Store
const USE_REAL_ADS = __DEV__ ? false : true;

export const AD_UNIT_IDS = {
  // ── 5 REAL ADMOB BANNER AD UNITS ──
  BANNER_1: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/9519447114' : TestIds.ADAPTIVE_BANNER, // banner (Home Bottom)
  BANNER_2: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/6521426258' : TestIds.ADAPTIVE_BANNER, // banner2 (Home Top)
  BANNER_3: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/2377529080' : TestIds.ADAPTIVE_BANNER, // banner3 (Download Screen)
  BANNER_4: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/1544783392' : TestIds.ADAPTIVE_BANNER, // banner4 (History Screen)
  BANNER_5: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/9016079302' : TestIds.ADAPTIVE_BANNER, // banner5 (Settings Screen)

  // ── APP OPEN & REWARDED AD UNITS ──
  APP_OPEN: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/6482220233' : TestIds.APP_OPEN,
  REWARDED: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/5987396214' : TestIds.REWARDED,
  REWARDED_WATCH: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/9547488389' : TestIds.REWARDED,
  VIDEO_COMPLETE: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/7595830621' : TestIds.REWARDED,
  PLAYER_CLOSE: USE_REAL_ADS ? 'ca-app-pub-9717309889631554/5799533226' : TestIds.REWARDED,
};
