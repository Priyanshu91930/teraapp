import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DOWNLOAD_COUNT_KEY = '@teraapp_successful_downloads_count';

export async function checkAndPromptInAppReview() {
  try {
    const countStr = await AsyncStorage.getItem(DOWNLOAD_COUNT_KEY);
    const count = (parseInt(countStr || '0', 10)) + 1;
    await AsyncStorage.setItem(DOWNLOAD_COUNT_KEY, String(count));

    console.log(`[StoreReview] Successful downloads count: ${count}`);

    // Request review on 1st download, 3rd download, and every 10 downloads
    if (count === 1 || count === 3 || count % 10 === 0) {
      if (await StoreReview.hasAction()) {
        console.log('[StoreReview] Triggering Play Store In-App Review...');
        await StoreReview.requestReview();
      }
    }
  } catch (err) {
    console.log('[StoreReview] Error triggering review:', err.message);
  }
}

export async function openDirectPlayStorePage() {
  const storeUrl = 'market://details?id=com.anihub.teradownloader';
  const webUrl = 'https://play.google.com/store/apps/details?id=com.anihub.teradownloader';
  try {
    const supported = await Linking.canOpenURL(storeUrl);
    if (supported) {
      await Linking.openURL(storeUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (e) {
    await Linking.openURL(webUrl).catch(() => {});
  }
}
